import { useEffect, useRef } from 'react'
import { DUNGEON_PRESETS, layerOfKind } from '../model/mapDoc'
import type { DungeonStyle, WallKind } from '../model/types'
import { rasterDungeon } from '../render/dungeonRaster'
import { clearRooms, updateDungeonStyle } from '../state/actions'
import { useMap } from '../state/mapStore'
import { groupWhileDragging, groupWhileFocused, Segmented } from './fields'
import { Icon } from './Icon'

/** Miniatura de un estilo: una sala en L con un pasillo, dibujada con el mismo rasterizador que el mapa. */
function StylePreview({ style, size = 120 }: { style: DungeonStyle; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const grid = { cols: 6, rows: 4, cellPx: 70, show: false, color: '#0000', bg: '#0000' }
    const p = 24
    const img = rasterDungeon(
      [
        { id: 'a', op: 'add', kind: 'rect', x0: 0.5, y0: 0.5, x1: 3.5, y1: 3.5 },
        { id: 'b', op: 'add', kind: 'path', points: [[3.5, 2], [5, 2], [5.3, 0.8]], radius: 0.5 },
      ],
      style,
      grid,
      p,
    )
    const dpr = window.devicePixelRatio || 1
    c.width = size * dpr
    c.height = ((size * img.height) / img.width) * dpr
    const g = c.getContext('2d')!
    g.fillStyle = '#d9d1bf'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
  }, [style, size])
  return <canvas ref={ref} className="room-preview" style={{ width: size }} />
}

const DOOR_KINDS: { value: WallKind; label: string; title: string }[] = [
  { value: 'door', label: 'Puerta', title: 'Abre un hueco en la pared de la sala' },
  { value: 'secretDoor', label: 'Secreta', title: 'Los jugadores ven pared hasta que la reveles' },
  { value: 'window', label: 'Ventana', title: 'Ventana sobre la pared' },
  { value: 'wall', label: 'Muro', title: 'Un tramo de pared suelto (sólo dibujo, no bloquea)' },
]

export function RoomPanel() {
  const shape = useMap((s) => s.roomShape)
  const tool = useMap((s) => s.tool)
  const doorKind = useMap((s) => s.wallKind)
  const op = useMap((s) => s.roomOp)
  const brush = useMap((s) => s.roomBrush)
  const layer = layerOfKind(useMap((s) => s.doc), 'floor')
  const ui = useMap.getState().setUi
  const pick = (patch: Parameters<typeof ui>[0]) => ui({ ...patch, tool: 'room' })

  const style = layer.dungeon ?? DUNGEON_PRESETS[0].style
  const set = (patch: Partial<DungeonStyle>) => updateDungeonStyle(layer.id, patch)

  return (
    <div className="room-panel">
      <section>
        <p className="hint lead">
          Dibujá salas y pasillos: las formas que se tocan se unen solas, con su pared y su rayado alrededor.
        </p>
        <h4>Forma</h4>
        <Segmented
          value={shape}
          onChange={(roomShape) => pick({ roomShape })}
          options={[
            { value: 'rect', label: 'Rectángulo', title: 'Arrastrá de esquina a esquina (Shift: medias casillas)' },
            { value: 'path', label: 'Pincel', title: 'Trazo libre para pasillos y cuevas' },
          ]}
        />
        <h4>Acción</h4>
        <Segmented
          value={op}
          onChange={(roomOp) => pick({ roomOp })}
          options={[
            { value: 'add', label: 'Agregar' },
            { value: 'sub', label: 'Quitar', title: 'También con Alt mientras dibujás' },
          ]}
        />
        {shape === 'path' && (
          <label className="field">
            Ancho del pincel: {brush * 2} {brush * 2 === 1 ? 'casilla' : 'casillas'}
            <input type="range" min={0.5} max={4} step={0.25} value={brush} onChange={(e) => pick({ roomBrush: Number(e.target.value) })} />
          </label>
        )}
        <ul className="help">
          <li>
            <kbd>Alt</kbd> mientras dibujás: quitar en vez de agregar.
          </li>
          <li>La goma sobre el piso vacío también recorta salas.</li>
        </ul>
      </section>

      <section>
        <h4>Puertas</h4>
        <div className="segmented">
          {DOOR_KINDS.map((k) => (
            <button
              key={k.value}
              title={k.title}
              className={tool === 'wall' && doorKind === k.value ? 'on' : ''}
              onClick={() => ui({ tool: 'wall', wallKind: k.value })}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="hint">Clic sobre el borde de una sala. Arrastrá para varios bordes; Alt borra.</p>
        {doorKind === 'secretDoor' && tool === 'wall' && (
          <p className="hint hidden-hint">Nace oculta: los jugadores ven pared. Revelala con clic derecho o desde el inspector.</p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h4>Estilo</h4>
        </div>
        <div className="presets">
          {DUNGEON_PRESETS.map((p) => (
            <button key={p.name} className="preset" onClick={() => set({ ...p.style })} title={`Aplicar estilo ${p.name}`}>
              <StylePreview style={p.style} size={104} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="style-editor">
        <h4>Ajustes</h4>
        <StylePreview style={style} size={220} />
        <div className="form">
          <div className="row">
            <label>
              Piso
              <input type="color" value={style.floor} onChange={(e) => set({ floor: e.target.value })} {...groupWhileFocused} />
            </label>
            <label>
              Pared
              <input type="color" value={style.wall} onChange={(e) => set({ wall: e.target.value })} {...groupWhileFocused} />
            </label>
          </div>
          <label>
            Grosor de pared: {Math.round(style.wallWidth * 70)} px
            <input
              type="range"
              min={0.02}
              max={0.3}
              step={0.01}
              value={style.wallWidth}
              onChange={(e) => set({ wallWidth: Number(e.target.value) })}
              {...groupWhileDragging}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={style.hatch} onChange={(e) => set({ hatch: e.target.checked })} />
            Rayado alrededor
          </label>
          {style.hatch && (
            <div className="row">
              <label>
                Color del rayado
                <input type="color" value={style.hatchColor} onChange={(e) => set({ hatchColor: e.target.value })} {...groupWhileFocused} />
              </label>
              <label>
                Ancho: {style.hatchWidth.toFixed(2)}
                <input
                  type="range"
                  min={0.15}
                  max={1.5}
                  step={0.05}
                  value={style.hatchWidth}
                  onChange={(e) => set({ hatchWidth: Number(e.target.value) })}
                  {...groupWhileDragging}
                />
              </label>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={style.innerGrid} onChange={(e) => set({ innerGrid: e.target.checked })} />
            Grilla dentro de las salas
          </label>
          <label className="check">
            <input type="checkbox" checked={style.shadow} onChange={(e) => set({ shadow: e.target.checked })} />
            Sombra
          </label>
          <p className="hint">
            Para el look de Dungeon Scrawl, apagá la grilla general (botón de grilla arriba) y dejá la de adentro de las salas.
          </p>
          {(layer.shapes?.length ?? 0) > 0 && (
            <button
              className="danger-link"
              onClick={() => confirm('¿Borrar todas las salas de este mapa? (Ctrl+Z lo recupera)') && clearRooms(layer.id)}
            >
              <Icon name="trash" size={14} /> Borrar todas las salas
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
