import { canMove } from '../model/queries'
import type { Rotation } from '../model/types'
import { currentScene } from '../render/Scene'
import { deleteSelection, duplicateItems, flipItems, resizeItems, rotateItems, setPositions, toggleHiddenSelection, toggleHighlightSelection } from '../state/actions'
import { useMap, type Tool } from '../state/mapStore'
import { refreshGhost } from '../tools/placeItem'

const S = () => useMap.getState()

/** Ids seleccionados que se pueden mover en el modo actual. Avisa si alguno quedó afuera. */
function movableSelection(): string[] {
  const { selection, doc, mode, campaign } = S()
  if (selection.type !== 'items') return []
  const partyIds = new Set(campaign.party.map((p) => p.id))
  const ok: string[] = []
  let blocked = false
  for (const l of doc.layers) {
    for (const it of l.items ?? []) {
      if (!selection.ids.includes(it.id)) continue
      if (canMove(it, l, mode, { partyIds })) ok.push(it.id)
      else blocked = true
    }
  }
  if (blocked) S().toast('Los personajes de los jugadores no se tocan en modo juego: se dejaron como estaban.')
  return ok
}

export function setTool(tool: Tool) {
  const s = S()
  if (tool === 'place' && !s.placeAssetId) return s.toast('Elegí un objeto en la paleta de la izquierda.')
  if (tool === 'token' && !s.tokenDraft) return s.toast('Elegí un NPC en el panel NPC.')
  if (s.viewer === 'player' && tool !== 'select' && tool !== 'measure' && tool !== 'pan') {
    s.setUi({ viewer: 'dm' })
    s.toast('Volviste a la vista DM para editar.')
  }
  s.setUi({ tool })
}

export function rotateSelection() {
  const s = S()
  if (s.tool === 'place' || s.tool === 'token') {
    s.setUi({ placeRot: ((s.placeRot + 90) % 360) as Rotation })
    refreshGhost()
    return
  }
  const ids = movableSelection()
  if (ids.length) rotateItems(ids)
}

export function flipSelection() {
  const s = S()
  if (s.tool === 'place') {
    s.setUi({ placeFlip: !s.placeFlip })
    refreshGhost()
    return
  }
  const ids = movableSelection()
  if (ids.length) flipItems(ids)
}

/** Agranda (+1) o achica (−1) el footprint de lo seleccionado. `resizeItems` recorta contra el mapa. */
export function growSelection(delta: 1 | -1) {
  const ids = movableSelection()
  if (ids.length) resizeItems(ids, (it) => ({ w: it.w + delta, h: it.h + delta }))
}

export function duplicateSelection() {
  const s = S()
  if (s.selection.type !== 'items' || !s.selection.ids.length) return
  const ids = duplicateItems(s.selection.ids)
  if (ids.length) s.setUi({ selection: { type: 'items', ids } })
}

export function nudgeSelection(dx: number, dy: number) {
  const ids = movableSelection()
  if (!ids.length) return
  const { doc } = S()
  const pos = new Map<string, [number, number]>()
  for (const l of doc.layers) {
    for (const it of l.items ?? []) {
      if (!ids.includes(it.id)) continue
      const x = it.x + dx
      const y = it.y + dy
      if (x < 0 || y < 0 || x + it.w > doc.grid.cols || y + it.h > doc.grid.rows) return
      pos.set(it.id, [x, y])
    }
  }
  setPositions(pos)
}

export function removeSelection() {
  const s = S()
  if (s.mode === 'play' && s.selection.type === 'items' && movableSelection().length !== s.selection.ids.length) return
  deleteSelection()
}

export function togglePlayerView() {
  const s = S()
  const viewer = s.viewer === 'dm' ? 'player' : 'dm'
  // En vista de jugador sólo tiene sentido seleccionar y medir.
  const tool = viewer === 'player' && s.tool !== 'measure' && s.tool !== 'pan' ? 'select' : s.tool
  s.setUi({ viewer, tool, selection: viewer === 'player' ? { type: 'none' } : s.selection })
}

export { toggleHiddenSelection, toggleHighlightSelection }

export function fitMap() {
  currentScene?.fitToMap()
}

export function zoom(factor: number) {
  currentScene?.zoomBy(factor)
}
