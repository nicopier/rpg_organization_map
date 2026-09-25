import { BlurFilter, Container, Graphics, Sprite, Text } from 'pixi.js'
import { TOKEN_ASSET, type Character, type Layer, type Placement } from '../../model/types'
import { isHiddenFromPlayers } from '../../model/visibility'
import { hiddenBadge } from '../badges'
import { assetTexture } from '../textures'
import { HIDDEN_ALPHA, type LayerRenderer, type RenderCtx } from '../types'
import { drawToken } from './tokenGraphic'

type Node = { node: Container; item: Placement; ch?: Character; active: boolean; hidden: boolean }

/** Halo alrededor del objeto: anillo difuso afuera y apenas un tinte adentro, para no taparlo. */
function aura(item: Placement, c: number, color: string): Container {
  const w = item.w * c
  const h = item.h * c
  const o = c * 0.08
  const glow = new Graphics()
    .roundRect(-o, -o, w + o * 2, h + o * 2, c * 0.2)
    .stroke({ color, width: c * 0.16, alpha: 0.85 })
  glow.filters = [new BlurFilter({ strength: c * 0.08, quality: 3 })]
  const edge = new Graphics()
    .roundRect(-o, -o, w + o * 2, h + o * 2, c * 0.2)
    .fill({ color, alpha: 0.12 })
    .stroke({ color, width: Math.max(1.5, c * 0.035) })
  const box = new Container()
  box.addChild(glow, edge)
  return box
}

/** Objetos del pack y tokens de personaje. Reconcilia por id y referencia. */
export class ItemRenderer implements LayerRenderer {
  readonly container = new Container()
  private nodes = new Map<string, Node>()
  private epoch = -1

  constructor() {
    this.container.sortableChildren = true
  }

  update(layer: Layer, ctx: RenderCtx) {
    if (ctx.epoch !== this.epoch) {
      this.clear()
      this.epoch = ctx.epoch
    }
    const items = layer.items ?? []
    const seen = new Set<string>()
    items.forEach((item, index) => {
      const hidden = isHiddenFromPlayers(item, layer)
      if (ctx.viewer === 'player' && hidden) return
      seen.add(item.id)
      const ch = item.characterId ? ctx.chars.get(item.characterId) : undefined
      const active = !!ch && ch.id === ctx.activeCharId
      const prev = this.nodes.get(item.id)
      if (prev && prev.item === item && prev.ch === ch && prev.active === active && prev.hidden === hidden) {
        prev.node.zIndex = index
        return
      }
      prev?.node.destroy({ children: true })
      const node = this.build(item, ch, ctx, active, hidden)
      node.zIndex = index
      this.container.addChild(node)
      this.nodes.set(item.id, { node, item, ch, active, hidden })
    })
    for (const [id, n] of this.nodes) {
      if (!seen.has(id)) {
        n.node.destroy({ children: true })
        this.nodes.delete(id)
      }
    }
  }

  private build(item: Placement, ch: Character | undefined, ctx: RenderCtx, active: boolean, hidden: boolean) {
    const c = ctx.c
    const root = new Container()
    root.position.set(item.x * c, item.y * c)

    if (item.assetId === TOKEN_ASSET) {
      root.addChild(drawToken(item, ch, c, active))
    } else {
      const { tex, missing } = assetTexture(item.assetId)
      const s = new Sprite(tex)
      s.anchor.set(0.5)
      s.position.set((item.w * c) / 2, (item.h * c) / 2)
      // Tamaño sin rotar del OBJETO (no del catálogo): así se ve el redimensionado del Inspector.
      // item.w/h están en coordenadas del mapa (ya intercambiados si está de costado), y el sprite
      // se dibuja sin rotar, así que para 90°/270° hay que volver a intercambiarlos.
      const swap = item.rot === 90 || item.rot === 270
      s.width = (swap ? item.h : item.w) * c
      s.height = (swap ? item.w : item.h) * c
      s.rotation = (item.rot * Math.PI) / 180
      if (item.flipX) s.scale.x *= -1
      root.addChild(s)
      if (missing) {
        const t = new Text({ text: item.assetId, style: { fontSize: c * 0.14, fill: 0xffffff, fontFamily: 'monospace' } })
        t.position.set(4, 4)
        root.addChild(t)
      }
    }

    root.alpha = (item.opacity ?? 1) * (hidden ? HIDDEN_ALPHA : 1)
    // Objeto con notas del DM: un halo difuso detrás. Los jugadores nunca reciben la nota.
    if (item.note && ctx.viewer === 'dm') {
      const wrap = new Container()
      wrap.position.copyFrom(root.position)
      root.position.set(0, 0)
      wrap.addChild(aura(item, c, item.note.color), root)
      if (hidden) {
        const badge = hiddenBadge(c)
        badge.position.set(item.w * c - c * 0.17, c * 0.17)
        wrap.addChild(badge)
      }
      return wrap
    }
    if (hidden) {
      // El contenedor está atenuado; la marca va aparte para que se lea bien.
      const wrap = new Container()
      wrap.position.copyFrom(root.position)
      root.position.set(0, 0)
      const badge = hiddenBadge(c)
      badge.position.set(item.w * c - c * 0.17, c * 0.17)
      wrap.addChild(root, badge)
      return wrap
    }
    return root
  }

  private clear() {
    for (const n of this.nodes.values()) n.node.destroy({ children: true })
    this.nodes.clear()
  }

  destroy() {
    this.clear()
    this.container.destroy({ children: true })
  }
}
