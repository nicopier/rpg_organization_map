import type { DungeonStyle, Grid, RoomShape } from '../model/types'

/** Margen alrededor del mapa, en casillas, para que el rayado de los bordes no se corte. */
export const DUNGEON_MARGIN = 2

/** Resolución del raster: 70 px por casilla (la del pack) salvo en mapas enormes. */
export function dungeonPxPerCell(grid: Grid): number {
  const cols = grid.cols + DUNGEON_MARGIN * 2
  const rows = grid.rows + DUNGEON_MARGIN * 2
  const byArea = Math.sqrt(24_000_000 / (cols * rows))
  const bySide = 8192 / Math.max(cols, rows)
  return Math.max(8, Math.floor(Math.min(70, byArea, bySide)))
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

const hatchCache = new Map<string, HTMLCanvasElement>()

/**
 * Tile de rayado a mano: grupos de 3–5 trazos paralelos con ángulo al azar, como Dungeon Scrawl.
 * Cada grupo se dibuja también desplazado un tile en cada dirección, así el patrón repite sin costura.
 */
function hatchTile(color: string, p: number): HTMLCanvasElement {
  const key = `${color}|${p}`
  const hit = hatchCache.get(key)
  if (hit) return hit
  const T = Math.round(p * 2)
  const c = document.createElement('canvas')
  c.width = c.height = T
  const g = c.getContext('2d')!
  g.strokeStyle = color
  g.lineCap = 'round'
  g.lineWidth = Math.max(1, p * 0.026)
  const r = rng(1337)
  const clusters = 44 // ~11 grupos por casilla: denso como el original
  for (let i = 0; i < clusters; i++) {
    const cx = r() * T
    const cy = r() * T
    const ang = r() * Math.PI
    const n = 3 + Math.floor(r() * 3)
    const len = p * (0.3 + r() * 0.2)
    const gap = p * 0.075
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * gap
      const px = cx - dy * off
      const py = cy + dx * off
      const l = len * (0.8 + r() * 0.3)
      for (const ox of [-T, 0, T]) {
        for (const oy of [-T, 0, T]) {
          g.beginPath()
          g.moveTo(px - (dx * l) / 2 + ox, py - (dy * l) / 2 + oy)
          g.lineTo(px + (dx * l) / 2 + ox, py + (dy * l) / 2 + oy)
          g.stroke()
        }
      }
    }
  }
  hatchCache.set(key, c)
  return c
}

/**
 * Rellena la forma agrandada `grow` casillas (negativo = achicada).
 * Rectángulo agrandado = rectángulo de esquinas redondeadas; trazo = línea más gruesa.
 */
