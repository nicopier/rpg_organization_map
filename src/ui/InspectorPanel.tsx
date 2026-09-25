import { useState } from 'react'
import { assetUrl, getAsset } from '../assets/catalog'
import { effectivePermission, findCharacter, findItem, findLayer } from '../model/queries'
import { TOKEN_ASSET, type Character, type Layer, type Permission, type Placement, type Visibility, type WallKind } from '../model/types'
import { effectiveVisibility } from '../model/visibility'
import { hpColor, initials } from '../render/layers/tokenGraphic'
import {
  addToCombat,
  applyHp,
  baseSize,
  MAX_ITEM_CELLS,
  moveItemsToLayer,
  resizeItems,
  setItemsVisibility,
  updateCharacter,
  updateItem,
  updateWall,
} from '../state/actions'
import { useMap } from '../state/mapStore'
import { duplicateSelection, flipSelection, removeSelection, rotateSelection } from './commands'
import { ColorSwatches, CommitNumber, CommitText, groupWhileDragging } from './fields'
import { Icon } from './Icon'
import { ImagePicker } from './ImagePicker'
import { NoteEditor } from './NoteEditor'

const PERMISSION_OPTIONS: { value: Permission; label: string }[] = [
  { value: 'static', label: 'Inamovible' },
  { value: 'dm', label: 'Lo mueve el DM' },
  { value: 'owner', label: 'Lo mueve su dueño' },
]

export const CONDITIONS = [
  'Agarrado',
  'Apresado',
  'Asustado',
  'Aturdido',
  'Cegado',
  'Concentrado',
  'Derribado',
  'Ensordecido',
  'Envenenado',
  'Hechizado',
  'Incapacitado',
  'Inconsciente',
  'Invisible',
  'Paralizado',
  'Petrificado',
]

const WALL_KIND_LABEL: Record<WallKind, string> = { wall: 'Muro', door: 'Puerta', secretDoor: 'Puerta secreta', window: 'Ventana' }

export function InspectorPanel() {
  const selection = useMap((s) => s.selection)
  const doc = useMap((s) => s.doc)
  const viewer = useMap((s) => s.viewer)

  if (selection.type === 'wall') {
    const layer = findLayer(doc, selection.layerId)
    const piece = layer?.walls?.[selection.key]
    if (layer && piece) return <WallInspector layer={layer} wkey={selection.key} />
  }

  if (selection.type === 'items') {
    const found = selection.ids.map((id) => findItem(doc, id)).filter(Boolean) as { layer: Layer; item: Placement }[]
    if (found.length === 1) return <ItemInspector layer={found[0].layer} item={found[0].item} />
    if (found.length > 1) return <MultiInspector found={found} />
  }

  return (
    <div className="inspector empty">
      <p>Seleccioná algo en el mapa para ver sus datos.</p>
      {viewer === 'dm' && (
        <ul className="shortcuts">
          <li>
            <kbd>R</kbd> rotar · <kbd>F</kbd> espejar · <kbd>H</kbd> ocultar/revelar · <kbd>+</kbd>/<kbd>−</kbd> tamaño
          </li>
          <li>
            <kbd>Ctrl+D</kbd> duplicar · <kbd>Supr</kbd> borrar · flechas mueven
          </li>
          <li>
            Mover la vista: herramienta Mano, clic derecho + arrastrar, o <kbd>Espacio</kbd>+arrastrar
          </li>
          <li>
            <kbd>P</kbd> vista de jugador
          </li>
        </ul>
      )}
    </div>
  )
}

/* ---------- Visibilidad y permisos, compartido ---------- */

