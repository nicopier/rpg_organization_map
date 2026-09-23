import { cellKey } from '../model/mapDoc'
import { cellsInRect } from '../model/queries'
import { clearPreview, setPreview } from '../render/preview'
import { paintFloor } from '../state/actions'
import { cellLine, ensureLayer, hoverCell, inGrid, S } from './common'
import type { ToolHandler } from './types'

let stroke: { layerId: string; last: [number, number]; rect: boolean; x0: number; y0: number } | null = null

/** Pincel de piso. Shift+arrastre rellena un rectángulo; Alt+clic toma el piso de una casilla. */
export const paintFloorTool: ToolHandler = {
  down(p) {
    const layer = ensureLayer(['floor'])
    if (!layer) return
    if (p.alt) {
      const cell = layer.cells?.[cellKey(p.cx, p.cy)]
      if (cell) {
        S().setUi({ floorBrush: { ...cell } })
        S().toast('Piso tomado de la casilla')
      }
      return
    }
    const rect = p.shift || S().paintRect
    stroke = { layerId: layer.id, last: [p.cx, p.cy], rect, x0: p.cx, y0: p.cy }
    if (rect) {
      setPreview({ cellRect: { x0: p.cx, y0: p.cy, x1: p.cx, y1: p.cy, color: 0x3ea6ff } })
      return
    }
    S().beginGroup()
    paintFloor(layer.id, inGrid([[p.cx, p.cy]]), S().floorBrush)
  },

  drag(p) {
    if (!stroke) return
    if (stroke.rect) {
      setPreview({ cellRect: { x0: stroke.x0, y0: stroke.y0, x1: p.cx, y1: p.cy, color: 0x3ea6ff } })
      return
    }
    const [lx, ly] = stroke.last
    if (lx === p.cx && ly === p.cy) return
    paintFloor(stroke.layerId, inGrid(cellLine(lx, ly, p.cx, p.cy)), S().floorBrush)
    stroke.last = [p.cx, p.cy]
    setPreview({ hover: hoverCell(p) })
  },

  up(p) {
    if (!stroke) return
    if (stroke.rect) {
      paintFloor(stroke.layerId, cellsInRect(stroke.x0, stroke.y0, p.cx, p.cy, S().doc.grid), S().floorBrush)
      clearPreview()
    } else {
      S().endGroup()
    }
    stroke = null
  },

  hover(p) {
    setPreview({ hover: hoverCell(p) })
  },

  cancel() {
    if (stroke && !stroke.rect) S().endGroup()
    stroke = null
  },
}
