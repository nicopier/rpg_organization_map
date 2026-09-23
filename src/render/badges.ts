import { Graphics } from 'pixi.js'
import { HIDDEN_COLOR } from './types'

/** Ojo tachado en un círculo violeta: marca lo que los jugadores no ven. */
export function hiddenBadge(c: number): Graphics {
  const r = c * 0.15
  const g = new Graphics()
  g.circle(0, 0, r).fill({ color: HIDDEN_COLOR }).stroke({ color: 0xffffff, width: c * 0.02 })
  g.ellipse(0, 0, r * 0.62, r * 0.36).stroke({ color: 0xffffff, width: c * 0.022 })
  g.circle(0, 0, r * 0.16).fill({ color: 0xffffff })
  g.moveTo(-r * 0.6, r * 0.6).lineTo(r * 0.6, -r * 0.6).stroke({ color: 0xffffff, width: c * 0.03, cap: 'round' })
  return g
}
