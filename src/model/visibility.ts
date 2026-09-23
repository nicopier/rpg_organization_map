import type { Layer, Visibility } from './types'

export type Viewer = 'dm' | 'player'

/** Visibilidad efectiva: override del elemento si existe, si no el default de la capa. */
export function effectiveVisibility(el: { visibility?: Visibility }, layer: Layer): Visibility {
  return el.visibility ?? layer.visibility
}

/**
 * Única regla de qué ve cada quien. La usan el render, la vista de jugador
 * y, a futuro, el servidor para filtrar lo que se manda a cada cliente.
 */
export function isVisibleTo(el: { visibility?: Visibility }, layer: Layer, viewer: Viewer): boolean {
  if (!layer.visible) return false
  if (viewer === 'dm') return true
  return effectiveVisibility(el, layer) === 'all'
}

/** Hay algo que el DM ve pero el jugador no: se dibuja atenuado con marca. */
export function isHiddenFromPlayers(el: { visibility?: Visibility }, layer: Layer): boolean {
  return effectiveVisibility(el, layer) === 'dm'
}
