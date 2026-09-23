import type { Container } from 'pixi.js'

const MIN = 0.1
const MAX = 6

/** Zoom apuntando al cursor y pan. Mueve el contenedor del mundo, no la vista. */
export class Camera {
  constructor(private world: Container) {}

  get scale() {
    return this.world.scale.x
  }

  screenToWorld(sx: number, sy: number) {
    return { x: (sx - this.world.x) / this.scale, y: (sy - this.world.y) / this.scale }
  }

  worldToScreen(wx: number, wy: number) {
    return { x: wx * this.scale + this.world.x, y: wy * this.scale + this.world.y }
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const s = this.scale
    const next = Math.max(MIN, Math.min(MAX, s * factor))
    const k = next / s
    this.world.scale.set(next)
    this.world.position.set(sx - (sx - this.world.x) * k, sy - (sy - this.world.y) * k)
  }

  panBy(dx: number, dy: number) {
    this.world.position.set(this.world.x + dx, this.world.y + dy)
  }

  /** Encuadra un rectángulo de mundo en la pantalla con un margen. */
  fit(w: number, h: number, viewW: number, viewH: number, margin = 40) {
    const s = Math.max(MIN, Math.min(MAX, Math.min((viewW - margin * 2) / w, (viewH - margin * 2) / h)))
    this.world.scale.set(s)
    this.world.position.set((viewW - w * s) / 2, (viewH - h * s) / 2)
  }
}
