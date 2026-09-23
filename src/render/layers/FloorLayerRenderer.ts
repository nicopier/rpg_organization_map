import { Container } from 'pixi.js'
import type { Layer } from '../../model/types'
import type { LayerRenderer, RenderCtx } from '../types'
import { DungeonRenderer } from './DungeonRenderer'
import { FloorRenderer } from './FloorRenderer'
import { WallRenderer } from './WallRenderer'

/** Capa Piso: texturas pintadas, encima las salas generadas y encima puertas y muros sobre bordes. */
export class FloorLayerRenderer implements LayerRenderer {
  readonly container = new Container()
  private cells = new FloorRenderer()
  private rooms = new DungeonRenderer()
  private walls = new WallRenderer()

  constructor() {
    this.container.addChild(this.cells.container, this.rooms.container, this.walls.container)
  }

  update(layer: Layer, ctx: RenderCtx) {
    this.cells.update(layer, ctx)
    this.rooms.update(layer, ctx)
    this.walls.update(layer, ctx)
  }

  destroy() {
    this.cells.destroy()
    this.rooms.destroy()
    this.walls.destroy()
    this.container.destroy()
  }
}
