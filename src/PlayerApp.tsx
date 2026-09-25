import { useEffect, useState } from 'react'
import { readPref, Section, Toast, useUnread, writePref } from './App'
import { DiceStage } from './dice/DiceStage'
import { layerOfKind, PLAYER_COLORS } from './model/mapDoc'
import { net } from './net/bridge'
import { connectPlayer, useNet } from './net/client'
import { useMap } from './state/mapStore'
import { DicePanel } from './ui/DicePanel'
import { ColorSwatches } from './ui/fields'
import { Icon } from './ui/Icon'
import { ImagePicker } from './ui/ImagePicker'
import { InitiativeTracker } from './ui/InitiativeTracker'
import { CharacterSheet } from './ui/InspectorPanel'
import { MapCanvas } from './ui/MapCanvas'
import { NumField } from './ui/NpcPanel'
import { Avatar } from './ui/PlayPanels'
import { useShortcuts } from './ui/useShortcuts'

/** Primera entrada con el link de invitación: el invitado dice cómo se llama. */
function JoinScreen() {
  const campaign = useMap((s) => s.campaign)
  const [name, setName] = useState('')
  const join = () => name.trim() && net.send({ t: 'join', name: name.trim() })
  return (
    <div className="boot">
      <form
        className="boot-card"
        onSubmit={(e) => {
          e.preventDefault()
          join()
        }}
      >
        <p className="eyebrow">Te invitaron a</p>
        <h2>{campaign.name}</h2>
        <label>
          ¿Cómo te llamás?
          <input autoFocus value={name} maxLength={30} placeholder="Tu nombre" onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="primary block" disabled={!name.trim()}>
          Entrar
        </button>
        <p className="hint">Guardá este link: es tu entrada a la mesa. Si lo abrís en otro dispositivo, entrás como vos.</p>
      </form>
    </div>
  )
}

