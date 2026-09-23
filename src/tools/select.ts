import { canMove, itemsAt, nearestEdge } from '../model/queries'
import type { Layer, Placement } from '../model/types'
import { isHiddenFromPlayers } from '../model/visibility'
import { clearPreview, setPreview } from '../render/preview'
import { setPositions } from '../state/actions'
import type { Selection } from '../state/mapStore'
import { S } from './common'
import type { Pointer, ToolHandler } from './types'

type Drag = { sx: number; sy: number; origins: Map<string, [number, number, number, number]>; dx: number; dy: number }

let drag: Drag | null = null
let marquee: { x0: number; y0: number; additive: boolean } | null = null

/** En la vista de jugador no se puede tocar lo que el jugador no ve. */
function visibleToViewer(layer: Layer, el: { visibility?: 'all' | 'dm' }) {
  return S().viewer === 'dm' || !isHiddenFromPlayers(el, layer)
}

/** El jugador sólo arrastra sus propios personajes; el DM, lo que permita el modo. */
function mayDrag(it: Placement, l: Layer, force: boolean): boolean {
  const s = S()
  if (s.role === 'player') {
    const ch = s.campaign.party.find((p) => p.id === it.characterId && p.owner === s.me)
    return !!ch && !s.campaign.movementLocked && !ch.moveLocked
  }
  return canMove(it, l, s.mode, { partyIds: new Set(s.campaign.party.map((p) => p.id)), force })
}

/** Puerta o muro sobre el borde más cercano al cursor (capa Piso). El jugador no selecciona paredes. */
function wallAt(p: Pointer): { layerId: string; key: string } | null {
  const { doc, role } = S()
  if (role === 'player') return null
  const e = nearestEdge(p.fx, p.fy)
  if (e.dist > 0.15) return null
  const k = e.key
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i]
    if (l.kind !== 'floor' || !l.visible || l.locked) continue
    const w = l.walls?.[k]
    if (w && visibleToViewer(l, w)) return { layerId: l.id, key: k }
  }
  return null
}

function selectWallAt(p: Pointer): boolean {
  const w = wallAt(p)
  if (w) S().setUi({ selection: { type: 'wall', ...w }, activeLayerId: w.layerId })
  return !!w
}

/**
 * Lo que hay bajo el cursor, con la misma prioridad que el clic de selección:
 * puerta en el borde cercano, después objetos (el de más arriba).
 */
export function pickTarget(p: Pointer): { selection: Selection; layerId: string } | null {
  const edge = wallAt(p)
  if (edge) return { selection: { type: 'wall', ...edge }, layerId: edge.layerId }
  const hit = itemsAt(S().doc, p.cx, p.cy, visibleToViewer)[0]
  if (hit) return { selection: { type: 'items', ids: [hit.item.id] }, layerId: hit.layer.id }
  return null
}

export const selectTool: ToolHandler = {
  down(p) {
    const s = S()
    if (selectWallAt(p)) return

    const hit = itemsAt(s.doc, p.cx, p.cy, visibleToViewer)[0]
    if (hit) {
      const current = s.selection.type === 'items' ? s.selection.ids : []
      if (p.shift || p.ctrl) {
        const ids = current.includes(hit.item.id) ? current.filter((i) => i !== hit.item.id) : [...current, hit.item.id]
        s.setUi({ selection: ids.length ? { type: 'items', ids } : { type: 'none' } })
        return
      }
      const ids = current.includes(hit.item.id) ? current : [hit.item.id]
      s.setUi({ selection: { type: 'items', ids }, activeLayerId: hit.layer.id })

      const origins = new Map<string, [number, number, number, number]>()
      let blocked = false
      for (const l of s.doc.layers) {
        for (const it of l.items ?? []) {
          if (!ids.includes(it.id)) continue
          if (mayDrag(it, l, p.alt)) origins.set(it.id, [it.x, it.y, it.w, it.h])
          else blocked = true
        }
      }
      if (blocked && s.role === 'dm') s.toast('Los personajes de los jugadores no se mueven en modo juego. Alt+arrastrar para moverlo igual.')
      if (blocked && s.role === 'player') {
        const own = s.campaign.party.some((c) => c.owner === s.me && ids.some((id) => s.doc.layers.some((ll) => ll.items?.some((i) => i.id === id && i.characterId === c.id))))
        if (own) s.toast('El DM bloqueó el movimiento por ahora.')
      }
      if (!origins.size) return
      s.beginGroup()
      drag = { sx: p.cx, sy: p.cy, origins, dx: 0, dy: 0 }
      return
    }

    if (!p.shift) s.setUi({ selection: { type: 'none' } })
    if (s.role === 'dm') marquee = { x0: p.wx, y0: p.wy, additive: p.shift }
  },

  drag(p) {
    if (drag) {
      const { grid } = S().doc
      let dx = p.cx - drag.sx
      let dy = p.cy - drag.sy
      // Se frena el grupo entero en el borde, sin deformar la formación.
      for (const [ox, oy, w, h] of drag.origins.values()) {
        dx = Math.max(-ox, Math.min(grid.cols - w - ox, dx))
        dy = Math.max(-oy, Math.min(grid.rows - h - oy, dy))
      }
      if (dx === drag.dx && dy === drag.dy) return
      drag.dx = dx
      drag.dy = dy
      const pos = new Map<string, [number, number]>()
      for (const [id, [ox, oy]] of drag.origins) pos.set(id, [ox + dx, oy + dy])
      setPositions(pos)
      return
    }
    if (marquee) setPreview({ marquee: { x0: marquee.x0, y0: marquee.y0, x1: p.wx, y1: p.wy } })
  },

  up(p) {
    const s = S()
    if (drag) {
      s.endGroup()
      drag = null
      return
    }
    if (!marquee) return
    const c = s.doc.grid.cellPx
    if (Math.hypot(p.wx - marquee.x0, p.wy - marquee.y0) > c * 0.2) {
      const x0 = Math.floor(Math.min(marquee.x0, p.wx) / c)
      const y0 = Math.floor(Math.min(marquee.y0, p.wy) / c)
      const x1 = Math.floor(Math.max(marquee.x0, p.wx) / c)
      const y1 = Math.floor(Math.max(marquee.y0, p.wy) / c)
      const ids = new Set(marquee.additive && s.selection.type === 'items' ? s.selection.ids : [])
      for (const l of s.doc.layers) {
        if (!l.visible || l.locked || !l.items) continue
        for (const it of l.items) {
          if (!visibleToViewer(l, it)) continue
          if (it.x <= x1 && it.x + it.w - 1 >= x0 && it.y <= y1 && it.y + it.h - 1 >= y0) ids.add(it.id)
        }
      }
      s.setUi({ selection: ids.size ? { type: 'items', ids: [...ids] } : { type: 'none' } })
    }
    marquee = null
    clearPreview()
  },

  cancel() {
    if (drag) S().endGroup()
    drag = null
    marquee = null
  },
}
