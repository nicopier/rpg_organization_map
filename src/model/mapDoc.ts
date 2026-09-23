import { newId, newKey } from './ids'
import type {
  Campaign,
  Character,
  DungeonStyle,
  FloorCell,
  Layer,
  LayerKind,
  MapDoc,
  Permission,
  Placement,
  Player,
  RoomShape,
  WallPiece,
} from './types'

/** Look pergamino de Dungeon Scrawl: piso claro, contorno negro, rayado alrededor. */
export const DUNGEON_PRESETS: { name: string; style: DungeonStyle }[] = [
  {
    name: 'Pergamino',
    style: { floor: '#f1ebdf', wall: '#111111', wallWidth: 0.1, hatch: true, hatchColor: '#2a2a2a', hatchWidth: 0.45, innerGrid: true, shadow: true },
  },
  {
    name: 'Piedra oscura',
    style: { floor: '#8a8478', wall: '#1b1b1f', wallWidth: 0.14, hatch: true, hatchColor: '#3a3a40', hatchWidth: 0.6, innerGrid: true, shadow: true },
  },
  {
    name: 'Cueva',
    style: { floor: '#c9b48f', wall: '#4a3726', wallWidth: 0.12, hatch: false, hatchColor: '#4a3726', hatchWidth: 0.4, innerGrid: false, shadow: true },
  },
  {
    name: 'Plano limpio',
    style: { floor: '#ffffff', wall: '#000000', wallWidth: 0.08, hatch: false, hatchColor: '#000000', hatchWidth: 0.3, innerGrid: true, shadow: false },
  },
]

export const LAYER_DEFS: Record<LayerKind, { name: string; permission: Permission }> = {
  floor: { name: 'Piso', permission: 'static' },
  object: { name: 'Objetos', permission: 'static' },
  npc: { name: 'NPC', permission: 'dm' },
  game: { name: 'Juego', permission: 'owner' },
}

export const LAYER_ORDER: LayerKind[] = ['floor', 'object', 'npc', 'game']

export function makeLayer(kind: LayerKind): Layer {
  const layer: Layer = {
    id: newId('L'),
    name: LAYER_DEFS[kind].name,
    kind,
    visible: true,
    locked: false,
    opacity: 1,
    permission: LAYER_DEFS[kind].permission,
    visibility: 'all',
  }
  if (kind === 'floor') {
    layer.cells = {}
    layer.shapes = []
    layer.walls = {}
    layer.dungeon = { ...DUNGEON_PRESETS[0].style }
  } else {
    layer.items = []
  }
  return layer
}

export function createEmptyMap(name = 'Mapa sin título', cols = 30, rows = 20, parentId: string | null = null): MapDoc {
  return {
    id: newId('M'),
    name,
    parentId,
    grid: { cols, rows, cellPx: 70, show: false, color: '#00000033', bg: '#d9d0bd' },
    layers: LAYER_ORDER.map(makeLayer),
    characters: [],
    combat: { active: false, round: 1, turnIndex: 0, order: [] },
    fog: { enabled: false, revealed: {} },
  }
}

export function createCampaign(name = 'Mi campaña'): Campaign {
  const zone = { id: newId('Z'), name: 'General' }
  const map = createEmptyMap('Primer mapa', 30, 20, zone.id)
  return { version: 2, id: newId('K'), name, zones: [zone], maps: [map], party: [], players: [], activeMapId: map.id }
}

