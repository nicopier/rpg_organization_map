import type { LayerKind } from '../model/types'
import { updateLayer } from '../state/actions'
import { useMap } from '../state/mapStore'
import { groupWhileDragging } from './fields'
import { Icon, type IconName } from './Icon'

const INFO: Record<LayerKind, { icon: IconName; hint: string }> = {
  game: { icon: 'sword', hint: 'Party y marcas de la sesión' },
  npc: { icon: 'token', hint: 'NPCs del mapa' },
  object: { icon: 'box', hint: 'Muebles y decorado' },
  floor: { icon: 'room', hint: 'Salas, texturas y puertas' },
}

/** Las 4 capas fijas, de arriba hacia abajo. Se pueden ocultar, bloquear y atenuar; no se crean ni reordenan. */
export function LayerPanel() {
  const layers = useMap((s) => s.doc.layers)
  const activeId = useMap((s) => s.activeLayerId)
  return (
    <ul className="layer-list">
      {[...layers].reverse().map((l) => (
        <li key={l.id} className={`layer-row${l.id === activeId ? ' active' : ''}`} onClick={() => useMap.getState().setUi({ activeLayerId: l.id })}>
          <div className="layer-main">
            <button
              className={`icon-btn tiny${l.visible ? '' : ' off'}`}
              title={l.visible ? 'Ocultar capa' : 'Mostrar capa'}
              onClick={(e) => {
                e.stopPropagation()
                updateLayer(l.id, { visible: !l.visible })
              }}
            >
              <Icon name={l.visible ? 'eye' : 'eyeOff'} size={15} />
            </button>
            <button
              className={`icon-btn tiny${l.locked ? ' warn' : ''}`}
              title={l.locked ? 'Desbloquear' : 'Bloquear: no se puede editar ni seleccionar'}
              onClick={(e) => {
                e.stopPropagation()
                updateLayer(l.id, { locked: !l.locked })
              }}
            >
              <Icon name={l.locked ? 'lock' : 'unlock'} size={15} />
            </button>
            <Icon name={INFO[l.kind].icon} size={15} className="kind-icon" />
            <span className="layer-name">
              {l.name}
              <small>{INFO[l.kind].hint}</small>
            </span>
          </div>
          {l.id === activeId && (
            <div className="layer-details" onClick={(e) => e.stopPropagation()}>
              <label>
                Opacidad: {Math.round(l.opacity * 100)}%
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={l.opacity}
                  onChange={(e) => updateLayer(l.id, { opacity: Number(e.target.value) })}
                  {...groupWhileDragging}
                />
              </label>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
