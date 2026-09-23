import { CanvasSource, Container, Sprite, Texture } from 'pixi.js'
import { DUNGEON_PRESETS } from '../../model/mapDoc'
import type { DungeonStyle, Grid, Layer, RoomShape } from '../../model/types'
import { DUNGEON_MARGIN, dungeonPxPerCell, rasterDungeon } from '../dungeonRaster'
import type { LayerRenderer, RenderCtx } from '../types'

/** Capa de salas: un solo sprite con la imagen rasterizada de todas las formas. */
export class DungeonRenderer implements LayerRenderer {
  readonly container = new Container()
  private sprite = new Sprite()
  private tex: Texture | null = null
  private last: { shapes?: RoomShape[]; style?: DungeonStyle; grid?: Grid } = {}

  constructor() {
    this.container.addChild(this.sprite)
  }

  update(layer: Layer, ctx: RenderCtx) {
    const shapes = layer.shapes ?? []
    const style = layer.dungeon ?? DUNGEON_PRESETS[0].style
    const grid = ctx.doc.grid
    if (this.last.shapes === layer.shapes && this.last.style === layer.dungeon && this.last.grid === grid) return
    this.last = { shapes: layer.shapes, style: layer.dungeon, grid }

    this.tex?.destroy(true)
    this.tex = null
    if (!shapes.length) {
      this.sprite.visible = false
      return
    }
    const p = dungeonPxPerCell(grid)
    const img = rasterDungeon(shapes, style, grid, p)
    this.tex = new Texture({ source: new CanvasSource({ resource: img }) })
    this.sprite.texture = this.tex
    this.sprite.visible = true
    // El raster trae un margen alrededor del mapa; se escala a la casilla del mapa.
    const c = ctx.c
    this.sprite.position.set(-DUNGEON_MARGIN * c, -DUNGEON_MARGIN * c)
    this.sprite.width = (grid.cols + DUNGEON_MARGIN * 2) * c
    this.sprite.height = (grid.rows + DUNGEON_MARGIN * 2) * c
  }

  destroy() {
    this.tex?.destroy(true)
    this.container.destroy({ children: true })
  }
}
