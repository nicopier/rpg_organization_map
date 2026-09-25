import { create } from 'zustand'
import type { LogEntry } from '../net/protocol'

type LogState = {
  entries: LogEntry[]
  /** Último error de una tirada propia (expresión inválida, spam). */
  rollError: { text: string; id: number } | null
}

export const useLog = create<LogState>(() => ({ entries: [], rollError: null }))

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
    useLog.setState((s) => ({ entries: [...s.entries, entry].slice(-500) }))
    for (const fn of live) fn(entry)
  },
  error(text: string) {
    useLog.setState({ rollError: { text, id: Date.now() } })
  },
}
