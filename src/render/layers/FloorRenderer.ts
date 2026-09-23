import { Container, Sprite, Texture } from 'pixi.js'
import { parseCellKey } from '../../model/mapDoc'
import type { FloorCell, Layer } from '../../model/types'
import { floorTexture } from '../textures'
import type { LayerRenderer, RenderCtx } from '../types'

/** Un sprite por casilla pintada; reconcilia por referencia (Immer comparte lo que no cambió). */
export class FloorRenderer implements LayerRenderer {
  readonly container = new Container()
  private nodes = new Map<string, { sprite: Sprite; cell: FloorCell }>()
  private epoch = -1

  update(layer: Layer, ctx: RenderCtx) {
    if (ctx.epoch !== this.epoch) {
      this.clear()
      this.epoch = ctx.epoch
    }
    const cells = layer.cells ?? {}
    for (const [k, n] of this.nodes) {
      if (!(k in cells)) {
        n.sprite.destroy()
        this.nodes.delete(k)
      }
    }
    for (const k in cells) {
      const cell = cells[k]
      const n = this.nodes.get(k)
      if (n?.cell === cell) continue
      const [x, y] = parseCellKey(k)
      const sprite = n?.sprite ?? new Sprite()
      if ('assetId' in cell) {
        sprite.texture = floorTexture(cell.assetId, x, y)
        sprite.tint = 0xffffff
      } else {
        sprite.texture = Texture.WHITE
        sprite.tint = cell.color
      }
      sprite.position.set(x * ctx.c, y * ctx.c)
      sprite.width = ctx.c
      sprite.height = ctx.c
      if (!n) this.container.addChild(sprite)
      this.nodes.set(k, { sprite, cell })
    }
  }

  private clear() {
    for (const n of this.nodes.values()) n.sprite.destroy()
    this.nodes.clear()
  }

  destroy() {
    this.clear()
    this.container.destroy({ children: true })
  }
}
