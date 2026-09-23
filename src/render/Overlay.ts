import { Container, Graphics, Sprite, Text } from 'pixi.js'
import { getAsset } from '../assets/catalog'
import { effectivePermission, findCharacter, findItem, findLayer, parseWallKey } from '../model/queries'
import type { MapDoc, Permission } from '../model/types'
import { isHiddenFromPlayers } from '../model/visibility'
import { useMap, type Selection } from '../state/mapStore'
import { preview } from './preview'
import { assetTexture } from './textures'
import { HIDDEN_COLOR } from './types'

const ACCENT = 0x3ea6ff
const OK = 0x46b04a
const BAD = 0xe5484d

const PERMISSION_LABEL: Record<Permission, string> = {
  static: 'Inamovible',
  dm: 'Lo mueve el DM',
  owner: 'Lo mueve su dueño',
}

/** Todo lo que no es el mapa en sí: selección, fantasmas, trazos y marcos. */
export class Overlay {
  readonly container = new Container()
  private g = new Graphics()
  private extras = new Container()

  constructor() {
    this.container.addChild(this.g, this.extras)
    this.container.eventMode = 'none'
  }

  draw(doc: MapDoc, selection: Selection, scale: number, showSelection: boolean) {
    const g = this.g
    const c = doc.grid.cellPx
    const px = 1 / scale // un pixel de pantalla en unidades de mundo
    g.clear()
    this.extras.removeChildren().forEach((ch) => ch.destroy({ children: true }))

    const p = preview
    if (p.hover && !p.ghost) {
      g.rect(p.hover.x * c, p.hover.y * c, c, c).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ color: 0xffffff, alpha: 0.5, width: px })
    }

    if (p.cellRect) {
      const { x0, y0, x1, y1, color } = p.cellRect
      const x = Math.min(x0, x1)
      const y = Math.min(y0, y1)
      g.rect(x * c, y * c, (Math.abs(x1 - x0) + 1) * c, (Math.abs(y1 - y0) + 1) * c)
        .fill({ color, alpha: 0.22 })
        .stroke({ color, width: 2 * px })
    }

    if (p.marquee) {
      const { x0, y0, x1, y1 } = p.marquee
      g.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
        .fill({ color: ACCENT, alpha: 0.1 })
        .stroke({ color: ACCENT, width: px })
    }

    if (p.edges) {
      for (const k of p.edges.keys) this.edgePath(k, c)
      g.stroke({ color: p.edges.color, width: 6 * px, alpha: 0.85, cap: 'round' })
    }

    if (p.room) {
      const r = p.room
      const color = r.op === 'add' ? 0x2b59ff : BAD
      if (r.kind === 'rect') {
        const x = Math.min(r.x0, r.x1)
        const y = Math.min(r.y0, r.y1)
        const w = Math.abs(r.x1 - r.x0)
        const h = Math.abs(r.y1 - r.y0)
        g.rect(x * c, y * c, w * c, h * c).fill({ color, alpha: 0.06 }).stroke({ color, width: 2 * px })
        if (w || h) this.label(`${w} × ${h}`, (x + w / 2) * c - 20 * px, y * c - 8 * px, px, 0x333333, true)
      } else {
        const [fx, fy] = r.points[0]
        if (r.points.length === 1) {
          g.circle(fx * c, fy * c, r.radius * c).fill({ color, alpha: 0.08 }).stroke({ color, width: 1.5 * px })
        } else {
          g.moveTo(fx * c, fy * c)
          for (let i = 1; i < r.points.length; i++) g.lineTo(r.points[i][0] * c, r.points[i][1] * c)
          g.stroke({ color, width: r.radius * 2 * c, alpha: 0.18, cap: 'round', join: 'round' })
          const [lx, ly] = r.points[r.points.length - 1]
          g.circle(lx * c, ly * c, r.radius * c).stroke({ color, width: 1.5 * px })
        }
      }
    }

    if (p.line) {
      const { ax, ay, bx, by, color, label } = p.line
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ color, width: 3 * px, cap: 'round' })
      g.circle(ax, ay, 4 * px).fill({ color })
      g.circle(bx, by, 4 * px).fill({ color })
      if (label) this.label(label, bx + 10 * px, by - 10 * px, px, color)
    }

    if (p.ghost) {
      const gh = p.ghost
      if (gh.kind === 'asset') {
        const a = getAsset(gh.assetId)
        g.rect(gh.x * c, gh.y * c, gh.w * c, gh.h * c)
          .fill({ color: gh.ok ? OK : BAD, alpha: 0.2 })
          .stroke({ color: gh.ok ? OK : BAD, width: 2 * px })
        const s = new Sprite(assetTexture(gh.assetId).tex)
        s.anchor.set(0.5)
        s.position.set((gh.x + gh.w / 2) * c, (gh.y + gh.h / 2) * c)
        s.width = (a?.w ?? gh.w) * c
        s.height = (a?.h ?? gh.h) * c
        s.rotation = (gh.rot * Math.PI) / 180
        if (gh.flip) s.scale.x *= -1
        s.alpha = 0.6
        this.extras.addChild(s)
      } else {
        const size = gh.draft.size * c
        g.rect(gh.x * c, gh.y * c, size, size).fill({ color: gh.ok ? OK : BAD, alpha: 0.18 })
        g.circle((gh.x + gh.draft.size / 2) * c, (gh.y + gh.draft.size / 2) * c, size * 0.4)
          .fill({ color: gh.draft.color, alpha: 0.55 })
          .stroke({ color: 0xffffff, width: 2 * px })
      }
    }

    if (showSelection) this.drawSelection(doc, selection, c, px)
  }

  private drawSelection(doc: MapDoc, sel: Selection, c: number, px: number) {
    const g = this.g
    if (sel.type === 'items') {
      for (const id of sel.ids) {
        const f = findItem(doc, id)
        if (!f) continue
        const { item } = f
        const pad = 3 * px
        g.rect(item.x * c - pad, item.y * c - pad, item.w * c + pad * 2, item.h * c + pad * 2).stroke({
          color: ACCENT,
          width: 2 * px,
        })
      }
      if (sel.ids.length === 1) {
        const f = findItem(doc, sel.ids[0])
        if (f) {
          const perm = effectivePermission(f.item, f.layer)
          let text = PERMISSION_LABEL[perm]
          if (perm === 'owner') {
            const { party, players } = useMap.getState().campaign
            const ch = findCharacter(doc, f.item.characterId, party)
            if (ch) text = `Lo mueve ${ch.owner === 'dm' ? 'el DM' : (players.find((p) => p.id === ch.owner)?.name ?? 'su jugador')}`
          }
          const hidden = isHiddenFromPlayers(f.item, f.layer)
          this.label(
            hidden ? `${text} · oculto` : text,
            f.item.x * c,
            f.item.y * c - 6 * px,
            px,
            hidden ? HIDDEN_COLOR : perm === 'static' ? 0x888888 : ACCENT,
            true,
          )
        }
      }
    } else if (sel.type === 'wall') {
      const layer = findLayer(doc, sel.layerId)
      if (!layer?.walls?.[sel.key]) return
      const { x, y, dir } = parseWallKey(sel.key)
      if (dir === 'b') g.rect(x * c, y * c, c, c).stroke({ color: ACCENT, width: 3 * px })
      else {
        this.edgePath(sel.key, c)
        g.stroke({ color: ACCENT, width: 10 * px, alpha: 0.6, cap: 'round' })
      }
    }
  }

  private edgePath(key: string, c: number) {
    const { x, y, dir } = parseWallKey(key)
    if (dir === 'h') this.g.moveTo(x * c, y * c).lineTo((x + 1) * c, y * c)
    else if (dir === 'v') this.g.moveTo(x * c, y * c).lineTo(x * c, (y + 1) * c)
    else this.g.rect(x * c, y * c, c, c)
  }

  /** Etiqueta con tamaño constante en pantalla. */
  private label(text: string, x: number, y: number, px: number, color: number, above = false) {
    const t = new Text({
      text,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: '600', fill: 0xffffff },
    })
    const box = new Container()
    const bg = new Graphics().roundRect(-6, -3, t.width + 12, t.height + 6, 4).fill({ color, alpha: 0.92 })
    box.addChild(bg, t)
    box.scale.set(px)
    box.position.set(x, above ? y - (t.height + 6) * px : y)
    this.extras.addChild(box)
  }
}
