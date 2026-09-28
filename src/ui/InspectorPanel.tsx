import { useState } from 'react'
import { assetUrl, getAsset } from '../assets/catalog'
import { effectivePermission, findCharacter, findItem, findLayer } from '../model/queries'
import { TOKEN_ASSET, type Character, type Layer, type Permission, type Placement, type Visibility, type WallKind } from '../model/types'
import { effectiveVisibility } from '../model/visibility'
import { hpColor, initials } from '../render/layers/tokenGraphic'
import {
  addToCombat,
  applyHp,
  applyHpMany,
  baseSize,
  MAX_ITEM_CELLS,
  moveItemsToLayer,
  renameMany,
  resizeItems,
  selectSimilarNpcs,
  sendNpcsToMap,
  setHpMaxMany,
  setItemsHighlight,
  setItemsVisibility,
  updateCharacter,
  updateCharacters,
  updateItem,
  updateWall,
} from '../state/actions'
import { useMap } from '../state/mapStore'
import { getMonster } from '../model/bestiary'
import { pathOf } from '../model/tree'
import { CharacterPdf, MonsterSearch, NpcManualSection, openManual } from './Bestiary'
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

/** Hace brillar los objetos para que los jugadores los encuentren. */
function HighlightButton({ ids, on }: { ids: string[]; on: boolean }) {
  return (
    <button
      className={`highlight-btn${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={() => setItemsHighlight(ids, !on)}
      title={on ? 'Sacarle el brillo (G)' : 'Que brille y lata para que todos lo vean (G)'}
    >
      <Icon name="sparkle" size={16} /> {on ? 'Resaltado · quitar brillo' : 'Resaltar para los jugadores'}
    </button>
  )
}

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

      {/* Lo de cada turno primero: vida, números y estados. */}
      {ch && <CharacterVitals ch={ch} />}

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
        {viewer === 'dm' && <HighlightButton ids={[item.id]} on={!!item.highlight} />}
      </section>

      {ch && <CharacterNotes ch={ch} />}
      {ch && viewer === 'dm' && ch.kind === 'npc' && <NpcManualSection key={ch.id} ch={ch} />}

      {ch && viewer === 'dm' && ch.kind === 'npc' && (
        <section className="form">
          {layer.kind === 'npc' && <SendToMap itemIds={[item.id]} />}
          <button className="block select-similar" onClick={() => selectSimilarNpcs(ch.id)} title="Para editarlos a todos juntos">
            <Icon name="copy" size={15} /> Seleccionar los iguales
          </button>
        </section>
      )}

      {/* Lo que se arma una vez y casi no se toca. */}
      {ch && <CharacterLook ch={ch} />}

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

/** La ficha completa, en orden de uso: vida y números, notas, y al final nombre, imagen y color. */
export function CharacterSheet({ ch }: { ch: Character }) {
  return (
    <div className="sheet">
      <CharacterVitals ch={ch} />
      <CharacterNotes ch={ch} />
      {ch.kind === 'pc' && <CharacterPdf ch={ch} />}
      <CharacterLook ch={ch} />
    </div>
  )
}

/** Lo que se toca en cada turno: HP, CA/Vel/Inic y condiciones. */
function CharacterVitals({ ch }: { ch: Character }) {
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

      {isDm && combat.active && !inCombat && (
        <button className="primary block" onClick={() => addToCombat(ch.id)}>
          <Icon name="sword" size={16} /> Sumar al combate
        </button>
      )}
    </section>
  )
}

function CharacterNotes({ ch }: { ch: Character }) {
  return (
    <label className="notes">
      Notas
      <NotesField value={ch.notes} onCommit={(v) => updateCharacter(ch.id, (c) => void (c.notes = v))} />
    </label>
  )
}

/** Nombre, imagen, dueño y color: se arman una vez, así que van plegados al final. */
function CharacterLook({ ch }: { ch: Character }) {
  const players = useMap((s) => s.campaign.players)
  const isDm = useMap((s) => s.role === 'dm')
  const up = (fn: (c: Character) => void) => updateCharacter(ch.id, fn)
  return (
    <details className="sheet-look">
      <summary>
        <Icon name="token" size={14} /> Nombre, imagen y color
      </summary>
      <div className="form">
        <label>
          Nombre
          <CommitText value={ch.name} onCommit={(v) => up((c) => void (c.name = v.trim() || c.name))} />
        </label>
        <ImagePicker value={ch.image} color={ch.color} onChange={(image) => up((c) => {
          if (image) c.image = image
          else delete c.image
        })} />
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
        <div>
          <span className="label">Color</span>
          <ColorSwatches value={ch.color} onChange={(color) => up((c) => void (c.color = color))} />
        </div>
      </div>
    </details>
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
  const characters = useMap((s) => s.doc.characters)
  const viewer = useMap((s) => s.viewer)
  const npcs = found
    .filter((f) => f.layer.kind === 'npc' && f.item.characterId)
    .map((f) => characters.find((c) => c.id === f.item.characterId))
    .filter((c): c is Character => !!c)
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
        <HighlightButton ids={ids} on={found.every((f) => f.item.highlight)} />
      </section>
      {viewer === 'dm' && npcs.length > 0 && (
        <section className="form">
          <SendToMap itemIds={found.filter((f) => f.layer.kind === 'npc').map((f) => f.item.id)} />
        </section>
      )}
      {viewer === 'dm' && npcs.length > 1 && <MultiNpcSheet chars={npcs} />}
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

/* ---------- Mandar NPCs a otro mapa ---------- */

/** "Enviar a…": los NPC seleccionados se van con su ficha al mapa elegido. */
function SendToMap({ itemIds }: { itemIds: string[] }) {
  const campaign = useMap((s) => s.campaign)
  const mapId = useMap((s) => s.mapId)
  const maps = campaign.maps
    .filter((m) => m.id !== mapId)
    .map((m) => ({ id: m.id, label: pathOf(campaign, m.id).join(' › ') }))
    .sort((a, b) => a.label.localeCompare(b.label))
  if (!maps.length) return null
  return (
    <label className="send-to">
      <span>
        <Icon name="next" size={14} /> Enviar a otro mapa
      </span>
      <select
        value=""
        onChange={(e) => {
          const target = maps.find((m) => m.id === e.target.value)
          if (!target) return
          const n = sendNpcsToMap(itemIds, target.id)
          useMap.getState().toast(n ? `${n === 1 ? 'NPC enviado' : `${n} NPC enviados`} a ${target.label}` : 'No había NPC para mandar')
        }}
      >
        <option value="" disabled>
          Elegí el mapa…
        </option>
        {maps.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ---------- Varios NPC ---------- */

/** El valor si todos coinciden; si no, null ("varios"). */
function common<T>(chars: Character[], get: (c: Character) => T): T | null {
  const v = get(chars[0])
  return chars.every((c) => get(c) === v) ? v : null
}

/** Número que puede estar mezclado: vacío con "varios" hasta que se escribe uno para todos. */
function MixedNumber({ value, onCommit, min, label }: { value: number | null; onCommit: (v: number) => void; min?: number; label: string }) {
  const shown = value === null ? '' : String(value)
  const [v, setV] = useState(shown)
  const [last, setLast] = useState(value)
  if (value !== last) {
    setLast(value)
    setV(shown)
  }
  const commit = () => {
    const n = Math.round(Number(v))
    if (v.trim() === '' || !Number.isFinite(n)) return setV(shown)
    const x = min !== undefined ? Math.max(min, n) : n
    setV(String(x))
    if (x !== value) onCommit(x)
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      value={v}
      min={min}
      placeholder="varios"
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setV(shown)
      }}
    />
  )
}

/** Ficha compartida: lo que se cambia acá se les cambia a todos los NPC seleccionados. */
function MultiNpcSheet({ chars }: { chars: Character[] }) {
  const ids = chars.map((c) => c.id)
  const [amount, setAmount] = useState('')
  const [picking, setPicking] = useState(false)
  const up = (fn: (c: Character) => void) => updateCharacters(ids, fn)
  const monster = getMonster(common(chars, (c) => c.monster) ?? undefined)
  const image = common(chars, (c) => c.image ?? '')
  const color = common(chars, (c) => c.color)
  const baseNames = new Set(chars.map((c) => c.name.replace(/\s+\d+$/, '')))
  const down = chars.filter((c) => c.hp.cur <= 0).length

  const apply = (sign: 1 | -1) => {
    const n = Math.abs(Math.round(Number(amount)))
    if (!n) return
    applyHpMany(ids, sign * n)
    setAmount('')
  }

  return (
    <section className="sheet multi-sheet">
      <span className="label">
        <Icon name="token" size={14} /> Ficha de los {chars.length} NPC
      </span>

      <div className="form">
        <ImagePicker
          value={image || undefined}
          color={color ?? '#888'}
          onChange={(img) =>
            up((c) => {
              if (img) c.image = img
              else delete c.image
            })
          }
        />
        <label>
          Nombre (se numeran solos)
          <CommitText value={baseNames.size === 1 ? [...baseNames][0] : ''} placeholder="varios" onCommit={(v) => v.trim() && renameMany(ids, v)} />
        </label>
      </div>

      <ul className="multi-hp">
        {chars.map((c) => (
          <li key={c.id} className={c.hp.cur <= 0 ? 'down' : ''}>
            <span>{c.name}</span>
            <HpInline ch={c} />
          </li>
        ))}
      </ul>
      {down > 0 && <p className="hint">{down === chars.length ? 'Todos derrotados.' : `${down} derrotado${down > 1 ? 's' : ''}.`}</p>}

      <div className="hp-box">
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
            aria-label="Daño o curación para todos"
            title="Enter: daño · Shift+Enter: curar"
          />
          <button className="heal" onClick={() => apply(1)} disabled={!amount}>
            Curar
          </button>
        </div>
      </div>

      <div className="stats multi-stats">
        <label>
          HP máx
          <MixedNumber label="HP máximo" value={common(chars, (c) => c.hp.max)} min={1} onCommit={(v) => setHpMaxMany(ids, v)} />
        </label>
        <label>
          <span>
            <Icon name="shield" size={14} /> CA
          </span>
          <MixedNumber label="CA" value={common(chars, (c) => c.ac)} onCommit={(v) => up((c) => void (c.ac = v))} />
        </label>
        <label>
          Vel.
          <MixedNumber label="Velocidad" value={common(chars, (c) => c.speed)} min={0} onCommit={(v) => up((c) => void (c.speed = v))} />
        </label>
        <label>
          Inic.
          <MixedNumber label="Iniciativa" value={common(chars, (c) => c.initiativeMod)} onCommit={(v) => up((c) => void (c.initiativeMod = v))} />
        </label>
      </div>

      <div>
        <span className="label">Color</span>
        <ColorSwatches value={color ?? ''} onChange={(col) => up((c) => void (c.color = col))} />
      </div>

      <div>
        <span className="label">Condiciones (a todos)</span>
        <div className="conditions">
          {CONDITIONS.map((cond) => {
            const n = chars.filter((c) => c.conditions.includes(cond)).length
            const all = n === chars.length
            return (
              <button
                key={cond}
                className={all ? 'on' : n ? 'some' : ''}
                aria-pressed={all ? true : n ? 'mixed' : false}
                title={n && !all ? `Lo tienen ${n} de ${chars.length}` : undefined}
                onClick={() =>
                  up((c) => {
                    const has = c.conditions.includes(cond)
                    if (all) c.conditions = c.conditions.filter((x) => x !== cond)
                    else if (!has) c.conditions.push(cond)
                  })
                }
              >
                {cond}
              </button>
            )
          })}
        </div>
      </div>

      <div className="bst-npc">
        <span className="label">
          <Icon name="book" size={14} /> Manual de monstruos
        </span>
        {monster && !picking ? (
          <div className="bst-linked">
            <button onClick={() => openManual(monster)}>
              <Icon name="book" size={15} /> {monster.name} <small>p. {monster.page}</small>
            </button>
            <button className="link" onClick={() => setPicking(true)}>
              Cambiar
            </button>
          </div>
        ) : picking ? (
          <>
            <MonsterSearch
              autoFocus
              onPick={(m) => {
                up((c) => void (c.monster = m.id))
                setPicking(false)
              }}
            />
            <button className="link" onClick={() => setPicking(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button className="link" onClick={() => setPicking(true)}>
            Vincularlos con una criatura del manual
          </button>
        )}
      </div>
    </section>
  )
}

/** HP de uno del grupo, editable ahí mismo. */
function HpInline({ ch }: { ch: Character }) {
  return (
    <span className="hp-inline">
      <CommitNumber
        value={ch.hp.cur}
        min={0}
        max={ch.hp.max}
        onCommit={(v) => updateCharacter(ch.id, (c) => void (c.hp.cur = v))}
        aria-label={`HP de ${ch.name}`}
      />
      <small>/ {ch.hp.max}</small>
    </span>
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
