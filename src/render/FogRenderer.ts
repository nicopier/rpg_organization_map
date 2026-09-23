import { Graphics } from 'pixi.js'
import { cellKey } from '../model/mapDoc'
import type { MapDoc } from '../model/types'
import type { Viewer } from '../model/visibility'

/**
 * Niebla de guerra: tapa las casillas no descubiertas. El jugador ve negro; el DM ve una sombra
 * para saber qué está tapado sin perder de vista el mapa. Dibuja tramos horizontales, no casilla por casilla.
 */
export class FogRenderer {
  readonly g = new Graphics()
  private last: { fog?: MapDoc['fog']; grid?: MapDoc['grid']; viewer?: Viewer } = {}

  update(doc: MapDoc, viewer: Viewer) {
    if (this.last.fog === doc.fog && this.last.grid === doc.grid && this.last.viewer === viewer) return
    this.last = { fog: doc.fog, grid: doc.grid, viewer }
    const g = this.g
    g.clear()
    if (!doc.fog.enabled) return
    const { cols, rows, cellPx: c } = doc.grid
    for (let y = 0; y < rows; y++) {
      let run = -1
      for (let x = 0; x <= cols; x++) {
        const covered = x < cols && !doc.fog.revealed[cellKey(x, y)]
        if (covered && run < 0) run = x
        if (!covered && run >= 0) {
          g.rect(run * c, y * c, (x - run) * c, c)
          run = -1
        }
      }
    }
    g.fill(viewer === 'player' ? { color: 0x0b0b0e, alpha: 1 } : { color: 0x0b0b1e, alpha: 0.45 })
  }

  destroy() {
    this.g.destroy()
  }
}
