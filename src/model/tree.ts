import type { Campaign, MapDoc, Zone } from './types'

/** Un nodo del árbol de mapas: carpeta (zona) o mapa. Los dos pueden tener hijos. */
export type NodeKind = 'zone' | 'map'

/**
 * Padre efectivo: si apunta a algo que ya no existe (un archivo viejo, un borrado a medias),
 * el nodo se muestra en la raíz en vez de perderse.
 */
function effectiveParent(c: Campaign, parentId: string | null | undefined): string | null {
  if (!parentId) return null
  return c.zones.some((z) => z.id === parentId) || c.maps.some((m) => m.id === parentId) ? parentId : null
}

export function childrenOf(c: Campaign, parentId: string | null): { zones: Zone[]; maps: MapDoc[] } {
  return {
    zones: c.zones.filter((z) => effectiveParent(c, z.parentId) === parentId),
    maps: c.maps.filter((m) => effectiveParent(c, m.parentId) === parentId),
  }
}

export function parentOf(c: Campaign, id: string): string | null {
  const node = c.zones.find((z) => z.id === id) ?? c.maps.find((m) => m.id === id)
  return effectiveParent(c, node?.parentId)
}

/** ¿`id` está dentro de `ancestorId` (a cualquier profundidad)? Evita meter un nodo dentro de sí mismo. */
export function isInside(c: Campaign, id: string, ancestorId: string): boolean {
  const seen = new Set<string>()
  let p = parentOf(c, id)
  while (p && !seen.has(p)) {
    if (p === ancestorId) return true
    seen.add(p)
    p = parentOf(c, p)
  }
  return false
}

/** Cantidad de mapas debajo de un nodo, a cualquier profundidad. */
export function countMaps(c: Campaign, parentId: string): number {
  const { zones, maps } = childrenOf(c, parentId)
  return maps.reduce((n, m) => n + 1 + countMaps(c, m.id), 0) + zones.reduce((n, z) => n + countMaps(c, z.id), 0)
}

/** Nombres desde la raíz hasta el nodo, p. ej. ["Ciudad", "Patio", "Cripta"]. */
export function pathOf(c: Campaign, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let cur: string | null = id
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const node: { name: string } | undefined = c.zones.find((z) => z.id === cur) ?? c.maps.find((m) => m.id === cur)
    if (!node) break
    out.unshift(node.name)
    cur = parentOf(c, cur)
  }
  return out
}

/** Mapa donde está el token de un personaje de la party, o null si no está en ninguno. */
export function mapOfCharacter(c: Campaign, characterId: string): MapDoc | null {
  for (const m of c.maps) {
    const game = m.layers.find((l) => l.kind === 'game')
    if (game?.items?.some((i) => i.characterId === characterId)) return m
  }
  return null
}
