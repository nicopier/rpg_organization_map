export type Pointer = {
  /** Coordenadas de mundo. */
  wx: number
  wy: number
  /** Casilla fraccionaria (para aristas y vértices). */
  fx: number
  fy: number
  /** Casilla entera. */
  cx: number
  cy: number
  shift: boolean
  ctrl: boolean
  alt: boolean
}

export interface ToolHandler {
  down?(p: Pointer): void
  drag?(p: Pointer): void
  up?(p: Pointer): void
  hover?(p: Pointer): void
  cancel?(): void
}
