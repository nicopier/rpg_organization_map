import type { Patch } from 'immer'
import type { RollResult } from '../dice/notation'
import type { Campaign, Character } from '../model/types'

/** Lo que un jugador puede cargar al crear su personaje. */
export type CharacterInput = Pick<Character, 'name' | 'ac' | 'speed' | 'initiativeMod' | 'color'> & { hpMax: number; image?: string }

/**
 * Entrada del log de la mesa: una tirada o un mensaje.
 * - public: la ven todos.
 * - secret: tirada que sólo ven quien tiró y el DM; al resto le llega sin resultado (`hidden`).
 * - whisper: mensaje que sólo ven quien lo mandó, el destinatario y el DM.
 */
export type LogEntry = {
  id: string
  ts: number
  /** 'dm' o el id del jugador. */
  from: string
  /** Personaje (o nombre del jugador si no tiene), o "DM". */
  name: string
  color: string
  kind: 'roll' | 'chat'
  vis: 'public' | 'secret' | 'whisper'
  /** Destinatario de un susurro: 'dm' o id de jugador. */
  to?: string
  toName?: string
  text?: string
  expr?: string
  label?: string
  result?: RollResult
  /** Tirada secreta de otro: se sabe que pasó, no qué salió. */
  hidden?: boolean
}

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
  // Todos: tiradas y chat (el servidor tira los dados)
  | { t: 'roll'; expr: string; label?: string; secret?: boolean }
  | { t: 'chat'; text: string; to?: string }
  /** Sólo el DM. */
  | { t: 'clearLog' }

export type ServerMsg =
  | { t: 'welcome'; role: 'dm'; campaign: Campaign | null }
  | { t: 'welcome'; role: 'player'; playerId: string | null; view: Campaign }
  | { t: 'patches'; patches: Patch[] }
  | { t: 'view'; view: Campaign }
  | { t: 'presence'; online: string[] }
  | { t: 'error'; message: string }
  /** Historial del log (al entrar, o vacío al limpiarlo). */
  | { t: 'log'; entries: LogEntry[] }
  | { t: 'logEntry'; entry: LogEntry }
  /** Una tirada que no se pudo hacer: sólo a quien la pidió. */
  | { t: 'rollError'; message: string }
