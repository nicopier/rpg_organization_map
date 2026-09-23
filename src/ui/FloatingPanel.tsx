import { useEffect, useState } from 'react'
import { useMap, type Tool } from '../state/mapStore'
import { AssetPalette } from './AssetPalette'
import { Icon, type IconName } from './Icon'
import { NpcPanel } from './NpcPanel'
import { FogPanel, MarksPanel, PartyPanel } from './PlayPanels'
import { RoomPanel } from './RoomPanel'

type Tab = { id: string; label: string; icon: IconName; tools: Tool[]; render: () => React.ReactNode }

const EDIT_TABS: Tab[] = [
  { id: 'rooms', label: 'Salas', icon: 'room', tools: ['room', 'wall'], render: () => <RoomPanel /> },
  { id: 'floor', label: 'Piso', icon: 'brush', tools: ['paint'], render: () => <AssetPalette categories={['floor']} /> },
  { id: 'objects', label: 'Objetos', icon: 'box', tools: ['place'], render: () => <AssetPalette categories={['structure', 'prop', 'effect', 'marker']} /> },
  { id: 'npc', label: 'NPC', icon: 'token', tools: ['token'], render: () => <NpcPanel /> },
]

const PLAY_TABS: Tab[] = [
  { id: 'party', label: 'Party', icon: 'token', tools: ['partyDrop', 'token'], render: () => <PartyPanel /> },
  { id: 'fog', label: 'Niebla', icon: 'eyeOff', tools: ['fog'], render: () => <FogPanel /> },
  { id: 'marks', label: 'Marcas', icon: 'dm', tools: ['place'], render: () => <MarksPanel /> },
]

function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* sin almacenamiento local: no se recuerda */
  }
}

/**
 * Paleta flotante sobre el mapa. En modo Edición es el constructor; en modo Juego, las herramientas de la partida.
 * Así el panel izquierdo queda para la lista de mapas.
 */
export function FloatingPanel() {
  const mode = useMap((s) => s.mode)
  const tool = useMap((s) => s.tool)
  const viewer = useMap((s) => s.viewer)
  const tabs = mode === 'edit' ? EDIT_TABS : PLAY_TABS
  const [tab, setTab] = useState(() => readPref(`mappaneitor:float:${mode}`, tabs[0].id))
  const [open, setOpen] = useState(() => readPref('mappaneitor:float:open', '1') === '1')

  // Al cambiar de modo, la pestaña recordada de ese modo.
  useEffect(() => setTab(readPref(`mappaneitor:float:${mode}`, (mode === 'edit' ? EDIT_TABS : PLAY_TABS)[0].id)), [mode])
  // Elegir una herramienta desde la barra lleva a su pestaña.
  useEffect(() => {
    const t = tabs.find((x) => x.tools.includes(tool))
    if (t) setTab(t.id)
  }, [tool, tabs])

  if (viewer === 'player') return null
  const current = tabs.find((t) => t.id === tab) ?? tabs[0]

  return (
    <div className={`floating${open ? '' : ' closed'}`}>
      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === current.id}
            className={t.id === current.id && open ? 'on' : ''}
            onClick={() => {
              setTab(t.id)
              writePref(`mappaneitor:float:${mode}`, t.id)
              if (!open) {
                setOpen(true)
                writePref('mappaneitor:float:open', '1')
              }
            }}
          >
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
        <button
          className="collapse"
          title={open ? 'Minimizar' : 'Abrir'}
          onClick={() => {
            setOpen(!open)
            writePref('mappaneitor:float:open', open ? '0' : '1')
          }}
        >
          {open ? '–' : '+'}
        </button>
      </nav>
      {open && <div className="floating-body">{current.render()}</div>}
    </div>
  )
}