function fillGrown(g: CanvasRenderingContext2D, s: RoomShape, grow: number, p: number) {
  const o = DUNGEON_MARGIN
  if (s.kind === 'rect') {
    const x = (Math.min(s.x0, s.x1) + o - grow) * p
    const y = (Math.min(s.y0, s.y1) + o - grow) * p
    const w = (Math.abs(s.x1 - s.x0) + grow * 2) * p
    const h = (Math.abs(s.y1 - s.y0) + grow * 2) * p
    if (w <= 0 || h <= 0) return
    g.beginPath()
    if (grow > 0) g.roundRect(x, y, w, h, grow * p)
    else g.rect(x, y, w, h)
    g.fill()
    return
  }
  const width = (s.radius + grow) * 2 * p
  if (width <= 0 || !s.points.length) return
  const [fx, fy] = s.points[0]
  if (s.points.length === 1) {
    g.beginPath()
    g.arc((fx + o) * p, (fy + o) * p, width / 2, 0, Math.PI * 2)
    g.fill()
    return
  }
  g.save()
  g.strokeStyle = g.fillStyle as string
  g.lineWidth = width
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo((fx + o) * p, (fy + o) * p)
  for (let i = 1; i < s.points.length; i++) g.lineTo((s.points[i][0] + o) * p, (s.points[i][1] + o) * p)
  g.stroke()
  g.restore()
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * Genera la imagen de una capa de salas. Las formas se aplican en orden:
 *
 *  - sumar: el contorno se dibuja DETRÁS de lo existente (destination-over) y el piso ENCIMA.
 *    Donde dos salas se pisan, el piso de una tapa la pared de la otra: las paredes se funden solas.
 *  - restar: el contorno se dibuja sólo SOBRE lo existente (source-atop) y después se recorta
 *    el interior: el hueco queda con su propia pared.
 *
 * El rayado es la unión de las salas agrandada, menos lo restado achicado; queda debajo del piso.
 */
export function rasterDungeon(shapes: RoomShape[], style: DungeonStyle, grid: Grid, p: number): HTMLCanvasElement {
  const W = (grid.cols + DUNGEON_MARGIN * 2) * p
  const H = (grid.rows + DUNGEON_MARGIN * 2) * p
  const walls = canvas(W, H)
  const wg = walls.getContext('2d')!
  const hatch = style.hatch ? canvas(W, H) : null
  const hg = hatch?.getContext('2d') ?? null
  const hw = style.wallWidth / 2
  const band = hw + style.hatchWidth

  for (const s of shapes) {
    if (s.op === 'add') {
      wg.globalCompositeOperation = 'destination-over'
      wg.fillStyle = style.wall
      fillGrown(wg, s, hw, p)
      wg.globalCompositeOperation = 'source-over'
      wg.fillStyle = style.floor
      fillGrown(wg, s, -hw, p)
      if (hg) {
        hg.globalCompositeOperation = 'source-over'
        hg.fillStyle = '#000'
        fillGrown(hg, s, band, p)
      }
    } else {
      wg.globalCompositeOperation = 'source-atop'
      wg.fillStyle = style.wall
      fillGrown(wg, s, hw, p)
      wg.globalCompositeOperation = 'destination-out'
      wg.fillStyle = '#000'
      fillGrown(wg, s, -hw, p)
      if (hg) {
        hg.globalCompositeOperation = 'destination-out'
        hg.fillStyle = '#000'
        fillGrown(hg, s, -band, p)
      }
    }
  }

  // Grilla sólo sobre lo ya dibujado (piso y paredes; sobre el negro no se nota).
  if (style.innerGrid) {
    wg.globalCompositeOperation = 'source-atop'
    wg.strokeStyle = 'rgba(0,0,0,0.22)'
    wg.lineWidth = Math.max(1, p * 0.015)
    wg.beginPath()
    for (let x = 0; x <= grid.cols + DUNGEON_MARGIN * 2; x++) {
      wg.moveTo(x * p, 0)
      wg.lineTo(x * p, H)
    }
    for (let y = 0; y <= grid.rows + DUNGEON_MARGIN * 2; y++) {
      wg.moveTo(0, y * p)
      wg.lineTo(W, y * p)
    }
    wg.stroke()
  }
  wg.globalCompositeOperation = 'source-over'

  const out = canvas(W, H)
  const og = out.getContext('2d')!
  if (hatch && hg) {
    hg.globalCompositeOperation = 'source-in'
    hg.fillStyle = og.createPattern(hatchTile(style.hatchColor, p), 'repeat')!
    hg.fillRect(0, 0, W, H)
    og.drawImage(hatch, 0, 0)
  }
  if (style.shadow) {
    // Copia de la sala en gris, corrida: asoma como sombra abajo a la derecha.
    const sh = canvas(W, H)
    const sg = sh.getContext('2d')!
    sg.drawImage(walls, 0, 0)
    sg.globalCompositeOperation = 'source-in'
    sg.fillStyle = 'rgba(0,0,0,0.28)'
    sg.fillRect(0, 0, W, H)
    og.drawImage(sh, p * 0.07, p * 0.09)
  }
  og.drawImage(walls, 0, 0)
  return out
}
