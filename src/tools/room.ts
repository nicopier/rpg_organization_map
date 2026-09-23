import { clearPreview, setPreview } from '../render/preview'
import { addRoomShape } from '../state/actions'
import { ensureLayer, S } from './common'
import type { Pointer, ToolHandler } from './types'

type Stroke =
  | { layerId: string; kind: 'rect'; ax: number; ay: number; bx: number; by: number; op: 'add' | 'sub' }
  | { layerId: string; kind: 'path'; points: [number, number][]; radius: number; op: 'add' | 'sub' }

/** Casillas enteras; con Shift, medias casillas. */
const snap = (v: number, half: boolean) => (half ? Math.round(v * 2) / 2 : Math.round(v))

/** Distancia mínima entre puntos del trazo: menos puntos, mismo dibujo. */
const MIN_STEP = 0.1

function makeRoomTool(forceSub: boolean): ToolHandler {
  let stroke: Stroke | null = null

  const show = () => {
    if (!stroke) return
    if (stroke.kind === 'rect') {
      setPreview({ room: { kind: 'rect', x0: stroke.ax, y0: stroke.ay, x1: stroke.bx, y1: stroke.by, op: stroke.op } })
    } else {
      setPreview({ room: { kind: 'path', points: stroke.points, radius: stroke.radius, op: stroke.op } })
    }
  }

  return {
    down(p) {
      const layer = ensureLayer(['floor'])
      if (!layer) return
      const s = S()
      const op = forceSub || p.alt || s.roomOp === 'sub' ? 'sub' : 'add'
      if (s.roomShape === 'rect' && !forceSub) {
        const ax = snap(p.fx, p.shift)
        const ay = snap(p.fy, p.shift)
        stroke = { layerId: layer.id, kind: 'rect', ax, ay, bx: ax, by: ay, op }
      } else {
        stroke = { layerId: layer.id, kind: 'path', points: [[p.fx, p.fy]], radius: s.roomBrush, op }
      }
      show()
    },

    drag(p) {
      if (!stroke) return
      if (stroke.kind === 'rect') {
        stroke.bx = snap(p.fx, p.shift)
        stroke.by = snap(p.fy, p.shift)
      } else {
        const [lx, ly] = stroke.points[stroke.points.length - 1]
        if (Math.hypot(p.fx - lx, p.fy - ly) < MIN_STEP) return
        stroke.points = [...stroke.points, [p.fx, p.fy]]
      }
      show()
    },

    up() {
      if (!stroke) return
      const st = stroke
      stroke = null
      clearPreview()
      if (st.kind === 'rect') {
        if (st.ax === st.bx || st.ay === st.by) return
        addRoomShape(st.layerId, { op: st.op, kind: 'rect', x0: st.ax, y0: st.ay, x1: st.bx, y1: st.by })
      } else {
        addRoomShape(st.layerId, { op: st.op, kind: 'path', points: st.points, radius: st.radius })
      }
    },

    hover(p: Pointer) {
      // Con pincel se ve el tamaño antes de dibujar.
      const s = S()
      if (forceSub || s.roomShape === 'path') {
        setPreview({
          room: { kind: 'path', points: [[p.fx, p.fy]], radius: s.roomBrush, op: forceSub || p.alt || s.roomOp === 'sub' ? 'sub' : 'add' },
          hover: null,
        })
      } else {
        setPreview({ room: null, hover: null })
      }
    },

    cancel() {
      stroke = null
    },
  }
}

export const roomTool = makeRoomTool(false)
/** La goma sobre una capa de salas resta con el pincel. */
export const roomEraser = makeRoomTool(true)
