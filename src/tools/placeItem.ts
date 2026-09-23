import { getAsset } from '../assets/catalog'
import { setPreview } from '../render/preview'
import { placeAsset, placeToken } from '../state/actions'
import { ensureLayer, S } from './common'
import type { Pointer, ToolHandler } from './types'

/** El cursor queda en el centro del footprint, no en la esquina. */
function anchor(p: Pointer, w: number, h: number) {
  const x = p.cx - Math.floor((w - 1) / 2)
  const y = p.cy - Math.floor((h - 1) / 2)
  const { grid } = S().doc
  return { x, y, ok: x >= 0 && y >= 0 && x + w <= grid.cols && y + h <= grid.rows }
}

function assetGhost(p: Pointer) {
  const { placeAssetId, placeRot, placeFlip } = S()
  const a = placeAssetId ? getAsset(placeAssetId) : undefined
  if (!a) return null
  const swap = placeRot === 90 || placeRot === 270
  const w = swap ? a.h : a.w
  const h = swap ? a.w : a.h
  return { kind: 'asset' as const, assetId: a.id, w, h, rot: placeRot, flip: placeFlip, ...anchor(p, w, h) }
}

function tokenGhost(p: Pointer) {
  const d = S().tokenDraft
  if (!d) return null
  return { kind: 'token' as const, draft: d, ...anchor(p, d.size, d.size) }
}

let lastPointer: Pointer | null = null

/** Redibuja el fantasma, p. ej. después de rotarlo con R sin mover el mouse. */
export function refreshGhost() {
  if (!lastPointer) return
  const t = S().tool
  if (t === 'place') setPreview({ ghost: assetGhost(lastPointer) })
  else if (t === 'token') setPreview({ ghost: tokenGhost(lastPointer) })
}

export const placeItemTool: ToolHandler = {
  hover(p) {
    lastPointer = p
    setPreview({ ghost: assetGhost(p) })
  },
  drag(p) {
    lastPointer = p
    setPreview({ ghost: assetGhost(p) })
  },
  down(p) {
    const g = assetGhost(p)
    if (!g) return
    if (!g.ok) {
      S().toast('No entra ahí: se sale del mapa.')
      return
    }
    // En Edición es decorado (capa Objetos); en Juego es una marca de la sesión (capa Juego).
    const layer = ensureLayer([S().mode === 'play' ? 'game' : 'object'])
    if (!layer) return
    const id = placeAsset(layer.id, g.assetId, g.x, g.y, g.rot, g.flip)
    if (id) S().setUi({ selection: { type: 'items', ids: [id] } })
  },
  cancel() {
    lastPointer = null
  },
}

export const placeTokenTool: ToolHandler = {
  hover(p) {
    lastPointer = p
    setPreview({ ghost: tokenGhost(p) })
  },
  drag(p) {
    lastPointer = p
    setPreview({ ghost: tokenGhost(p) })
  },
  down(p) {
    const g = tokenGhost(p)
    if (!g) return
    if (!g.ok) {
      S().toast('No entra ahí: se sale del mapa.')
      return
    }
    const id = placeToken(g.draft, g.x, g.y)
    if (id) S().setUi({ selection: { type: 'items', ids: [id] } })
  },
  cancel() {
    lastPointer = null
  },
}
