import type { TokenDraft } from '../state/mapStore'
import type { Rotation } from '../model/types'

/**
 * Estado transitorio de las herramientas (fantasmas, trazos, marcos). Vive fuera del store
 * para no re-renderizar React a 60 fps; el overlay lo lee y se redibuja con requestOverlay().
 */
export type Preview = {
  hover: { x: number; y: number } | null
  /** Rectángulo en casillas (pintar, borrar). */
  cellRect: { x0: number; y0: number; x1: number; y1: number; color: number } | null
  /** Marco de selección múltiple en casillas. */
  marquee: { x0: number; y0: number; x1: number; y1: number } | null
  /** Línea entre vértices de la grilla (muro) o centros de casilla (regla). */
  line: { ax: number; ay: number; bx: number; by: number; color: number; label?: string } | null
  /** Aristas que se van a crear o borrar. */
  edges: { keys: string[]; color: number } | null
  /** Forma de sala en curso (azul suma, rojo resta). */
  room:
    | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number; op: 'add' | 'sub' }
    | { kind: 'path'; points: [number, number][]; radius: number; op: 'add' | 'sub' }
    | null
  ghost:
    | { kind: 'asset'; assetId: string; x: number; y: number; w: number; h: number; rot: Rotation; flip: boolean; ok: boolean }
    | { kind: 'token'; draft: TokenDraft; x: number; y: number; ok: boolean }
    | null
}

export const preview: Preview = { hover: null, cellRect: null, marquee: null, line: null, edges: null, room: null, ghost: null }

let listener: (() => void) | null = null
export function onPreviewChange(fn: () => void) {
  listener = fn
}

export function setPreview(p: Partial<Preview>) {
  Object.assign(preview, p)
  listener?.()
}

export function clearPreview() {
  setPreview({ cellRect: null, marquee: null, line: null, edges: null, room: null, ghost: null })
}
