import { Assets, Rectangle, Texture } from 'pixi.js'
import { ASSETS, assetUrl, getAsset, SOURCE_CELL_PX } from '../assets/catalog'

const base = new Map<string, Texture>()
const sub = new Map<string, Texture>()
let missing: Texture | null = null

let loading: Promise<void> | null = null

/** Precarga todo el pack (son ~70 PNGs chicos, 330 KB): el render después es sincrónico. */
export function loadAllTextures(): Promise<void> {
  loading ??= (async () => {
    for (const a of ASSETS) Assets.add({ alias: a.id, src: assetUrl(a) })
    const loaded = (await Assets.load(ASSETS.map((a) => a.id))) as Record<string, Texture>
    for (const [id, tex] of Object.entries(loaded)) base.set(id, tex)
  })()
  return loading
}

/** Cuadro magenta con el nombre, para assets que el mapa referencia pero no existen. */
function missingTexture(): Texture {
  if (missing) return missing
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#ff00ff'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#000'
  g.fillRect(0, 0, 32, 32)
  g.fillRect(32, 32, 32, 32)
  missing = Texture.from(c)
  return missing
}

export function assetTexture(id: string): { tex: Texture; missing: boolean } {
  const t = base.get(id)
  return t ? { tex: t, missing: false } : { tex: missingTexture(), missing: true }
}

/**
 * Textura de una casilla de piso. Un tile5x5 (350 px) se recorta en el sub-rectángulo
 * de 70 px que le toca a (x mod 5, y mod 5): el piso tilea sin costuras y conserva la
 * variación del dibujo. Un asset 1x1 da siempre el recorte completo.
 */
export function floorTexture(assetId: string, x: number, y: number): Texture {
  const a = getAsset(assetId)
  const t = base.get(assetId)
  if (!a || !t) return missingTexture()
  const mx = ((x % a.w) + a.w) % a.w
  const my = ((y % a.h) + a.h) % a.h
  const key = `${assetId}|${mx}|${my}`
  let s = sub.get(key)
  if (!s) {
    const px = t.source.width / a.w // tolera assets que no estén exactamente a 70 px por casilla
    const py = t.source.height / a.h
    s = new Texture({ source: t.source, frame: new Rectangle(mx * px, my * py, px, py) })
    sub.set(key, s)
  }
  return s
}

const images = new Map<string, Texture | 'loading' | 'error'>()
let onImageLoaded: (() => void) | null = null

/** La escena se entera cuando termina de bajar una imagen de token, para redibujarlo. */
export function setImageListener(fn: (() => void) | null) {
  onImageLoaded = fn
}

/** Imagen subida por un jugador. Devuelve null mientras carga (el token se dibuja con color e iniciales). */
export function imageTexture(url: string): Texture | null {
  const v = images.get(url)
  if (v instanceof Texture) return v
  if (v) return null
  images.set(url, 'loading')
  Assets.load<Texture>({ src: url, parser: 'texture' }).then(
    (t) => {
      images.set(url, t)
      onImageLoaded?.()
    },
    () => images.set(url, 'error'),
  )
  return null
}

export { SOURCE_CELL_PX }
