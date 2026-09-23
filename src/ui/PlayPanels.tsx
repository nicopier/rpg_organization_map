import { useState } from 'react'
import { layerOfKind, PLAYER_COLORS } from '../model/mapDoc'
import { TOKEN_ASSET, type Character } from '../model/types'
import { useNet } from '../net/client'
import { hpColor, initials } from '../render/layers/tokenGraphic'
import {
  addPartyMember,
  addPlayer,
  clearMarks,
  partyLocation,
  removePartyMember,
  removePlayer,
  renamePlayer,
  revealAll,
  setFogEnabled,
} from '../state/actions'
import { useMap, type TokenDraft } from '../state/mapStore'
import { AssetPalette } from './AssetPalette'
import { ColorSwatches, CommitText, Segmented } from './fields'
import { Icon } from './Icon'
import { ImagePicker } from './ImagePicker'
import { bringPartyTo } from './MapsPanel'
import { armToken, NumField } from './NpcPanel'

export function Avatar({ ch, size = 30 }: { ch: Pick<Character, 'name' | 'color' | 'image' | 'hp'>; size?: number }) {
  const down = ch.hp.cur <= 0
  return (
    <span className={`token-dot avatar-dot${down ? ' down' : ''}`} style={{ width: size, height: size, background: down ? '#6b6b6b' : ch.color, fontSize: size * 0.38 }}>
      {ch.image ? <img src={ch.image} alt="" /> : initials(ch.name)}
    </span>
  )
}

export function HpBar({ cur, max }: { cur: number; max: number }) {
  const r = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0
  return (
    <span className="bar">
      <span style={{ width: `${r * 100}%`, background: `#${hpColor(r).toString(16).padStart(6, '0')}` }} />
    </span>
  )
}

/* ---------- Party ---------- */

