import type { Patch } from 'immer'
import type { Campaign, Character } from '../model/types'

/** Lo que un jugador puede cargar al crear su personaje. */
export type CharacterInput = Pick<Character, 'name' | 'ac' | 'speed' | 'initiativeMod' | 'color'> & { hpMax: number; image?: string }

export type ClientMsg =
  | { t: 'hello'; role: 'dm' }
  | { t: 'hello'; role: 'player'; key: string | null }
  // DM
  | { t: 'init'; campaign: Campaign }
  | { t: 'patches'; patches: Patch[] }
  // Jugador
  /** El invitado elige (o cambia) su nombre. */
  | { t: 'join'; name: string }
  | { t: 'claim'; characterId: string }
  | { t: 'createCharacter'; input: CharacterInput }
  | { t: 'move'; characterId: string; x: number; y: number }
  | { t: 'char'; characterId: string; patch: Character }

export type ServerMsg =
  | { t: 'welcome'; role: 'dm'; campaign: Campaign | null }
  | { t: 'welcome'; role: 'player'; playerId: string | null; view: Campaign }
  | { t: 'patches'; patches: Patch[] }
  | { t: 'view'; view: Campaign }
  | { t: 'presence'; online: string[] }
  | { t: 'error'; message: string }