export const PLAYER_COLORS = ['#2980b9', '#c0392b', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#c2185b', '#d4a017']

export function makePlayer(name: string, index: number): Player {
  return { id: newId('J'), name, color: PLAYER_COLORS[index % PLAYER_COLORS.length], key: newKey() }
}

/** Nombre para mostrar: un invitado que todavía no entró no tiene nombre. */
export function playerLabel(p: Player | undefined): string {
  return p?.name || 'Invitado (sin usar)'
}

export function layerOfKind<T extends { layers: Layer[] }>(doc: T, kind: LayerKind): T['layers'][number] {
  return doc.layers.find((l) => l.kind === kind)!
}

/* ---------- Migración ---------- */

type V1Layer = {
  kind: 'floor' | 'dungeon' | 'wall' | 'object' | 'actor' | 'effect'
  cells?: Record<string, FloorCell>
  shapes?: RoomShape[]
  dungeon?: DungeonStyle
  walls?: Record<string, WallPiece & { form?: 'edge' | 'block' }>
  items?: Placement[]
}
type V1Map = {
  version: 1
  id: string
  name: string
  grid: MapDoc['grid']
  layers: V1Layer[]
  characters?: Character[]
  players?: string[]
  combat?: MapDoc['combat']
}

/**
 * Un mapa v1 (capas libres) pasa a las 4 capas fijas. Los PJ salen del mapa y van a la party;
 * los nombres de jugador pasan a ser jugadores con id. Los bloques de pared no tienen equivalente
 * (las salas los reemplazan) y se descartan.
 */
function migrateV1Map(v1: V1Map, parentId: string | null) {
  const map = createEmptyMap(v1.name, v1.grid.cols, v1.grid.rows, parentId)
  map.id = v1.id
  map.grid = { ...map.grid, ...v1.grid }
  const [floor, objects, npcs, game] = LAYER_ORDER.map((k) => layerOfKind(map, k))
  const chars = v1.characters ?? []
  const isPc = (id?: string) => chars.find((c) => c.id === id)?.kind === 'pc'
  let droppedBlocks = 0
  let gotStyle = false

  for (const l of v1.layers) {
    if (l.kind === 'floor') Object.assign(floor.cells!, l.cells)
    else if (l.kind === 'dungeon') {
      floor.shapes!.push(...(l.shapes ?? []))
      // Si había varias capas de salas, se queda con el estilo de la primera.
      if (l.dungeon && !gotStyle) {
        floor.dungeon = l.dungeon
        gotStyle = true
      }
    } else if (l.kind === 'wall') {
      for (const [k, w] of Object.entries(l.walls ?? {})) {
        if (w.form === 'block' || k.endsWith(',b')) {
          droppedBlocks++
          continue
        }
        floor.walls![k] = { kind: w.kind, ...(w.visibility ? { visibility: w.visibility } : {}) }
      }
    } else if (l.kind === 'object' || l.kind === 'effect') {
      // Lo que estaba en una capa "móvil" conserva ese permiso como override.
      const perm = (l as { permission?: Permission }).permission
      objects.items!.push(...(l.items ?? []).map((it) => (perm && perm !== 'static' && !it.permission ? { ...it, permission: perm } : it)))
    } else if (l.kind === 'actor') {
      for (const it of l.items ?? []) (isPc(it.characterId) ? game : npcs).items!.push(it)
    }
  }

  const players = (v1.players ?? []).map((name, i) => makePlayer(name, i))
  const byName = new Map(players.map((p) => [p.name, p.id]))
  const party = chars
    .filter((c) => c.kind === 'pc')
    .map((c) => ({ ...c, owner: c.owner === 'dm' ? 'dm' : (byName.get(c.owner) ?? 'dm') }))
  map.characters = chars.filter((c) => c.kind !== 'pc')
  map.combat = { ...map.combat, ...v1.combat }
  return { map, party, players, droppedBlocks }
}

function fillMap(raw: Partial<MapDoc> & { zoneId?: string | null }): MapDoc {
  // Antes cada mapa tenía una zona; ahora tiene un padre (carpeta o mapa).
  const { zoneId, ...m } = raw
  if (m.parentId === undefined) m.parentId = zoneId ?? null
  const base = createEmptyMap(m.name, m.grid?.cols, m.grid?.rows, m.parentId)
  const layers = LAYER_ORDER.map((k) => {
    const found = m.layers?.find((l) => l.kind === k)
    return found ? { ...makeLayer(k), ...found } : makeLayer(k)
  })
  return {
    ...base,
    ...m,
    grid: { ...base.grid, ...m.grid },
    layers,
    characters: m.characters ?? [],
    combat: { ...base.combat, ...m.combat },
    fog: { ...base.fog, ...m.fog },
  } as MapDoc
}

/** Acepta una campaña v2 o un mapa suelto v1 (lo envuelve en una campaña nueva). */
export function migrateCampaign(raw: unknown): { campaign: Campaign; notes: string[] } {
  if (!raw || typeof raw !== 'object') throw new Error('El archivo no es una campaña ni un mapa válido.')
  const r = raw as { version?: number }
  const notes: string[] = []
  if (r.version === 2) {
    const c = raw as Partial<Campaign>
    if (!Array.isArray(c.maps)) throw new Error('A la campaña le faltan los mapas.')
    const base = createCampaign(c.name)
    const campaign: Campaign = {
      ...base,
      ...c,
      version: 2,
      zones: c.zones?.length ? c.zones : base.zones,
      maps: c.maps.map(fillMap),
      party: c.party ?? [],
      // Campañas de antes de las invitaciones: cada jugador recibe su clave.
      players: (c.players ?? []).map((p) => (p.key ? p : { ...p, key: newKey() })),
      activeMapId: c.activeMapId ?? c.maps[0]?.id ?? null,
    } as Campaign
    return { campaign, notes }
  }
  if (r.version === 1) {
    const v1 = raw as V1Map
    if (!v1.grid || !Array.isArray(v1.layers)) throw new Error('Al mapa le faltan la grilla o las capas.')
    const campaign = createCampaign('Mi campaña')
    const { map, party, players, droppedBlocks } = migrateV1Map(v1, campaign.zones[0].id)
    campaign.maps = [map]
    campaign.party = party
    campaign.players = players
    campaign.activeMapId = map.id
    if (droppedBlocks) notes.push(`Se descartaron ${droppedBlocks} bloques de pared: ahora las paredes las generan las salas.`)
    return { campaign, notes }
  }
  throw new Error(`Versión no soportada: ${String(r.version)}`)
}

/** Importar un mapa (v1 o de otra campaña v2) dentro de la campaña actual. */
export function importMapInto(raw: unknown, parentId: string | null): { map: MapDoc; party: Character[]; players: Player[] } {
  const r = raw as { version?: number }
  if (r?.version === 1) {
    const { map, party, players } = migrateV1Map(raw as V1Map, parentId)
    map.id = newId('M')
    return { map, party, players }
  }
  throw new Error('Sólo se pueden importar mapas sueltos (.mappa.json). Para una campaña entera usá "Abrir campaña".')
}

export const cellKey = (x: number, y: number) => `${x},${y}`

export function parseCellKey(k: string): [number, number] {
  const [x, y] = k.split(',')
  return [Number(x), Number(y)]
}
