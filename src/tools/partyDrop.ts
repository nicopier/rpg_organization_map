import { setPreview } from '../render/preview'
import { moveParty } from '../state/actions'
import { hoverCell, S } from './common'
import type { ToolHandler } from './types'

/** Llevar la party a este mapa: un clic elige dónde entran; se acomodan en formación alrededor. */
export const partyDropTool: ToolHandler = {
  hover(p) {
    const h = hoverCell(p)
    setPreview({ hover: null, cellRect: h ? { x0: p.cx - 1, y0: p.cy - 1, x1: p.cx + 1, y1: p.cy + 1, color: 0xffcc33 } : null })
  },
  down(p) {
    if (!hoverCell(p)) return
    if (!S().campaign.party.length) return S().toast('La party está vacía: creá personajes en el panel Party.')
    moveParty(p.cx, p.cy)
    S().setUi({ tool: 'select' })
    S().toast(`La party llegó a "${S().doc.name}". Es el mapa que ven los jugadores.`)
  },
}
