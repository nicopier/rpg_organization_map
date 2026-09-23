import { findLayer, inBounds } from '../model/queries'
import type { Layer, LayerKind } from '../model/types'
import { useMap } from '../state/mapStore'

export const S = () => useMap.getState()

const KIND_LABEL: Record<LayerKind, string> = {
  floor: 'piso',
  object: 'objetos',
  npc: 'NPC',
  game: 'juego',
}

/**
 * Devuelve la capa donde debe actuar una herramienta. Si la activa no es del tipo correcto,
 * cambia a la más alta que sí lo sea (y avisa), así no hay que ir al panel de capas a cada rato.
 */
export function ensureLayer(kinds: LayerKind[], prefer?: (l: Layer) => boolean): Layer | null {
  const { doc, activeLayerId } = S()
  const active = findLayer(doc, activeLayerId)
  if (active && kinds.includes(active.kind) && !active.locked) return active
  const candidates = [...doc.layers].reverse().filter((l) => kinds.includes(l.kind) && !l.locked)
  const pick = (prefer && candidates.find(prefer)) || candidates[0]
  if (!pick) {
    const lockedMatch = doc.layers.some((l) => kinds.includes(l.kind))
    S().toast(
      lockedMatch
        ? `La capa de ${KIND_LABEL[kinds[0]]} está bloqueada.`
        : `No hay ninguna capa de ${KIND_LABEL[kinds[0]]}. Creala en el panel de capas.`,
    )
    return null
  }
  if (!pick.visible) S().toast(`La capa "${pick.name}" está oculta: lo que hagas no se va a ver.`)
  if (pick.id !== activeLayerId) S().setUi({ activeLayerId: pick.id })
  return pick
}

/** Casillas entre dos puntos (Bresenham), para que un trazo rápido no deje huecos. */
export function cellLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    out.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return out
}

export function inGrid(cells: [number, number][]): [number, number][] {
  const { grid } = S().doc
  return cells.filter(([x, y]) => inBounds(grid, x, y))
}

export function hoverCell(p: { cx: number; cy: number }) {
  const { grid } = S().doc
  return inBounds(grid, p.cx, p.cy) ? { x: p.cx, y: p.cy } : null
}

/** Una arista está dentro del mapa si sus dos extremos lo están. */
export function edgeInBounds(key: string): boolean {
  const { grid } = S().doc
  const [xs, ys, dir] = key.split(',')
  const x = Number(xs)
  const y = Number(ys)
  if (dir === 'h') return x >= 0 && x < grid.cols && y >= 0 && y <= grid.rows
  if (dir === 'v') return x >= 0 && x <= grid.cols && y >= 0 && y < grid.rows
  return inBounds(grid, x, y)
}
