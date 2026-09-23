import { cellKey } from '../model/mapDoc'
import { cellsInRect, findLayer, footprintContains, nearestEdge } from '../model/queries'
import type { Layer } from '../model/types'
import { clearPreview, setPreview } from '../render/preview'
import { deleteItems, eraseFloor, removeWalls } from '../state/actions'
import { cellLine, hoverCell, inGrid, S } from './common'
import { roomEraser } from './room'
import type { Pointer, ToolHandler } from './types'

const RED = 0xe5484d

/**
 * Goma en la capa activa. En el Piso decide por lo que hay donde empezás:
 * una puerta en el borde → la borra; una casilla pintada → borra textura; si no → recorta la sala con el pincel.
 */
type Mode = 'rooms' | 'edges' | 'cells' | 'items'
let mode: Mode | null = null
let stroke: { layerId: string; last: [number, number]; rect: boolean; x0: number; y0: number } | null = null

function target(): Layer | null {
  const { doc, activeLayerId } = S()
  const l = findLayer(doc, activeLayerId)
  if (!l) return null
  if (l.locked) {
    S().toast(`La capa "${l.name}" está bloqueada.`)
    return null
  }
  return l
}

function eraseItemsAt(layer: Layer, cells: [number, number][]) {
  const items = S().doc.layers.find((l) => l.id === layer.id)?.items ?? []
  const ids = new Set<string>()
  for (const [x, y] of cells) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (footprintContains(items[i], x, y)) {
        ids.add(items[i].id)
        break
      }
    }
  }
  if (ids.size) deleteItems([...ids])
}

function edgeAt(layer: Layer, p: Pointer) {
  const e = nearestEdge(p.fx, p.fy)
  return e.dist < 0.25 && layer.walls?.[e.key] ? e.key : null
}

export const eraseTool: ToolHandler = {
  down(p) {
    const layer = target()
    if (!layer) return
    if (layer.kind === 'floor') {
      if (edgeAt(layer, p)) mode = 'edges'
      else if (layer.cells?.[cellKey(p.cx, p.cy)]) mode = 'cells'
      else {
        mode = 'rooms'
        return roomEraser.down!(p)
      }
    } else mode = 'items'

    const rect = p.shift && mode === 'cells'
    stroke = { layerId: layer.id, last: [p.cx, p.cy], rect, x0: p.cx, y0: p.cy }
    if (rect) return setPreview({ cellRect: { x0: p.cx, y0: p.cy, x1: p.cx, y1: p.cy, color: RED } })
    S().beginGroup()
    this.drag!(p)
  },

  drag(p) {
    if (mode === 'rooms') return roomEraser.drag!(p)
    if (!stroke) return
    if (stroke.rect) return setPreview({ cellRect: { x0: stroke.x0, y0: stroke.y0, x1: p.cx, y1: p.cy, color: RED } })
    const layer = findLayer(S().doc, stroke.layerId)
    if (!layer) return
    const cells = inGrid(cellLine(stroke.last[0], stroke.last[1], p.cx, p.cy))
    stroke.last = [p.cx, p.cy]
    if (mode === 'edges') {
      const k = edgeAt(layer, p)
      if (k) removeWalls(layer.id, [k])
    } else if (mode === 'cells') eraseFloor(layer.id, cells)
    else eraseItemsAt(layer, cells)
  },

  up(p) {
    if (mode === 'rooms') {
      mode = null
      return roomEraser.up!(p)
    }
    if (stroke?.rect) {
      eraseFloor(stroke.layerId, cellsInRect(stroke.x0, stroke.y0, p.cx, p.cy, S().doc.grid))
      clearPreview()
    } else if (stroke) S().endGroup()
    stroke = null
    mode = null
  },

  hover(p) {
    const l = findLayer(S().doc, S().activeLayerId)
    if (l?.kind === 'floor') {
      const k = edgeAt(l, p)
      if (k) return setPreview({ edges: { keys: [k], color: RED }, room: null, hover: null })
      if (!l.cells?.[cellKey(p.cx, p.cy)]) return roomEraser.hover!(p)
    }
    setPreview({ hover: hoverCell(p), edges: null, room: null })
  },

  cancel() {
    roomEraser.cancel!()
    if (stroke && !stroke.rect) S().endGroup()
    stroke = null
    mode = null
  },
}
