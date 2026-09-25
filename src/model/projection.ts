import { cellKey, createEmptyMap } from './mapDoc'
import { TOKEN_ASSET, type Campaign, type Character, type Layer, type MapDoc, type Placement } from './types'
import { mapOfCharacter } from './tree'
import { isVisibleTo } from './visibility'

/** Id del mapa vacío que se manda cuando todavía no hay mesa. */
export const NO_MAP = '@none'

/**
 * Una ficha ajena tal como la ve un jugador: nombre, color e imagen, sin números ni estados.
 * Sólo queda si está caído (hp.cur 0); hp.max 0 le dice al cliente que la vida es desconocida.
 */
function withoutStats(c: Character): Character {
  return { ...c, hp: { cur: c.hp.cur <= 0 ? 0 : 1, max: 0, temp: 0 }, ac: 0, speed: 0, initiativeMod: 0, conditions: [], notes: '' }
}

function filterMap(m: MapDoc, partyIds: Set<string>): MapDoc {
  const fogOn = m.fog.enabled
  const seen = (x: number, y: number) => !fogOn || !!m.fog.revealed[cellKey(x, y)]
  const anySeen = (it: Placement) => {
    for (let i = 0; i < it.w; i++) for (let j = 0; j < it.h; j++) if (seen(it.x + i, it.y + j)) return true
    return false
  }

  const layers: Layer[] = m.layers.map((l) => {
    const hiddenLayer = !l.visible || l.visibility === 'dm'
    if (l.kind === 'floor') {
      if (hiddenLayer) return { ...l, cells: {}, shapes: [], walls: {} }
      const cells = fogOn ? Object.fromEntries(Object.entries(l.cells ?? {}).filter(([k]) => m.fog.revealed[k])) : l.cells
      const walls: NonNullable<Layer['walls']> = {}
      for (const [k, w] of Object.entries(l.walls ?? {})) {
        if (isVisibleTo(w, l, 'player')) walls[k] = { kind: w.kind }
        // Una puerta secreta sin revelar se manda como pared lisa: el jugador no puede saber que existe.
        else if (w.kind === 'secretDoor') walls[k] = { kind: 'wall' }
      }
      return { ...l, cells, walls }
    }
    const items = hiddenLayer
      ? []
      : (l.items ?? []).filter((it) => {
          if (!isVisibleTo(it, l, 'player')) return false
          // La party siempre se ve a sí misma, aunque esté en la niebla.
          if (it.assetId === TOKEN_ASSET && it.characterId && partyIds.has(it.characterId)) return true
          return anySeen(it)
        })
    return { ...l, items: items.map(({ visibility: _v, note: _n, ...rest }) => rest) }
  })

  const visibleNpc = new Set(layers.flatMap((l) => (l.kind === 'npc' ? (l.items ?? []).map((i) => i.characterId) : [])))
  // El nombre del NPC no sale de la PC del DM salvo que este mapa lo revele. Se numeran por su
  // orden en el mapa (no por el de los visibles) para que el número no cambie cuando aparece otro.
  const npcNumber = new Map(m.characters.map((c, i) => [c.id, i + 1]))
  const anonymize = (c: Character): Character => (m.revealNpcNames ? c : { ...c, name: `NPC ${npcNumber.get(c.id)}` })
  const characters = m.characters
    .filter((c) => visibleNpc.has(c.id))
    .map(withoutStats)
    .map(anonymize)

  // En el orden de combate sólo aparecen los que el jugador ve.
  const known = new Set([...partyIds, ...characters.map((c) => c.id)])
  const current = m.combat.order[m.combat.turnIndex]?.characterId
  const order = m.combat.order.filter((e) => known.has(e.characterId))
  const combat = { ...m.combat, order, turnIndex: order.findIndex((e) => e.characterId === current) }

  return { ...m, layers, characters, combat }
}

/**
 * Lo que recibe un jugador: sólo el mapa donde está (o el de la mesa), sin nada oculto ni bajo la niebla,
 * y con los stats (HP, CA, estados, notas) sólo de su propio personaje.
 * La calcula el servidor: lo que no está acá nunca sale de la PC del DM.
 */
export function projectForPlayer(c: Campaign, playerId: string | null): Campaign {
  const partyIds = new Set(c.party.map((p) => p.id))
  // La party se puede separar: cada jugador ve el mapa donde está su personaje;
  // si todavía no está en ninguno, el de la mesa.
  const mine = c.party.filter((p) => p.owner === playerId)
  const own = mine.map((p) => mapOfCharacter(c, p.id)).find(Boolean)
  const active = own ?? c.maps.find((m) => m.id === c.activeMapId)
  const map = active ? filterMap(active, partyIds) : { ...createEmptyMap(''), id: NO_MAP }
  return {
    ...c,
    zones: [],
    maps: [map],
    party: c.party.map((p) => (p.owner === playerId ? p : withoutStats(p))),
    // Las claves de invitación no salen nunca de la PC del DM.
    players: c.players.map(({ key: _k, ...p }) => p),
    activeMapId: active ? active.id : null,
  }
}
