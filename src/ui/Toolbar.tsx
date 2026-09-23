import { useState } from 'react'
import { useNet } from '../net/client'
import { renameMap, setMovementLocked } from '../state/actions'
import { useMap, type Tool } from '../state/mapStore'
import { fitMap, setTool, togglePlayerView } from './commands'
import { FileDialog, GridSettings, InviteDialog } from './dialogs'
import { CommitText } from './fields'
import { Icon, type IconName } from './Icon'

type ToolDef = { tool: Tool; icon: IconName; label: string; key: string }

const COMMON_HEAD: ToolDef[] = [
  { tool: 'select', icon: 'select', label: 'Seleccionar', key: 'V' },
  { tool: 'pan', icon: 'hand', label: 'Mano', key: 'mantené Espacio' },
]
const EDIT_TOOLS: ToolDef[] = [
  ...COMMON_HEAD,
  { tool: 'room', icon: 'room', label: 'Sala', key: 'D' },
  { tool: 'paint', icon: 'brush', label: 'Piso', key: 'B' },
  { tool: 'wall', icon: 'wall', label: 'Puerta', key: 'W' },
  { tool: 'place', icon: 'box', label: 'Objeto', key: 'O' },
  { tool: 'erase', icon: 'eraser', label: 'Goma', key: 'E' },
  { tool: 'measure', icon: 'ruler', label: 'Regla', key: 'M' },
]
const PLAY_TOOLS: ToolDef[] = [
  ...COMMON_HEAD,
  { tool: 'fog', icon: 'eyeOff', label: 'Niebla', key: 'N' },
  { tool: 'place', icon: 'dm', label: 'Marca', key: 'O' },
  { tool: 'measure', icon: 'ruler', label: 'Regla', key: 'M' },
]

type Dialog = 'grid' | 'invite' | 'file' | null

export function Toolbar() {
  const tool = useMap((s) => s.tool)
  const mode = useMap((s) => s.mode)
  const viewer = useMap((s) => s.viewer)
  const name = useMap((s) => s.doc.name)
  const canUndo = useMap((s) => s.past.length > 0)
  const canRedo = useMap((s) => s.future.length > 0)
  const net = useNet((s) => s.status)
  const online = useNet((s) => s.online.length)
  const [dialog, setDialog] = useState<Dialog>(null)
  const tools = mode === 'edit' ? EDIT_TOOLS : PLAY_TOOLS
  const frozen = useMap((s) => !!s.campaign.movementLocked)

  return (
    <header className="toolbar">
      <CommitText className="map-name" value={name} onCommit={(v) => renameMap(v.trim() || 'Mapa sin título')} aria-label="Nombre del mapa" />

      <div className="segmented mode-switch" role="radiogroup" aria-label="Modo">
        <button className={mode === 'edit' ? 'on' : ''} onClick={() => useMap.getState().setUi({ mode: 'edit', tool: 'select' })} title="Diseñar el mapa: salas, piso, objetos y NPC">
          <Icon name="hammer" size={15} /> Edición
        </button>
        <button className={mode === 'play' ? 'on' : ''} onClick={() => useMap.getState().setUi({ mode: 'play', tool: 'select' })} title="Jugar: party, niebla y marcas; los personajes de los jugadores quedan fijos">
          <Icon name="sword" size={15} /> Juego
        </button>
      </div>

      <div className="tool-group" role="toolbar" aria-label="Herramientas">
        {tools.map((t) => (
          <button
            key={t.tool}
            className={`tool${tool === t.tool ? ' on' : ''}`}
            onClick={() => setTool(t.tool)}
            title={`${t.label} (${t.key})`}
            aria-pressed={tool === t.tool}
          >
            <Icon name={t.icon} />
            <span className="tool-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="tool-group compact">
        <button className="icon-btn" onClick={() => useMap.getState().undo()} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={() => useMap.getState().redo()} disabled={!canRedo} title="Rehacer (Ctrl+Y)">
          <Icon name="redo" />
        </button>
      </div>

      {mode === 'play' && (
        <button
          className={`pill freeze${frozen ? ' on' : ''}`}
          onClick={() => setMovementLocked(!frozen)}
          aria-pressed={frozen}
          title={frozen ? 'Los jugadores no pueden mover sus personajes. Clic para liberarlos.' : 'Congelar el movimiento de todos los jugadores'}
        >
          <Icon name={frozen ? 'lock' : 'unlock'} size={15} /> {frozen ? 'Jugadores congelados' : 'Congelar jugadores'}
        </button>
      )}

      <div className="spacer" />

      <button className={`pill${viewer === 'player' ? ' player-on' : ''}`} onClick={togglePlayerView} title="Ver como jugador (P)">
        <Icon name={viewer === 'player' ? 'eye' : 'dm'} size={15} />
        {viewer === 'player' ? 'Vista jugador' : 'Vista DM'}
      </button>

      <button className="pill invite" onClick={() => setDialog('invite')} title="Link para que entren los jugadores">
        <Icon name="token" size={15} /> Invitar
        {online > 0 && <span className="count">{online}</span>}
      </button>

      <div className="tool-group compact">
        <button className="icon-btn" onClick={fitMap} title="Encuadrar mapa">
          <Icon name="fit" />
        </button>
        <button className="icon-btn" onClick={() => setDialog('grid')} title="Tamaño y grilla del mapa">
          <Icon name="grid" />
        </button>
        <button className="icon-btn" onClick={() => setDialog('file')} title="Guardar o abrir campaña">
          <Icon name="download" />
        </button>
      </div>

      <span className={`save-status ${net}`} title="Conexión con el servidor de la partida">
        {net === 'online' ? 'Sincronizado' : net === 'connecting' ? 'Conectando…' : 'Sin conexión'}
      </span>

      {dialog === 'grid' && <GridSettings onClose={() => setDialog(null)} />}
      {dialog === 'invite' && <InviteDialog onClose={() => setDialog(null)} />}
      {dialog === 'file' && <FileDialog onClose={() => setDialog(null)} />}
    </header>
  )
}
