import type { Campaign, Character, MapDoc } from './types'

/** Personaje de un jugador (no del DM): el que tira su propia iniciativa. */
export function isPlayerOwned(ch: Pick<Character, 'kind' | 'owner'> | undefined): boolean {
  return !!ch && ch.kind === 'pc' && ch.owner !== 'dm'
}

/**
 * Ordena la iniciativa de mayor a menor (desempata el modificador); los que todavía no tiraron van al final.
 * Si ya empezó a correr la ronda, el turno sigue en quien lo tenía; si nadie jugó todavía, arranca el primero.
 */
export function sortCombat(m: Pick<MapDoc, 'combat' | 'characters'>, party: Pick<Campaign, 'party'>['party']) {
  const mod = (id: string) => (m.characters.find((x) => x.id === id) ?? party.find((x) => x.id === id))?.initiativeMod ?? 0
  const cur = m.combat.order[m.combat.turnIndex]?.characterId
  const fresh = m.combat.round === 1 && m.combat.turnIndex === 0
  m.combat.order.sort(
    (a, b) => Number(!!a.pending) - Number(!!b.pending) || b.initiative - a.initiative || mod(b.characterId) - mod(a.characterId),
  )
  m.combat.turnIndex = fresh ? 0 : Math.max(0, m.combat.order.findIndex((e) => e.characterId === cur))
}

/** "1d20+3": la tirada de iniciativa de un personaje. */
export function initiativeExpr(mod: number): string {
  return mod ? `1d20${mod > 0 ? '+' : ''}${mod}` : '1d20'
}
