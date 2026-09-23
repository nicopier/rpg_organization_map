import { useEffect } from 'react'
import { exportCampaign } from '../io/serialize'
import { useMap, type Tool } from '../state/mapStore'
import {
  duplicateSelection,
  flipSelection,
  nudgeSelection,
  removeSelection,
  rotateSelection,
  setTool,
  toggleHiddenSelection,
  togglePlayerView,
} from './commands'

const EDIT_KEYS: Record<string, Tool> = { v: 'select', d: 'room', b: 'paint', w: 'wall', o: 'place', t: 'token', e: 'erase', m: 'measure' }
const PLAY_KEYS: Record<string, Tool> = { v: 'select', n: 'fog', o: 'place', m: 'measure' }
const PLAYER_KEYS: Record<string, Tool> = { v: 'select', m: 'measure' }

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || document.querySelector('.modal')) return
      const s = useMap.getState()
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      // El jugador sólo selecciona, mide y mueve su token.
      if (s.role === 'player') {
        if (PLAYER_KEYS[k] && !mod) s.setUi({ tool: PLAYER_KEYS[k] })
        else if (e.key === 'Escape') s.setUi({ tool: 'select', selection: { type: 'none' } })
        return
      }

      if (mod) {
        if (k === 'z' && !e.shiftKey) s.undo()
        else if (k === 'y' || (k === 'z' && e.shiftKey)) s.redo()
        else if (k === 's') exportCampaign(s.campaign)
        else if (k === 'd') duplicateSelection()
        else return
        e.preventDefault()
        return
      }
      if (e.altKey) return

      const keys = s.mode === 'edit' ? EDIT_KEYS : PLAY_KEYS
      if (keys[k]) return setTool(keys[k])
      if (ARROWS[e.key]) {
        e.preventDefault()
        return nudgeSelection(...ARROWS[e.key])
      }
      switch (e.key) {
        case 'r':
        case 'R':
          return rotateSelection()
        case 'f':
        case 'F':
          return flipSelection()
        case 'h':
        case 'H':
          return s.viewer === 'dm' && toggleHiddenSelection()
        case 'p':
        case 'P':
          return togglePlayerView()
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          return removeSelection()
        case 'Escape':
          if (s.tool !== 'select') s.setUi({ tool: 'select' })
          else s.setUi({ selection: { type: 'none' } })
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
