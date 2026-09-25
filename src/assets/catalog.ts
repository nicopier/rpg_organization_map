import { GENERATED_ASSETS } from './catalog.generated'
import { CATEGORY_OVERRIDES, LABELS } from './overrides'
import type { AssetDef } from './types'

export const ASSETS: AssetDef[] = GENERATED_ASSETS.map((a) => {
  const label = LABELS[a.id] ?? (a.id.startsWith('number') ? `Número ${a.id.slice(6, 7)}` : a.label)
  return { ...a, label, category: CATEGORY_OVERRIDES[a.id] ?? a.category }
})

const byId = new Map(ASSETS.map((a) => [a.id, a]))

export function getAsset(id: string): AssetDef | undefined {
  return byId.get(id)
}

export function assetUrl(a: AssetDef): string {
  // Segmento por segmento: la barra de la subcarpeta tiene que seguir siendo barra en la URL.
  return `/assets/${a.file.split('/').map(encodeURIComponent).join('/')}`
}

/** Packs (subcarpetas de assets/) presentes, en el orden en que aparecen. */
export const PACKS: string[] = [...new Set(ASSETS.map((a) => a.pack).filter((p): p is string => !!p))]

/** "props-medievales" → "Props medievales". */
export function packLabel(pack: string): string {
  return pack
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

/** Tamaño del pack original: 70 px = 1 casilla. */
export const SOURCE_CELL_PX = 70
