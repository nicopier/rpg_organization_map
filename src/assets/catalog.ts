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
  return `/assets/${encodeURIComponent(a.file)}`
}

/** Tamaño del pack original: 70 px = 1 casilla. */
export const SOURCE_CELL_PX = 70