/** Crear el personaje propio, o tomar uno que dejó armado el DM. */
function CharacterSetup() {
  const party = useMap((s) => s.campaign.party)
  const players = useMap((s) => s.campaign.players)
  const me = useMap((s) => s.me)
  const color = players.find((p) => p.id === me)?.color ?? PLAYER_COLORS[0]
  const free = party.filter((c) => c.owner === 'dm')
  const [d, setD] = useState({ name: '', hpMax: 20, ac: 14, speed: 30, initiativeMod: 0, color, image: undefined as string | undefined })
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }))

  return (
    <div className="boot">
      <form
        className="boot-card wide"
        onSubmit={(e) => {
          e.preventDefault()
          net.send({ t: 'createCharacter', input: { ...d, hpMax: Math.max(1, Math.round(d.hpMax) || 1) } })
        }}
      >
        <h2>Tu personaje</h2>
        {free.length > 0 && (
          <>
            <p className="hint">El DM dejó estos personajes armados. Si alguno es el tuyo, tomalo:</p>
            <ul className="party-list">
              {free.map((c) => (
                <li key={c.id}>
                  <Avatar ch={c} />
                  <div className="who">
                    <span className="name">{c.name}</span>
                    <span className="mini-hp">
                      {c.hp.max} HP · CA {c.ac}
                    </span>
                  </div>
                  <button type="button" className="small-btn" onClick={() => net.send({ t: 'claim', characterId: c.id })}>
                    Es mío
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">O creá uno nuevo:</p>
          </>
        )}
        <ImagePicker value={d.image} color={d.color} onChange={(image) => set({ image })} />
        <label>
          Nombre
          <input autoFocus value={d.name} maxLength={40} placeholder="Ej: Thorin" onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="row">
          <NumField label="HP máx" value={d.hpMax} min={1} onChange={(hpMax) => set({ hpMax })} />
          <NumField label="CA" value={d.ac} onChange={(ac) => set({ ac })} />
        </div>
        <div className="row">
          <NumField label="Velocidad" value={d.speed} onChange={(speed) => set({ speed })} />
          <NumField label="Mod. iniciativa" value={d.initiativeMod} onChange={(initiativeMod) => set({ initiativeMod })} />
        </div>
        <div>
          <span className="label">Color</span>
          <ColorSwatches value={d.color} onChange={(c) => set({ color: c })} />
        </div>
        <button type="submit" className="primary block" disabled={!d.name.trim()}>
          Crear personaje
        </button>
      </form>
    </div>
  )
}

function useNarrow(query = '(max-width: 900px)') {
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return narrow
}

const PLAYER_TAB_PREF = 'mappaneitor:playerTab'

/** Celular / pantalla angosta: una sola franja abajo, con pestañas Dados / Personaje. */
function BottomTabs() {
  const [tab, setTabState] = useState(() => readPref(PLAYER_TAB_PREF, 'me'))
  const setTab = (t: string) => {
    setTabState(t)
    writePref(PLAYER_TAB_PREF, t)
  }
  const unread = useUnread(tab === 'dice')
  return (
    <aside className="side right">
      <div className="tabs">
        <button className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>
          <Icon name="token" size={15} /> Personaje
        </button>
        <button className={`unread-host${tab === 'dice' ? ' on' : ''}`} onClick={() => setTab('dice')}>
          <Icon name="dice" size={15} /> Dados
          {unread > 0 && <span className="unread">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>
      {tab === 'dice' ? <DicePanel /> : <PlayerSideBody />}
    </aside>
  )
}

function PlayerSide() {
  return (
    <aside className="side right">
      <PlayerSideBody />
    </aside>
  )
}

function PlayerSideBody() {
  const me = useMap((s) => s.me)
  const party = useMap((s) => s.campaign.party)
  const players = useMap((s) => s.campaign.players)
  const gameLayer = useMap((s) => layerOfKind(s.doc, 'game'))
  const combat = useMap((s) => s.doc.combat)
  const mine = party.filter((c) => c.owner === me)
  const others = party.filter((c) => c.owner !== me)
  const onMap = (id: string) => !!gameLayer.items?.some((i) => i.characterId === id)
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? 'DM'

  return (
    <div className="side-scroll">
      {mine.map((ch) => (
        <Section key={ch.id} id={`me-${ch.id}`} title={ch.name} icon="token">
          {!onMap(ch.id) && <p className="hint">Tu personaje todavía no está en este mapa: el DM lo va a traer.</p>}
          <CharacterSheet ch={ch} />
        </Section>
      ))}
      <Section id="combat" title="Iniciativa" icon="sword" extra={combat.active ? <span className="badge live">Ronda {combat.round}</span> : undefined}>
        <InitiativeTracker />
      </Section>
      <Section id="party" title="Party" icon="layers">
        {others.length ? (
          <ul className="party-list">
            {others.map((c) => (
              <li key={c.id}>
                <Avatar ch={c} />
                <div className="who">
                  <span className="name">
                    {c.name}
                    <small> · {playerName(c.owner)}</small>
                  </span>
                  {c.hp.cur <= 0 && <span className="mini-hp">Caído</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Todavía no hay otros personajes.</p>
        )}
      </Section>
    </div>
  )
}

/** App del jugador: sólo recibe del servidor lo que puede ver. */
export function PlayerApp() {
  const ready = useNet((s) => s.ready)
  const status = useNet((s) => s.status)
  const error = useNet((s) => s.error)
  const me = useMap((s) => s.me)
  const hasChar = useMap((s) => s.campaign.party.some((c) => c.owner === s.me))
  const campaignName = useMap((s) => s.campaign.name)
  const mapName = useMap((s) => s.doc.name)
  const noTable = useMap((s) => s.campaign.activeMapId === null)
  const myName = useMap((s) => s.campaign.players.find((p) => p.id === s.me)?.name)
  const named = !!myName
  const frozen = useMap((s) => !!s.campaign.movementLocked || s.campaign.party.some((c) => c.owner === s.me && c.moveLocked))
  const narrow = useNarrow()
  useShortcuts()

  useEffect(() => connectPlayer(), [])

  if (error && !ready)
    return (
      <div className="boot">
        <div className="boot-card">
          <h2>{error}</h2>
          <p className="hint">{error.includes('invitación') ? 'Si ya tenés el link, abrilo tal cual te llegó.' : 'Esta página se reconecta sola cuando el DM abra la campaña.'}</p>
        </div>
      </div>
    )
  if (!ready) return <div className="boot">{status === 'offline' ? 'No encuentro al DM… reintentando.' : 'Conectando con la partida…'}</div>
  if (!me) return <div className="boot">Conectando con la partida…</div>
  if (!named) return <JoinScreen />
  if (!hasChar) return <CharacterSetup />

  return (
    <div className="app player">
      <header className="toolbar">
        <strong className="player-title">{campaignName}</strong>
        <span className="map-where">{noTable ? 'Esperando mapa' : mapName}</span>
        <div className="tool-group">
          <button className="tool" onClick={() => useMap.getState().setUi({ tool: 'select' })} title="Mover tu personaje (V)">
            <Icon name="select" />
            <span className="tool-label">Mover</span>
          </button>
          <button className="tool" onClick={() => useMap.getState().setUi({ tool: 'measure' })} title="Medir distancias (M)">
            <Icon name="ruler" />
            <span className="tool-label">Regla</span>
          </button>
        </div>
        <div className="spacer" />
        <span className="me-name">
          <Icon name="token" size={15} /> {myName}
        </span>
        <span className={`save-status ${status}`}>{status === 'online' ? 'Conectado' : 'Reconectando…'}</span>
      </header>
      <main className="workspace player-layout">
        {!narrow && (
          <aside className="side left play-left">
            <div className="side-title">
              <Icon name="dice" size={15} /> Dados y chat
            </div>
            <DicePanel />
          </aside>
        )}
        <div className="canvas-col">
          <MapCanvas />
          {noTable && <div className="waiting">Esperando que el DM lleve la party a un mapa…</div>}
          {frozen && !noTable && (
            <div className="banners">
              <div className="banner frozen">
                <Icon name="lock" size={14} /> El DM pausó el movimiento
              </div>
            </div>
          )}
        </div>
        {narrow ? <BottomTabs /> : <PlayerSide />}
      </main>
      <DiceStage />
      <Toast />
    </div>
  )
}
