/**
 * Cada mapa tiene 4 capas fijas, de abajo hacia arriba:
 *  - floor:  salas (generador), texturas de piso y puertas/muros sobre los bordes
 *  - object: muebles y decorado
 *  - npc:    NPCs del mapa
 *  - game:   lo de la partida: tokens de la party y marcas de la sesión (más la niebla, aparte)
 */
export type LayerKind = 'floor' | 'object' | 'npc' | 'game'
/** inamovible | lo mueve el DM | lo mueve su dueño */
export type Permission = 'static' | 'dm' | 'owner'
/** lo ven todos | sólo el DM (puerta secreta, trampa) */
export type Visibility = 'all' | 'dm'
export type Rotation = 0 | 90 | 180 | 270

export type Grid = {
  cols: number
  rows: number
  cellPx: number
  show: boolean
  color: string
  bg: string
}

export type FloorCell = { assetId: string } | { color: string }

export type WallKind = 'wall' | 'door' | 'secretDoor' | 'window'

/** Pieza sobre un borde de casilla ("x,y,h" o "x,y,v"). Las puertas abren un hueco en la pared de la sala. */
export type WallPiece = {
  kind: WallKind
  visibility?: Visibility
}

/**
 * Forma del generador de salas (estilo Dungeon Scrawl). Coordenadas en casillas.
 * Las formas se aplican en orden: 'add' suma piso y funde paredes, 'sub' abre un hueco.
 */
export type RoomShape =
  | { id: string; op: 'add' | 'sub'; kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { id: string; op: 'add' | 'sub'; kind: 'path'; points: [number, number][]; radius: number }

/** Una forma nueva, antes de tener id (Omit distribuido sobre la unión). */
export type RoomShapeInput = { [K in RoomShape['kind']]: Omit<Extract<RoomShape, { kind: K }>, 'id'> }[RoomShape['kind']]

export type DungeonStyle = {
  floor: string
  wall: string
  /** Grosor del contorno en fracción de casilla. */
  wallWidth: number
  hatch: boolean
  hatchColor: string
  /** Ancho de la franja rayada en casillas. */
  hatchWidth: number
  /** Grilla dibujada sólo sobre el piso de las salas. */
  innerGrid: boolean
  shadow: boolean
}

/** Datos que el DM le cuelga a un objeto (clic derecho). Nunca llegan a los jugadores. */
export type DmNote = {
  text: string
  props: { k: string; v: string }[]
  /** Color del aura con que se marca el objeto en la vista del DM. */
  color: string
}

export type Placement = {
  id: string
  /** Id del catálogo, o TOKEN_ASSET para tokens de personaje dibujados por código. */
  assetId: string
  x: number
  y: number
  w: number
  h: number
  rot: Rotation
  flipX: boolean
  opacity?: number
  characterId?: string
  permission?: Permission
  visibility?: Visibility
  note?: DmNote
}

export type Layer = {
  id: string
  name: string
  kind: LayerKind
  visible: boolean
  locked: boolean
  opacity: number
  permission: Permission
  visibility: Visibility
  /** floor: texturas de piso, clave "x,y" */
  cells?: Record<string, FloorCell>
  /** floor: formas de las salas y su estilo */
  shapes?: RoomShape[]
  dungeon?: DungeonStyle
  /** floor: puertas, ventanas y muros sueltos sobre bordes */
  walls?: Record<string, WallPiece>
  /** object, npc, game */
  items?: Placement[]
}

export type Character = {
  id: string
  name: string
  kind: 'pc' | 'npc'
  /** 'dm' o el id del jugador que lo controla */
  owner: string
  hp: { cur: number; max: number; temp: number }
  ac: number
  speed: number
  initiativeMod: number
  conditions: string[]
  notes: string
  color: string
  /** Imagen del token (URL servida por el servidor de la partida). */
  image?: string
  /** El DM le congeló el movimiento a este personaje. */
  moveLocked?: boolean
}

export type CombatEntry = { characterId: string; initiative: number }

export type Combat = {
  active: boolean
  round: number
  turnIndex: number
  order: CombatEntry[]
}

/** Niebla de guerra: casillas descubiertas. Con enabled=false todo se ve. */
export type Fog = {
  enabled: boolean
  revealed: Record<string, 1>
}

export type MapDoc = {
  id: string
  name: string
  /** Carpeta o mapa que lo contiene; null = raíz. */
  parentId: string | null
  grid: Grid
  layers: Layer[]
  /** NPCs de este mapa. Los PJ viven en la campaña (party). */
  characters: Character[]
  combat: Combat
  fog: Fog
  /**
   * Los jugadores ven el nombre real de los NPC de este mapa. Apagado (por defecto) los ven
   * numerados ("NPC 1", "NPC 2"), que alcanza para seguir la iniciativa sin spoilear quién es quién.
   */
  revealNpcNames?: boolean
}

/** Carpeta del árbol de mapas. Puede estar dentro de otra carpeta o de un mapa. */
export type Zone = { id: string; name: string; parentId?: string | null }

export type Player = {
  id: string
  /** Vacío hasta que el invitado elige su nombre al entrar. */
  name: string
  color: string
  /** Clave del link de invitación. Nunca se manda a los jugadores. */
  key?: string
}

export type Campaign = {
  version: 2
  id: string
  name: string
  zones: Zone[]
  maps: MapDoc[]
  /** Personajes de los jugadores: viajan de mapa en mapa. */
  party: Character[]
  players: Player[]
  /** El mapa donde está la mesa: es el que ven los jugadores. */
  activeMapId: string | null
  /** El DM congeló el movimiento de todos los jugadores. */
  movementLocked?: boolean
}

export const TOKEN_ASSET = '@token'
