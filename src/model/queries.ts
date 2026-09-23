import type { Character, Grid, Layer, MapDoc, Permission, Placement } from './types'

export function findLayer(doc: MapDoc, id: string): Layer | undefined {
  return doc.layers.find((l) => l.id === id)
}

export function findItem(doc: MapDoc, id: string): { layer: Layer; item: Placement } | null {
  for (const layer of doc.layers) {
    const item = layer.items?.find((i) => i.id === id)
    if (item) return { layer, item }
  }
  return null
}

/** La ficha de un token: los NPC viven en el mapa, la party en la campaña. */
export function findCharacter(doc: MapDoc, id: string | undefined, party: Character[] = []): Character | undefined {
  return id ? (doc.characters.find((c) => c.id === id) ?? party.find((c) => c.id === id)) : undefined
}

export function effectivePermission(item: { permission?: Permission }, layer: Layer): Permission {
  return item.permission ?? layer.permission
}

/**
 * En modo construcción el DM mueve todo lo que no esté en una capa bloqueada.
 * En modo partida se respeta el permiso: lo inamovible no se arrastra.
 */
export function canMove(item: Placement, layer: Layer, mode: 'edit' | 'play'): boolean {
  if (layer.locked) return false
  if (mode === 'edit') return true
  return effectivePermission(item, layer) !== 'static'
}

export function footprintContains(p: Placement, x: number, y: number): boolean {
  return x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.cols && y < grid.rows
}

/** Objetos bajo una casilla, el de más arriba primero. Ignora capas ocultas o bloqueadas. */
export function itemsAt(
  doc: MapDoc,
  x: number,
  y: number,
  filter?: (layer: Layer, item: Placement) => boolean,
): { layer: Layer; item: Placement }[] {
  const out: { layer: Layer; item: Placement }[] = []
  for (let li = doc.layers.length - 1; li >= 0; li--) {
    const layer = doc.layers[li]
    if (!layer.visible || layer.locked || !layer.items) continue
    for (let i = layer.items.length - 1; i >= 0; i--) {
      const item = layer.items[i]
      if (footprintContains(item, x, y) && (!filter || filter(layer, item))) out.push({ layer, item })
    }
  }
  return out
}

/** Arista de la grilla más cercana a un punto en coordenadas de casilla (fraccionarias). */
export function nearestEdge(cx: number, cy: number): { key: string; dist: number } {
  const x = Math.floor(cx)
  const y = Math.floor(cy)
  const fx = cx - x
  const fy = cy - y
  const dv = Math.min(fx, 1 - fx)
  const dh = Math.min(fy, 1 - fy)
  if (dv < dh) return { key: `${fx < 0.5 ? x : x + 1},${y},v`, dist: dv }
  return { key: `${x},${fy < 0.5 ? y : y + 1},h`, dist: dh }
}

export type EdgeKey = { x: number; y: number; dir: 'h' | 'v' | 'b' }

export function parseWallKey(k: string): EdgeKey {
  const [x, y, dir] = k.split(',')
  return { x: Number(x), y: Number(y), dir: dir as EdgeKey['dir'] }
}

/** Aristas unitarias de un tramo recto entre dos vértices de la grilla. */
export function edgesBetween(ax: number, ay: number, bx: number, by: number): string[] {
  const keys: string[] = []
  if (ay === by) {
    for (let x = Math.min(ax, bx); x < Math.max(ax, bx); x++) keys.push(`${x},${ay},h`)
  } else if (ax === bx) {
    for (let y = Math.min(ay, by); y < Math.max(ay, by); y++) keys.push(`${ax},${y},v`)
  }
  return keys
}

export function cellsInRect(ax: number, ay: number, bx: number, by: number, grid: Grid): [number, number][] {
  const out: [number, number][] = []
  const x0 = Math.max(0, Math.min(ax, bx))
  const x1 = Math.min(grid.cols - 1, Math.max(ax, bx))
  const y0 = Math.max(0, Math.min(ay, by))
  const y1 = Math.min(grid.rows - 1, Math.max(ay, by))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y])
  return out
}

/** Distancia en casillas estilo 5e (diagonal cuenta 1). */
export function gridDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}
