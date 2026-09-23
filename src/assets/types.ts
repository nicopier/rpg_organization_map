export type AssetCategory = 'floor' | 'structure' | 'prop' | 'effect' | 'marker'

export type AssetDef = {
  id: string
  file: string
  w: number // footprint en casillas
  h: number
  category: AssetCategory
  label: string
}
