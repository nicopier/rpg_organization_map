import { create } from 'zustand'
import type { LogEntry } from '../net/protocol'

type LogState = {
  entries: LogEntry[]
  /** Último error de una tirada propia (expresión inválida, spam). */
  rollError: { text: string; id: number } | null
  /** Hasta cuándo (reloj de este navegador) no se puede volver a tirar. */
  cooldownUntil: number
  /** Tiradas que los dados 3D todavía están animando: el log no muestra su resultado hasta que frenan. */
  rolling: Record<string, true>
}

export const useLog = create<LogState>(() => ({ entries: [], rollError: null, cooldownUntil: 0, rolling: {} }))

/** Quién escucha las entradas que llegan en vivo (no el historial): los dados 3D, avisos. */
const live = new Set<(e: LogEntry) => void>()

export function onLiveEntry(fn: (e: LogEntry) => void): () => void {
  live.add(fn)
  return () => live.delete(fn)
}

export const logActions = {
  set(entries: LogEntry[]) {
    useLog.setState({ entries })
  },
  add(entry: LogEntry) {
    // Primero los que escuchan: así los dados 3D retienen la tirada antes de que el log la muestre.
    for (const fn of live) fn(entry)
    useLog.setState((s) => ({ entries: [...s.entries, entry].slice(-500) }))
  },
  cooldown(ms: number) {
    useLog.setState({ cooldownUntil: Date.now() + ms })
  },
  hold(id: string) {
    useLog.setState((s) => ({ rolling: { ...s.rolling, [id]: true } }))
  },
  release(id: string) {
    if (!useLog.getState().rolling[id]) return
    useLog.setState((s) => {
      const { [id]: _, ...rolling } = s.rolling
      return { rolling }
    })
  },
  error(text: string) {
    useLog.setState({ rollError: { text, id: Date.now() } })
  },
}