function VisibilityControl({
  vis,
  inherited,
  layerVis,
  onChange,
}: {
  vis: Visibility
  inherited: boolean
  layerVis: Visibility
  onChange: (v: Visibility | undefined) => void
}) {
  const hidden = vis === 'dm'
  return (
    <div className={`visibility${hidden ? ' is-hidden' : ''}`}>
      <div className="vis-state">
        <Icon name={hidden ? 'eyeOff' : 'eye'} size={16} />
        <span>{hidden ? 'Oculto para los jugadores' : 'Visible para los jugadores'}</span>
        {inherited && <small>(de la capa)</small>}
      </div>
      {hidden ? (
        <button className="reveal" onClick={() => onChange('all')}>
          <Icon name="eye" size={16} /> Revelar a los jugadores
        </button>
      ) : (
        <button onClick={() => onChange('dm')}>
          <Icon name="eyeOff" size={16} /> Ocultar a los jugadores
        </button>
      )}
      {!inherited && vis !== layerVis && (
        <button className="link" onClick={() => onChange(undefined)}>
          Volver a lo que dice la capa
        </button>
      )}
    </div>
  )
}

function PermissionControl({ item, layer }: { item: Placement; layer: Layer }) {
  const layerLabel = PERMISSION_OPTIONS.find((o) => o.value === layer.permission)!.label
  return (
    <label>
      Quién lo mueve en partida
      <select
        value={item.permission ?? ''}
        onChange={(e) => updateItem(item.id, { permission: (e.target.value || undefined) as Permission | undefined })}
      >
        <option value="">Como la capa ({layerLabel})</option>
        {PERMISSION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Un objeto puede pasar de decorado (Objetos) a marca de la sesión (Juego) y viceversa. Los tokens no cambian de capa. */
function LayerControl({ item, layer }: { item: Placement; layer: Layer }) {
  const layers = useMap((s) => s.doc.layers)
  const isToken = item.assetId === TOKEN_ASSET
  if (isToken) return null
  const options = [...layers].reverse().filter((l) => (l.kind === 'object' || l.kind === 'game') && (!l.locked || l.id === layer.id))
  if (options.length < 2) return null
  return (
    <label>
      Capa
      <select
        value={layer.id}
        onChange={(e) => {
          moveItemsToLayer([item.id], e.target.value)
          useMap.getState().setUi({ activeLayerId: e.target.value })
        }}
      >
        {options.map((l) => (
          <option key={l.id} value={l.id}>
            {l.kind === 'game' ? 'Juego (marca de la sesión)' : 'Objetos (diseño del mapa)'}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ---------- Tamaño ---------- */

/** Presets en casillas. El resto se pone a mano en los campos. */
const SIZE_PRESETS: [number, number][] = [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
  [3, 3],
]

/**
 * Cambia el footprint de los objetos seleccionados. Los tokens de personaje no se redimensionan
 * (los filtra `resizeItems`), así que el control no se muestra para ellos.
 */
function SizeControl({ items }: { items: Placement[] }) {
  const grid = useMap((s) => s.doc.grid)
  const ids = items.map((i) => i.id)
  const one = items.length === 1 ? items[0] : null
  // Con varios seleccionados sólo se muestra un valor si coinciden todos.
  const sameW = items.every((i) => i.w === items[0].w) ? items[0].w : null
  const sameH = items.every((i) => i.h === items[0].h) ? items[0].h : null
  // Cuánto se puede agrandar sin que el que está más al borde se salga del mapa.
  const maxW = Math.min(MAX_ITEM_CELLS, ...items.map((i) => grid.cols - i.x))
  const maxH = Math.min(MAX_ITEM_CELLS, ...items.map((i) => grid.rows - i.y))
  const isPreset = (w: number, h: number) => sameW === w && sameH === h

  return (
    <section className="size-box">
      <div className="section-head">
        <h4>Tamaño en casillas</h4>
        {one && (sameW !== baseSize(one).w || sameH !== baseSize(one).h) && (
          <button className="link" onClick={() => resizeItems(ids, baseSize(one))}>
            Volver al original
          </button>
        )}
      </div>

      <div className="chips sizes">
        {SIZE_PRESETS.map(([w, h]) => (
          <button
            key={`${w}x${h}`}
            className={isPreset(w, h) ? 'on' : ''}
            disabled={w > maxW || h > maxH}
            title={w > maxW || h > maxH ? 'No entra: se saldría del mapa' : `${w}×${h} casillas`}
            onClick={() => resizeItems(ids, { w, h })}
          >
            {w}×{h}
          </button>
        ))}
      </div>

      <div className="size-fields">
        <label>
          Ancho
          <CommitNumber
            value={sameW ?? 0}
            min={1}
            max={maxW}
            onCommit={(v) => resizeItems(ids, (it) => ({ w: v, h: it.h }))}
            aria-label="Ancho en casillas"
          />
        </label>
        <span className="times">×</span>
        <label>
          Alto
          <CommitNumber
            value={sameH ?? 0}
            min={1}
            max={maxH}
            onCommit={(v) => resizeItems(ids, (it) => ({ w: it.w, h: v }))}
            aria-label="Alto en casillas"
          />
        </label>
        <button
          title="Achicar (tecla −)"
          disabled={sameW === 1 && sameH === 1}
          onClick={() => resizeItems(ids, (it) => ({ w: it.w - 1, h: it.h - 1 }))}
        >
          −
        </button>
        <button
          title="Agrandar (tecla +)"
          disabled={(sameW ?? 1) >= maxW && (sameH ?? 1) >= maxH}
          onClick={() => resizeItems(ids, (it) => ({ w: it.w + 1, h: it.h + 1 }))}
        >
          +
        </button>
      </div>
      {items.length > 1 && (sameW === null || sameH === null) && <p className="hint">Los seleccionados tienen tamaños distintos.</p>}
    </section>
  )
}

/* ---------- Un objeto o token ---------- */

function ItemInspector({ layer, item }: { layer: Layer; item: Placement }) {
  const doc = useMap((s) => s.doc)
  const party = useMap((s) => s.campaign.party)
  const viewer = useMap((s) => s.viewer)
  const ch = findCharacter(doc, item.characterId, party)
  const asset = getAsset(item.assetId)
  const vis = effectiveVisibility(item, layer)
  const isToken = item.assetId === TOKEN_ASSET

  return (
    <div className="inspector">
      <div className="insp-head">
        {isToken ? (
          <span className="token-dot" style={{ background: ch?.color ?? '#888' }}>
            {initials(ch?.name ?? '?')}
          </span>
        ) : asset ? (
          <img src={assetUrl(asset)} alt="" />
        ) : (
          <span className="token-dot missing">?</span>
        )}
        <div>
          <strong>{ch?.name ?? asset?.label ?? item.assetId}</strong>
          <span>
            Capa {layer.name} · {item.w}×{item.h} en ({item.x + 1}, {item.y + 1})
          </span>
        </div>
      </div>

      {ch && <CharacterSheet ch={ch} />}

      {!isToken && viewer === 'dm' && (
        <section className="dm-note">
          <span className="label">
            <Icon name="note" size={14} /> Notas y datos del DM
          </span>
          <NoteEditor key={item.id} itemId={item.id} note={item.note} />
        </section>
      )}

      <section>
        <VisibilityControl
          vis={vis}
          inherited={item.visibility === undefined}
          layerVis={layer.visibility}
          onChange={(v) => setItemsVisibility([item.id], v)}
        />
      </section>

      {!isToken && <SizeControl items={[item]} />}

      <section className="form">
        <LayerControl item={item} layer={layer} />
        <PermissionControl item={item} layer={layer} />
        {!isToken && (
          <label>
            Opacidad: {Math.round((item.opacity ?? 1) * 100)}%
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={item.opacity ?? 1}
              onChange={(e) => updateItem(item.id, { opacity: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })}
              {...groupWhileDragging}
            />
          </label>
        )}
      </section>

      <div className="insp-actions">
        {!isToken && (
          <>
            <button onClick={rotateSelection} title="Rotar (R)">
              <Icon name="rotate" size={16} /> Rotar
            </button>
            <button onClick={flipSelection} title="Espejar (F)">
              <Icon name="flip" size={16} /> Espejar
            </button>
          </>
        )}
        <button onClick={duplicateSelection} title="Duplicar (Ctrl+D)">
          <Icon name="copy" size={16} /> Duplicar
        </button>
        <button className="danger" onClick={removeSelection} title="Borrar (Supr)">
          <Icon name="trash" size={16} /> Borrar
        </button>
      </div>
    </div>
  )
}

/* ---------- Ficha ---------- */

export function CharacterSheet({ ch }: { ch: Character }) {
  const players = useMap((s) => s.campaign.players)
  const isDm = useMap((s) => s.role === 'dm')
  const combat = useMap((s) => s.doc.combat)
  const [amount, setAmount] = useState('')
  const ratio = ch.hp.max > 0 ? Math.max(0, Math.min(1, ch.hp.cur / ch.hp.max)) : 0
  const inCombat = combat.order.some((e) => e.characterId === ch.id)
  const up = (fn: (c: Character) => void) => updateCharacter(ch.id, fn)

  const apply = (sign: 1 | -1) => {
    const n = Math.abs(Math.round(Number(amount)))
    if (!n) return
    applyHp(ch.id, sign * n)
    setAmount('')
  }

  return (
    <section className="sheet">
      <div className="form">
        <ImagePicker value={ch.image} color={ch.color} onChange={(image) => up((c) => {
          if (image) c.image = image
          else delete c.image
        })} />
        <label>
          Nombre
          <CommitText value={ch.name} onCommit={(v) => up((c) => void (c.name = v.trim() || c.name))} />
        </label>
      </div>

      <div className={`hp-box${ch.hp.cur <= 0 ? ' down' : ''}`}>
        <div className="hp-top">
          <span className="hp-label">
            <Icon name="heart" size={15} /> HP
          </span>
          <span className="hp-num">
            <CommitNumber
              className="hp-cur"
              value={ch.hp.cur}
              min={0}
              max={ch.hp.max}
              onCommit={(v) => up((c) => void (c.hp.cur = v))}
              aria-label="HP actual"
            />
            <span>/</span>
            <CommitNumber
              className="hp-max"
              value={ch.hp.max}
              min={1}
              onCommit={(v) => up((c) => {
                c.hp.max = v
                c.hp.cur = Math.min(c.hp.cur, v)
              })}
              aria-label="HP máximo"
            />
          </span>
          {ch.hp.temp > 0 && <span className="hp-temp">+{ch.hp.temp} temp</span>}
        </div>
        <div className="hp-bar">
          <div style={{ width: `${ratio * 100}%`, background: `#${hpColor(ratio).toString(16).padStart(6, '0')}` }} />
        </div>
        {ch.hp.cur <= 0 && <p className="down-note">{ch.kind === 'pc' ? 'Caído: tiradas de muerte' : 'Derrotado'}</p>}
        <div className="hp-apply">
          <button className="dmg" onClick={() => apply(-1)} disabled={!amount}>
            Daño
          </button>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply(e.shiftKey ? 1 : -1)
            }}
            aria-label="Cantidad de daño o curación"
            title="Enter: daño · Shift+Enter: curar"
          />
          <button className="heal" onClick={() => apply(1)} disabled={!amount}>
            Curar
          </button>
        </div>
        <div className="hp-quick">
          {[-5, -1, 1, 5].map((n) => (
            <button key={n} onClick={() => applyHp(ch.id, n)}>
              {n > 0 ? `+${n}` : n}
            </button>
          ))}
          <label title="HP temporal">
            Temp
            <CommitNumber value={ch.hp.temp} min={0} onCommit={(v) => up((c) => void (c.hp.temp = v))} />
          </label>
        </div>
      </div>

      <div className="stats">
        <label>
          <span>
            <Icon name="shield" size={14} /> CA
          </span>
          <CommitNumber value={ch.ac} onCommit={(v) => up((c) => void (c.ac = v))} />
        </label>
        <label>
          Vel.
          <CommitNumber value={ch.speed} min={0} onCommit={(v) => up((c) => void (c.speed = v))} />
        </label>
        <label>
          Inic.
          <CommitNumber value={ch.initiativeMod} onCommit={(v) => up((c) => void (c.initiativeMod = v))} />
        </label>
      </div>

      <div className="form">
        <div className="row">
          {isDm && ch.kind === 'pc' && (
            <label>
              Lo controla
              <select value={ch.owner} onChange={(e) => up((c) => void (c.owner = e.target.value))}>
                <option value="dm">El DM</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div>
          <span className="label">Color</span>
          <ColorSwatches value={ch.color} onChange={(color) => up((c) => void (c.color = color))} />
        </div>
      </div>

      <div>
        <span className="label">Condiciones</span>
        <div className="conditions">
          {CONDITIONS.map((cond) => {
            const on = ch.conditions.includes(cond)
            return (
              <button
                key={cond}
                className={on ? 'on' : ''}
                aria-pressed={on}
                onClick={() => up((c) => void (c.conditions = on ? c.conditions.filter((x) => x !== cond) : [...c.conditions, cond]))}
              >
                {cond}
              </button>
            )
          })}
        </div>
      </div>

      <label className="notes">
        Notas
        <NotesField value={ch.notes} onCommit={(v) => up((c) => void (c.notes = v))} />
      </label>

      {isDm && combat.active && !inCombat && (
        <button className="primary block" onClick={() => addToCombat(ch.id)}>
          <Icon name="sword" size={16} /> Sumar al combate
        </button>
      )}
    </section>
  )
}

function NotesField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [last, setLast] = useState(value)
  if (value !== last) {
    setLast(value)
    setV(value)
  }
  return (
    <textarea
      rows={3}
      value={v}
      placeholder="Tácticas, botín, lo que dijo en la taberna…"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  )
}

/* ---------- Varios ---------- */

function MultiInspector({ found }: { found: { layer: Layer; item: Placement }[] }) {
  const allHidden = found.every((f) => effectiveVisibility(f.item, f.layer) === 'dm')
  const ids = found.map((f) => f.item.id)
  // Los tokens de personaje no se redimensionan; si la selección los mezcla, se ignoran acá.
  const resizable = found.map((f) => f.item).filter((i) => i.assetId !== TOKEN_ASSET)
  const perms = new Set(found.map((f) => effectivePermission(f.item, f.layer)))
  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="token-dot multi">{found.length}</span>
        <div>
          <strong>{found.length} seleccionados</strong>
          <span>{perms.size === 1 ? PERMISSION_OPTIONS.find((o) => o.value === [...perms][0])!.label : 'Permisos mezclados'}</span>
        </div>
      </div>
      <section>
        <div className={`visibility${allHidden ? ' is-hidden' : ''}`}>
          {allHidden ? (
            <button className="reveal" onClick={() => setItemsVisibility(ids, 'all')}>
              <Icon name="eye" size={16} /> Revelar todos
            </button>
          ) : (
            <button onClick={() => setItemsVisibility(ids, 'dm')}>
              <Icon name="eyeOff" size={16} /> Ocultar todos a los jugadores
            </button>
          )}
        </div>
      </section>
      {resizable.length > 0 && <SizeControl items={resizable} />}
      <div className="insp-actions">
        <button onClick={rotateSelection}>
          <Icon name="rotate" size={16} /> Rotar
        </button>
        <button onClick={duplicateSelection}>
          <Icon name="copy" size={16} /> Duplicar
        </button>
        <button className="danger" onClick={removeSelection}>
          <Icon name="trash" size={16} /> Borrar
        </button>
      </div>
    </div>
  )
}

/* ---------- Pared ---------- */

function WallInspector({ layer, wkey }: { layer: Layer; wkey: string }) {
  const piece = layer.walls![wkey]
  const vis = effectiveVisibility(piece, layer)
  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="token-dot wall">
          <Icon name="wall" size={18} />
        </span>
        <div>
          <strong>{WALL_KIND_LABEL[piece.kind]}</strong>
          <span>Capa {layer.name}</span>
        </div>
      </div>
      <section>
        <VisibilityControl
          vis={vis}
          inherited={piece.visibility === undefined}
          layerVis={layer.visibility}
          onChange={(v) => updateWall(layer.id, wkey, { visibility: v })}
        />
        {piece.kind === 'secretDoor' && vis === 'dm' && (
          <p className="hint">Mientras esté oculta, los jugadores ven una pared en su lugar.</p>
        )}
      </section>
      <section className="form">
        <label>
          Tipo
          <select value={piece.kind} onChange={(e) => updateWall(layer.id, wkey, { kind: e.target.value as WallKind })}>
            {Object.entries(WALL_KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <div className="insp-actions">
        <button className="danger" onClick={removeSelection}>
          <Icon name="trash" size={16} /> Borrar
        </button>
      </div>
    </div>
  )
}
