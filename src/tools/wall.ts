import { edgesBetween, nearestEdge } from '../model/queries'
import { clearPreview, setPreview } from '../render/preview'
import { removeWalls, setWalls } from '../state/actions'
import { edgeInBounds, ensureLayer, S } from './common'
import type { Pointer, ToolHandler } from './types'

const ADD = 0x3ea6ff
const REMOVE = 0xe5484d

type Stroke = { layerId: string; ax: number; ay: number; keys: string[]; remove: boolean }
let stroke: Stroke | null = null

/** Tramo recto entre vértices (se fuerza horizontal o vertical). */
function edgeKeys(s: Stroke, p: Pointer): string[] {
  let bx = Math.round(p.fx)
  let by = Math.round(p.fy)
  if (Math.abs(bx - s.ax) >= Math.abs(by - s.ay)) by = s.ay
  else bx = s.ax
  return edgesBetween(s.ax, s.ay, bx, by).filter(edgeInBounds)
}

/**
 * Puertas, puertas secretas, ventanas y muros sueltos sobre los bordes de las casillas (capa Piso).
 * Un clic pone la pieza en el borde más cercano; arrastrar la pone en un tramo. Alt borra.
 */
export const wallTool: ToolHandler = {
  down(p) {
    const layer = ensureLayer(['floor'])
    if (!layer) return
    stroke = { layerId: layer.id, ax: Math.round(p.fx), ay: Math.round(p.fy), keys: [], remove: p.alt }
  },

  drag(p) {
    if (!stroke) return
    stroke.keys = edgeKeys(stroke, p)
    setPreview({ edges: { keys: stroke.keys, color: stroke.remove ? REMOVE : ADD } })
  },

  up(p) {
    if (!stroke) return
    let keys = stroke.keys
    if (!keys.length) {
      const e = nearestEdge(p.fx, p.fy)
      keys = edgeInBounds(e.key) ? [e.key] : []
    }
    if (keys.length) {
      if (stroke.remove) removeWalls(stroke.layerId, keys)
      else setWalls(stroke.layerId, keys, { kind: S().wallKind })
    }
    stroke = null
    clearPreview()
    this.hover!(p)
  },

  hover(p) {
    const e = nearestEdge(p.fx, p.fy)
    setPreview({ edges: edgeInBounds(e.key) ? { keys: [e.key], color: p.alt ? REMOVE : ADD } : null, hover: null })
  },

  cancel() {
    stroke = null
  },
}