export function PartyPanel() {
  const campaign = useMap((s) => s.campaign)
  const mapId = useMap((s) => s.mapId)
  const online = useNet((s) => s.online)
  const [adding, setAdding] = useState(false)
  const where = partyLocation(campaign)
  const mapName = (id: string | null) => campaign.maps.find((m) => m.id === id)?.name
  const playerName = (id: string) => (id === 'dm' ? 'DM' : (campaign.players.find((p) => p.id === id)?.name ?? '—'))

  const selectToken = (charId: string) => {
    const s = useMap.getState()
    const g = layerOfKind(s.doc, 'game')
    const it = g.items?.find((i) => i.assetId === TOKEN_ASSET && i.characterId === charId)
    if (it) s.setUi({ selection: { type: 'items', ids: [it.id] }, activeLayerId: g.id })
  }

  return (
    <div className="token-panel">
      <section>
        <button className="primary block" onClick={() => bringPartyTo(mapId)} disabled={!campaign.party.length}>
          <Icon name="token" size={16} /> Llevar la party a este mapa
        </button>
        {campaign.activeMapId !== mapId && (
          <p className="hint">
            Los jugadores están en <b>{mapName(campaign.activeMapId) ?? '—'}</b>. Al traer la party, este pasa a ser el mapa de la mesa.
          </p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h4>Personajes</h4>
          <button className="small-btn" onClick={() => setAdding(!adding)}>
            <Icon name={adding ? 'x' : 'plus'} size={14} /> {adding ? 'Cerrar' : 'Nuevo'}
          </button>
        </div>
        {adding && <NewPcForm onDone={() => setAdding(false)} />}
        {!campaign.party.length && !adding && <p className="hint">Todavía no hay personajes. Los jugadores los crean al unirse, o los armás vos con "Nuevo".</p>}
        <ul className="party-list">
          {campaign.party.map((ch) => {
            const loc = where.get(ch.id) ?? null
            const here = loc === mapId
            return (
              <li key={ch.id} className={here ? 'here' : ''} onClick={() => here && selectToken(ch.id)}>
                <Avatar ch={ch} />
                <div className="who">
                  <span className="name">
                    {ch.name}
                    <small> · {playerName(ch.owner)}</small>
                  </span>
                  <span className="mini-hp">
                    <HpBar cur={ch.hp.cur} max={ch.hp.max} />
                    {ch.hp.cur}/{ch.hp.max} · CA {ch.ac}
                  </span>
                  <span className="where">{loc ? (here ? 'En este mapa' : `En ${mapName(loc)}`) : 'Fuera de los mapas'}</span>
                </div>
                {!here && (
                  <button
                    className="small-btn"
                    title="Colocarlo en este mapa"
                    onClick={(e) => {
                      e.stopPropagation()
                      armToken({ name: ch.name, kind: 'pc', owner: ch.owner, hpMax: ch.hp.max, ac: ch.ac, speed: ch.speed, initiativeMod: ch.initiativeMod, color: ch.color, size: 1, characterId: ch.id })
                    }}
                  >
                    Traer
                  </button>
                )}
                <button
                  className="icon-btn tiny danger"
                  title="Sacar de la campaña"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`¿Sacar a ${ch.name} de la campaña? (Ctrl+Z lo recupera)`)) removePartyMember(ch.id)
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <div className="section-head">
          <h4>Jugadores</h4>
          <button className="small-btn" onClick={() => addPlayer(`Jugador ${campaign.players.length + 1}`)}>
            <Icon name="plus" size={14} /> Agregar
          </button>
        </div>
        <ul className="players">
          {campaign.players.map((p) => (
            <li key={p.id}>
              <span className={`presence${online.includes(p.id) ? ' on' : ''}`} title={online.includes(p.id) ? 'Conectado' : 'Desconectado'} />
              <CommitText value={p.name} placeholder="Invitado (sin usar)" aria-label="Nombre del jugador" onCommit={(v) => v.trim() && renamePlayer(p.id, v.trim())} />
              <button
                className="icon-btn danger"
                title="Quitar jugador (sus personajes quedan a cargo del DM)"
                onClick={() => confirm(`¿Quitar a ${p.name}?`) && removePlayer(p.id)}
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
        {!campaign.players.length && <p className="hint">Generá sus links desde "Invitar".</p>}
      </section>
    </div>
  )
}

function NewPcForm({ onDone }: { onDone: () => void }) {
  const players = useMap((s) => s.campaign.players)
  const [d, setD] = useState<TokenDraft>({
    name: '',
    kind: 'pc',
    owner: players[0]?.id ?? 'dm',
    hpMax: 20,
    ac: 14,
    speed: 30,
    initiativeMod: 2,
    color: PLAYER_COLORS[0],
    size: 1,
  })
  const set = (p: Partial<TokenDraft>) => setD((x) => ({ ...x, ...p }))
  return (
    <form
      className="form new-pc"
      onSubmit={(e) => {
        e.preventDefault()
        addPartyMember({ ...d, hpMax: Math.max(1, Math.round(d.hpMax) || 1) })
        onDone()
      }}
    >
      <ImagePicker value={d.image} color={d.color} onChange={(image) => set({ image })} />
      <label>
        Nombre
        <input autoFocus value={d.name} placeholder="Ej: Thorin" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        Lo controla
        <select value={d.owner} onChange={(e) => set({ owner: e.target.value })}>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="dm">El DM</option>
        </select>
      </label>
      <div className="row">
        <NumField label="HP máx" value={d.hpMax} min={1} onChange={(hpMax) => set({ hpMax })} />
        <NumField label="CA" value={d.ac} onChange={(ac) => set({ ac })} />
      </div>
      <ColorSwatches value={d.color} onChange={(color) => set({ color })} />
      <button type="submit" className="primary">
        Crear personaje
      </button>
    </form>
  )
}

/* ---------- Niebla ---------- */

export function FogPanel() {
  const fog = useMap((s) => s.doc.fog)
  const op = useMap((s) => s.fogOp)
  const tool = useMap((s) => s.tool)
  const ui = useMap.getState().setUi
  return (
    <div className="token-panel">
      <section className="form">
        <label className="check">
          <input
            type="checkbox"
            checked={fog.enabled}
            onChange={(e) => {
              setFogEnabled(e.target.checked)
              if (e.target.checked) ui({ tool: 'fog' })
            }}
          />
          Niebla de guerra en este mapa
        </label>
        <p className="hint">
          Los jugadores sólo ven lo descubierto. Vos lo ves con una sombra encima. Lo que está bajo la niebla ni siquiera les llega.
        </p>
      </section>
      {fog.enabled && (
        <section className="form">
          <Segmented
            value={tool === 'fog' ? op : ('none' as 'reveal')}
            onChange={(fogOp) => ui({ fogOp, tool: 'fog' })}
            options={[
              { value: 'reveal', label: 'Descubrir', title: 'Pincel que descubre' },
              { value: 'hide', label: 'Tapar', title: 'Pincel que vuelve a tapar' },
            ]}
          />
          <ul className="help">
            <li>Arrastrá sobre el mapa para descubrir de a zonas.</li>
            <li>
              <kbd>Shift</kbd>+arrastrar: rectángulo. <kbd>Alt</kbd>: lo contrario.
            </li>
          </ul>
          <div className="row">
            <button onClick={() => revealAll(true)}>Descubrir todo</button>
            <button onClick={() => revealAll(false)}>Tapar todo</button>
          </div>
        </section>
      )}
    </div>
  )
}

/* ---------- Marcas ---------- */

export function MarksPanel() {
  const marks = useMap((s) => layerOfKind(s.doc, 'game').items?.filter((i) => i.assetId !== TOKEN_ASSET).length ?? 0)
  return (
    <div>
      <div className="marks-head">
        <p className="hint">Fuego, marcadores, botín… Se ponen en la capa Juego y no tocan el diseño del mapa.</p>
        <button className="small-btn" disabled={!marks} onClick={() => confirm(`¿Borrar las ${marks} marcas de la sesión?`) && clearMarks()}>
          <Icon name="trash" size={13} /> Limpiar marcas ({marks})
        </button>
      </div>
      <AssetPalette categories={['effect', 'marker', 'prop', 'structure']} />
    </div>
  )
}
