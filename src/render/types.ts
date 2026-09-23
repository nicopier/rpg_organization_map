import type { Container } from 'pixi.js'
import type { Character, Layer, MapDoc } from '../model/types'
import type { Viewer } from '../model/visibility'

export type RenderCtx = {
  doc: MapDoc
  viewer: Viewer
  /** Tamaño de casilla en unidades de mundo. */
  c: number
  chars: Map<string, Character>
  /** Personaje cuyo turno es, para resaltarlo. */
  activeCharId: string | null
  /** Cambia cuando hay que reconstruir todo (vista, tamaño de casilla, texturas). */
  epoch: number
}

export interface LayerRenderer {
  readonly container: Container
  update(layer: Layer, ctx: RenderCtx): void
  destroy(): void
}

/** Violeta reservado para "oculto para los jugadores" en toda la app. */
export const HIDDEN_COLOR = 0xb04cff
export const HIDDEN_ALPHA = 0.45
