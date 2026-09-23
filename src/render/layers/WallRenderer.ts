import { Container, Graphics } from 'pixi.js'
import { DUNGEON_PRESETS } from '../../model/mapDoc'
import { parseWallKey } from '../../model/queries'
import type { DungeonStyle, Layer, WallPiece } from '../../model/types'
import { isHiddenFromPlayers } from '../../model/visibility'
import { hiddenBadge } from '../badges'
import { HIDDEN_COLOR, type RenderCtx } from '../types'

const DOOR_WOOD = 0xc8955a
const WINDOW_GLASS = 0xbfe3ff

/**
 * Puertas, ventanas y muros sueltos sobre los bordes de las casillas, con el color y grosor
 * de pared de las salas. Una puerta abre un hueco: se tapa la pared de la sala con color de piso
 * y encima va la hoja. Se redibuja entero cuando cambia: son pocos segmentos.
 *
 * Puerta secreta oculta: el DM la ve con una "S" violeta; al jugador el servidor ya se la manda como pared.
 */
export class WallRenderer {
  readonly container = new Container()
  private lines = new Graphics()
  private marks = new Container()
  private last: { walls?: Layer['walls']; style?: DungeonStyle; epoch: number; visibility?: Layer['visibility'] } = { epoch: -1 }

  constructor() {
    this.container.addChild(this.lines, this.marks)
  }

  update(layer: Layer, ctx: RenderCtx) {
    const style = layer.dungeon ?? DUNGEON_PRESETS[0].style
    if (this.last.walls === layer.walls && this.last.style === layer.dungeon && this.last.epoch === ctx.epoch && this.last.visibility === layer.visibility) return
    this.last = { walls: layer.walls, style: layer.dungeon, epoch: ctx.epoch, visibility: layer.visibility }

    this.marks.removeChildren().forEach((c) => c.destroy())
    this.lines.clear()
    const c = ctx.c
    const player = ctx.viewer === 'player'
    const width = Math.max(2, style.wallWidth * c)

    for (const [key, p] of Object.entries(layer.walls ?? {})) {
      const hidden = isHiddenFromPlayers(p, layer)
      const { x, y, dir } = parseWallKey(key)
      if (dir === 'b') continue
      const ax = x * c
      const ay = y * c
      const bx = dir === 'h' ? (x + 1) * c : x * c
      const by = dir === 'v' ? (y + 1) * c : y * c

      let kind = p.kind
      if (player && hidden) {
        // Vista previa del DM en modo jugador: igual que lo que manda el servidor.
        if (kind !== 'secretDoor') continue
        kind = 'wall'
      }

      if (kind === 'wall') this.lines.moveTo(ax, ay).lineTo(bx, by).stroke({ color: style.wall, width, cap: 'square' })
      else this.opening(ax, ay, bx, by, dir === 'h', kind, style, width, c)

      if (!player && hidden) {
        this.lines.moveTo(ax, ay).lineTo(bx, by).stroke({ color: HIDDEN_COLOR, width: Math.max(1, width * 0.35) })
        if (p.kind === 'secretDoor') this.secretMark((ax + bx) / 2, (ay + by) / 2, c)
        else {
          const b = hiddenBadge(c * 0.7)
          b.position.set((ax + bx) / 2, (ay + by) / 2)
          this.marks.addChild(b)
        }
      }
    }
  }

  /** Puerta o ventana: hueco en la pared (color de piso) y el símbolo encima. */
  private opening(ax: number, ay: number, bx: number, by: number, horizontal: boolean, kind: WallPiece['kind'], st: DungeonStyle, width: number, c: number) {
    const g = this.lines
    const cx = (ax + bx) / 2
    const cy = (ay + by) / 2
    const len = c * 0.78
    const gap = width * 2.4
    // Hueco: tapa la pared de la sala que pasa por este borde.
    g.rect(cx - (horizontal ? len : gap) / 2, cy - (horizontal ? gap : len) / 2, horizontal ? len : gap, horizontal ? gap : len).fill({ color: st.floor })
    // Jambas: cortitos de pared a cada lado del hueco.
    const jamb = width * 1.6
    for (const s of [-1, 1]) {
      const px = cx + (horizontal ? (s * len) / 2 : 0)
      const py = cy + (horizontal ? 0 : (s * len) / 2)
      g.moveTo(px - (horizontal ? 0 : jamb / 2), py - (horizontal ? jamb / 2 : 0))
        .lineTo(px + (horizontal ? 0 : jamb / 2), py + (horizontal ? jamb / 2 : 0))
        .stroke({ color: st.wall, width: Math.max(2, width * 0.8), cap: 'square' })
    }
    const leaf = c * 0.62
    const thick = kind === 'window' ? Math.max(3, width * 0.7) : Math.max(6, width * 1.4)
    const w = horizontal ? leaf : thick
    const h = horizontal ? thick : leaf
    g.rect(cx - w / 2, cy - h / 2, w, h)
      .fill({ color: kind === 'window' ? WINDOW_GLASS : DOOR_WOOD })
      .stroke({ color: st.wall, width: Math.max(1.5, c * 0.025) })
  }

  private secretMark(x: number, y: number, c: number) {
    const g = new Graphics()
    const r = c * 0.13
    g.circle(0, 0, r).fill({ color: HIDDEN_COLOR }).stroke({ color: 0xffffff, width: c * 0.02 })
    // "S" dibujada con dos arcos, sin depender de fuentes.
    const s = r * 0.45
    g.arc(0, -s * 0.5, s * 0.5, -Math.PI * 0.1, Math.PI * 1.5, true)
    g.arc(0, s * 0.5, s * 0.5, -Math.PI * 0.5, Math.PI * 0.9)
    g.stroke({ color: 0xffffff, width: c * 0.025, cap: 'round' })
    g.position.set(x, y)
    this.marks.addChild(g)
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}
