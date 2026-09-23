import { Container, Graphics, Sprite, Text } from 'pixi.js'
import type { Character, Placement } from '../../model/types'
import { imageTexture } from '../textures'

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const last = words[words.length - 1]
  if (words.length > 1 && /^\d+$/.test(last)) return words[0][0].toUpperCase() + last
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  return words[0].slice(0, 2).replace(/^./, (ch) => ch.toUpperCase())
}

export function hpColor(ratio: number): number {
  if (ratio > 0.5) return 0x46b04a
  if (ratio > 0.25) return 0xf0b429
  return 0xe5484d
}

/**
 * Token dibujado por código (el pack no trae arte de criaturas): círculo del color de la ficha,
 * iniciales, anillo de HP que se vacía con el daño, cruz si está caído y halo dorado en su turno.
 * Coordenadas locales: (0,0) es la esquina superior izquierda del footprint.
 */
export function drawToken(item: Placement, ch: Character | undefined, c: number, activeTurn: boolean): Container {
  const node = new Container()
  const w = item.w * c
  const h = item.h * c
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.4
  const ring = Math.max(3, c * 0.07)
  const dead = !!ch && ch.hp.cur <= 0
  const g = new Graphics()

  if (activeTurn) {
    g.circle(cx, cy, r + ring * 2.1).fill({ color: 0xffcc33, alpha: 0.35 })
    g.circle(cx, cy, r + ring * 1.6).stroke({ color: 0xffcc33, width: ring * 0.8 })
  }
  g.circle(cx + c * 0.03, cy + c * 0.04, r).fill({ color: 0x000000, alpha: 0.3 })
  g.circle(cx, cy, r).fill({ color: dead ? 0x6b6b6b : (ch?.color ?? '#888888') })
  g.circle(cx, cy, r).stroke({ color: 0xffffff, width: Math.max(1.5, c * 0.03) })

  if (ch && ch.hp.max > 0) {
    const ratio = ch.hp.max > 0 ? Math.max(0, Math.min(1, ch.hp.cur / ch.hp.max)) : 0
    const rr = r + ring * 0.75
    g.circle(cx, cy, rr).stroke({ color: 0x000000, alpha: 0.35, width: ring })
    if (ratio > 0) {
      // moveTo antes del arco: si no, Pixi lo une con una línea desde el último punto del path.
      g.moveTo(cx, cy - rr)
      g.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio).stroke({ color: hpColor(ratio), width: ring })
    }
    if (ch.hp.temp > 0) {
      g.circle(cx, cy, rr + ring * 0.9).stroke({ color: 0x4aa3ff, width: ring * 0.45 })
    }
  }
  node.addChild(g)

  // Con imagen: la foto recortada en círculo reemplaza a las iniciales.
  const tex = ch?.image ? imageTexture(ch.image) : null
  if (tex) {
    const img = new Sprite(tex)
    const inner = r - Math.max(1.5, c * 0.03)
    const k = (inner * 2) / Math.min(tex.width, tex.height)
    img.anchor.set(0.5)
    img.scale.set(k)
    img.position.set(cx, cy)
    const mask = new Graphics().circle(cx, cy, inner).fill({ color: 0xffffff })
    img.mask = mask
    if (dead) img.tint = 0x777777
    node.addChild(mask, img)
  }

  const label = new Text({
    text: initials(ch?.name ?? '?'),
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: r * 0.8,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: { color: 0x000000, width: r * 0.08 },
    },
  })
  label.anchor.set(0.5)
  label.position.set(cx, cy)
  if (!tex) node.addChild(label)
  else label.destroy()

  if (dead) {
    const x = new Graphics()
    const d = r * 0.6
    x.moveTo(cx - d, cy - d).lineTo(cx + d, cy + d).moveTo(cx + d, cy - d).lineTo(cx - d, cy + d)
    x.stroke({ color: 0xe5484d, width: c * 0.07, cap: 'round' })
    node.addChild(x)
  }

  if (ch) {
    const name = new Text({
      text: ch.name,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: c * 0.17, fontWeight: '600', fill: 0xffffff },
    })
    name.anchor.set(0.5, 0)
    const pad = c * 0.04
    const bg = new Graphics()
      .roundRect(-name.width / 2 - pad * 1.5, -pad * 0.5, name.width + pad * 3, name.height + pad, pad * 2)
      .fill({ color: 0x000000, alpha: 0.65 })
    const tag = new Container()
    tag.addChild(bg, name)
    tag.position.set(cx, h - c * 0.02)
    node.addChild(tag)
  }
  return node
}
