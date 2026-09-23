import { cellsInRect } from '../model/queries'
import { clearPreview, setPreview } from '../render/preview'
import { revealCells } from '../state/actions'
import { cellLine, hoverCell, S } from './common'
import type { ToolHandler } from './types'

type Stroke = { last: [number, number]; rect: boolean; x0: number; y0: number; reveal: boolean }
let stroke: Stroke | null = null

/** Pincel de 3×3: se descubre de a zonas, no de a casillas sueltas. */
const brush = (x: number, y: number) => cellsInRect(x - 1, y - 1, x + 1, y + 1, S().doc.grid)

/** Pincel de niebla: descubre casillas (Alt, o "Tapar", las vuelve a cubrir). Shift+arrastre: rectángulo. */
export const fogTool: ToolHandler = {
  down(p) {
    if (!S().doc.fog.enabled) return S().toast('Activá la niebla en el panel de Juego para usar esta herramienta.')
    const reveal = (S().fogOp === 'reveal') !== p.alt
    stroke = { last: [p.cx, p.cy], rect: p.shift, x0: p.cx, y0: p.cy, reveal }
    if (p.shift) return this.drag!(p)
    S().beginGroup()
    revealCells(brush(p.cx, p.cy), reveal)
  },
  drag(p) {
    if (!stroke) return
    const color = stroke.reveal ? 0xffcc33 : 0x7a5cff
    if (stroke.rect) return setPreview({ cellRect: { x0: stroke.x0, y0: stroke.y0, x1: p.cx, y1: p.cy, color } })
    const [lx, ly] = stroke.last
    if (lx === p.cx && ly === p.cy) return
    revealCells(
      cellLine(lx, ly, p.cx, p.cy).flatMap(([x, y]) => brush(x, y)),
      stroke.reveal,
    )
    stroke.last = [p.cx, p.cy]
    this.hover!(p)
  },
  up(p) {
    if (!stroke) return
    if (stroke.rect) {
      revealCells(cellsInRect(stroke.x0, stroke.y0, p.cx, p.cy, S().doc.grid), stroke.reveal)
      clearPreview()
    } else S().endGroup()
    stroke = null
  },
  hover(p) {
    const h = hoverCell(p)
    setPreview({ hover: null, cellRect: h ? { x0: p.cx - 1, y0: p.cy - 1, x1: p.cx + 1, y1: p.cy + 1, color: 0xffcc33 } : null })
  },
  cancel() {
    if (stroke && !stroke.rect) S().endGroup()
    stroke = null
  },
}
