import { gridDistance } from '../model/queries'
import { setPreview } from '../render/preview'
import { S } from './common'
import type { ToolHandler } from './types'

const FEET_PER_CELL = 5
let start: { x: number; y: number } | null = null

/** Regla: distancia en casillas estilo 5e (la diagonal cuenta 1). Queda en pantalla hasta el próximo clic. */
export const measureTool: ToolHandler = {
  down(p) {
    start = { x: p.cx, y: p.cy }
    this.drag!(p)
  },
  drag(p) {
    if (!start) return
    const c = S().doc.grid.cellPx
    const d = gridDistance(start.x, start.y, p.cx, p.cy)
    setPreview({
      line: {
        ax: (start.x + 0.5) * c,
        ay: (start.y + 0.5) * c,
        bx: (p.cx + 0.5) * c,
        by: (p.cy + 0.5) * c,
        color: 0xffcc33,
        label: `${d} ${d === 1 ? 'casilla' : 'casillas'} · ${d * FEET_PER_CELL} ft`,
      },
    })
  },
  up() {
    start = null
  },
  cancel() {
    start = null
  },
}
