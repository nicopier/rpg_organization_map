import { Application, Container, Graphics } from 'pixi.js'
import type { Character, Grid, LayerKind } from '../model/types'
import type { Viewer } from '../model/visibility'
import { useMap } from '../state/mapStore'
import { getTool, type Pointer } from '../tools'
import { Camera } from './camera'
import { FogRenderer } from './FogRenderer'
import { FloorLayerRenderer } from './layers/FloorLayerRenderer'
import { ItemRenderer } from './layers/ItemRenderer'
import { Overlay } from './Overlay'
import { clearPreview, onPreviewChange, setPreview } from './preview'
import { loadAllTextures, setImageListener } from './textures'
import { HIDDEN_ALPHA, type LayerRenderer, type RenderCtx } from './types'

function makeRenderer(kind: LayerKind): LayerRenderer {
  return kind === 'floor' ? new FloorLayerRenderer() : new ItemRenderer()
}

export type ContextMenuRequest = { clientX: number; clientY: number; pointer: Pointer }

/** El lienzo: sincroniza el documento del store con la escena de Pixi y reparte el input a las herramientas. */
export class Scene {
  readonly app = new Application()
  private world = new Container()
  private bg = new Graphics()
  private gridG = new Graphics()
  private layerRoot = new Container()
  private overlay = new Overlay()
  private fog = new FogRenderer()
  readonly camera = new Camera(this.world)
  private renderers = new Map<string, { kind: LayerKind; r: LayerRenderer }>()

  private epoch = 0
  private lastViewer: Viewer | null = null
  private lastCellPx = 0
  private lastGrid: Grid | null = null
  private lastChars: Character[] | null = null
  private lastParty: Character[] | null = null
  private charMap = new Map<string, Character>()

  private destroyed = false
  private ready = false
  private syncQueued = false
  private overlayQueued = false
  private unsub: (() => void) | null = null
  private cleanup: (() => void)[] = []

  private panning: { x: number; y: number } | null = null
  private rightDrag: { x: number; y: number; moved: boolean } | null = null
  private suppressMenu = false
  private toolActive = false
  private spaceDown = false

  onContextMenu: ((req: ContextMenuRequest) => void) | null = null
  onReady: (() => void) | null = null

  async init(host: HTMLDivElement) {
    await this.app.init({
      resizeTo: host,
      background: '#1b1d22',
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    })
    if (this.destroyed) return this.app.destroy(true)
    host.appendChild(this.app.canvas)
    // Pixi sólo escucha el resize de la ventana; los paneles que se pliegan o se abren
    // (la columna de combate, la lista de mapas) también cambian el lugar del mapa.
    const ro = new ResizeObserver(() => {
      if (this.destroyed) return
      this.app.resize()
      this.requestOverlay()
    })
    ro.observe(host)
    this.cleanup.push(() => ro.disconnect())
    this.world.addChild(this.bg, this.layerRoot, this.fog.g, this.overlay.container)
    this.app.stage.addChild(this.world)

    await loadAllTextures()
    if (this.destroyed) {
      this.app.destroy(true, { children: true })
      return
    }
    this.ready = true
    this.epoch++
    this.fitToMap()
    this.unsub = useMap.subscribe(() => this.requestSync())
    onPreviewChange(() => this.requestOverlay())
    // Cuando baja la imagen de un token, se reconstruyen los tokens.
    setImageListener(() => {
      this.epoch++
      this.requestSync()
    })
    this.bindInput(this.app.canvas)
    this.sync()
    this.onReady?.()
  }

  destroy() {
    this.destroyed = true
    this.unsub?.()
    this.cleanup.forEach((f) => f())
    onPreviewChange(() => {})
    setImageListener(null)
    if (this.ready) this.app.destroy(true, { children: true })
  }

  fitToMap() {
    const { grid } = useMap.getState().doc
    this.camera.fit(grid.cols * grid.cellPx, grid.rows * grid.cellPx, this.app.screen.width, this.app.screen.height)
    this.requestOverlay()
  }

  zoomBy(factor: number) {
    this.camera.zoomAt(this.app.screen.width / 2, this.app.screen.height / 2, factor)
    this.requestOverlay()
  }

  /* ---------- Sincronización ---------- */

  private requestSync() {
    if (this.syncQueued) return
    this.syncQueued = true
    requestAnimationFrame(() => {
      this.syncQueued = false
      if (!this.destroyed && this.ready) this.sync()
    })
  }

  private requestOverlay() {
    if (this.overlayQueued) return
    this.overlayQueued = true
    requestAnimationFrame(() => {
      this.overlayQueued = false
      if (!this.destroyed && this.ready) this.drawOverlay()
    })
  }

  private sync() {
    const s = useMap.getState()
    const doc = s.doc
    if (s.viewer !== this.lastViewer || doc.grid.cellPx !== this.lastCellPx) {
      this.epoch++
      this.lastViewer = s.viewer
      this.lastCellPx = doc.grid.cellPx
    }
    if (doc.grid !== this.lastGrid) {
      this.drawGrid(doc.grid)
      this.lastGrid = doc.grid
    }
    // Fichas: NPC del mapa y PJ de la party.
    if (doc.characters !== this.lastChars || s.campaign.party !== this.lastParty) {
      this.charMap = new Map([...s.campaign.party, ...doc.characters].map((c) => [c.id, c]))
      this.lastChars = doc.characters
      this.lastParty = s.campaign.party
    }
    const ctx: RenderCtx = {
      doc,
      viewer: s.viewer,
      c: doc.grid.cellPx,
      chars: this.charMap,
      activeCharId: doc.combat.active ? (doc.combat.order[doc.combat.turnIndex]?.characterId ?? null) : null,
      epoch: this.epoch,
    }

    const order: Container[] = []
    const seen = new Set<string>()
    let gridAt = 0
    for (const layer of doc.layers) {
      let rec = this.renderers.get(layer.id)
      if (!rec || rec.kind !== layer.kind) {
        rec?.r.destroy()
        rec = { kind: layer.kind, r: makeRenderer(layer.kind) }
        this.renderers.set(layer.id, rec)
      }
      rec.r.update(layer, ctx)
      const hiddenLayer = layer.visibility === 'dm'
      const cont = rec.r.container
      // El piso no tiene visibilidad por elemento: se oculta o atenúa entero.
      const floorHidden = layer.kind === 'floor' && hiddenLayer
      cont.visible = layer.visible && !(floorHidden && s.viewer === 'player')
      cont.alpha = layer.opacity * (floorHidden ? HIDDEN_ALPHA : 1)
      order.push(cont)
      if (layer.kind === 'floor') gridAt = order.length
      seen.add(layer.id)
    }
    for (const [id, rec] of this.renderers) {
      if (!seen.has(id)) {
        rec.r.destroy()
        this.renderers.delete(id)
      }
    }
    // La grilla va justo encima del último piso o sala: se ve sobre el suelo pero no tapa los objetos.
    order.splice(gridAt, 0, this.gridG)
    this.fog.update(doc, s.viewer)
    this.layerRoot.removeChildren()
    this.layerRoot.addChild(...order)
    this.drawOverlay()
  }

  private drawGrid(grid: Grid) {
    const c = grid.cellPx
    const W = grid.cols * c
    const H = grid.rows * c
    this.bg.clear()
    this.bg.rect(8, 10, W, H).fill({ color: 0x000000, alpha: 0.35 })
    this.bg.rect(0, 0, W, H).fill({ color: grid.bg })
    const g = this.gridG
    g.clear()
    for (let x = 0; x <= grid.cols; x++) g.moveTo(x * c, 0).lineTo(x * c, H)
    for (let y = 0; y <= grid.rows; y++) g.moveTo(0, y * c).lineTo(W, y * c)
    g.stroke({ color: grid.color, width: 1, pixelLine: true })
    g.visible = grid.show
  }

  private drawOverlay() {
    const s = useMap.getState()
    this.overlay.draw(s.doc, s.selection, this.camera.scale, s.viewer === 'dm' || s.role === 'player')
  }

  /* ---------- Input ---------- */

  private pointer(e: PointerEvent | MouseEvent): Pointer {
    const rect = this.app.canvas.getBoundingClientRect()
    const w = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    const c = useMap.getState().doc.grid.cellPx
    const fx = w.x / c
    const fy = w.y / c
    return {
      wx: w.x,
      wy: w.y,
      fx,
      fy,
      cx: Math.floor(fx),
      cy: Math.floor(fy),
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
    }
  }

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.tabIndex = 0 // para que el lienzo tome foco y se lo saque a los inputs
    canvas.style.outline = 'none'
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts)
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opts))
    }

    const idleCursor = () => (useMap.getState().tool === 'pan' || this.spaceDown ? 'grab' : '')
    const startPan = (e: PointerEvent) => {
      this.panning = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
    }

    // Sin esto, en Windows el botón del medio activa el autoscroll del navegador en vez de mover el mapa.
    on(canvas, 'mousedown', (e) => e.button === 1 && e.preventDefault())
    on(canvas, 'auxclick', (e) => e.button === 1 && e.preventDefault())

    on(canvas, 'pointerdown', (e) => {
      canvas.focus()
      const panTool = useMap.getState().tool === 'pan'
      // Mover la vista: herramienta Mano, Espacio + arrastrar, o botón del medio.
      if (e.button === 1 || (e.button === 0 && (this.spaceDown || panTool))) {
        e.preventDefault()
        startPan(e)
        return
      }
      // Clic derecho: si se arrastra mueve la vista; si no, abre el menú contextual.
      if (e.button === 2) {
        this.rightDrag = { x: e.clientX, y: e.clientY, moved: false }
        canvas.setPointerCapture(e.pointerId)
        return
      }
      if (e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      this.toolActive = true
      getTool(useMap.getState().tool).down?.(this.pointer(e))
    })

    on(canvas, 'pointermove', (e) => {
      if (this.rightDrag && !this.rightDrag.moved && Math.hypot(e.clientX - this.rightDrag.x, e.clientY - this.rightDrag.y) > 4) {
        this.rightDrag.moved = true
        this.panning = { x: this.rightDrag.x, y: this.rightDrag.y }
        canvas.style.cursor = 'grabbing'
      }
      if (this.panning) {
        this.camera.panBy(e.clientX - this.panning.x, e.clientY - this.panning.y)
        this.panning = { x: e.clientX, y: e.clientY }
        return
      }
      const p = this.pointer(e)
      const tool = getTool(useMap.getState().tool)
      if (this.toolActive) tool.drag?.(p)
      else tool.hover?.(p)
    })

    const end = (e: PointerEvent) => {
      if (this.rightDrag) {
        // En Windows el menú contextual llega después de soltar: si hubo arrastre, se descarta.
        this.suppressMenu = this.rightDrag.moved
        this.rightDrag = null
      }
      if (this.panning) {
        this.panning = null
        canvas.style.cursor = idleCursor()
        return
      }
      if (!this.toolActive) return
      this.toolActive = false
      getTool(useMap.getState().tool).up?.(this.pointer(e))
    }
    on(canvas, 'pointerup', end)
    on(canvas, 'pointercancel', end)

    on(canvas, 'pointerleave', () => {
      if (!this.toolActive) setPreview({ hover: null, ghost: null, edges: null })
    })

    on(
      canvas,
      'wheel',
      (e) => {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015))
        this.requestOverlay()
      },
      { passive: false },
    )

    on(canvas, 'contextmenu', (e) => {
      e.preventDefault()
      if (this.suppressMenu || this.rightDrag?.moved) {
        this.suppressMenu = false
        return
      }
      if (this.toolActive) return
      this.onContextMenu?.({ clientX: e.clientX, clientY: e.clientY, pointer: this.pointer(e) })
    })

    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    }
    on(window, 'keydown', (e) => {
      if (e.code === 'Space' && !typing(e)) {
        this.spaceDown = true
        canvas.style.cursor = 'grab'
        e.preventDefault()
      }
    })
    on(window, 'keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false
        if (!this.panning) canvas.style.cursor = idleCursor()
        // Evita que el Espacio "apriete" el último botón de la interfaz que tenía el foco.
        if (!typing(e)) e.preventDefault()
      }
    })

    // Al cambiar de herramienta se limpian los fantasmas y trazos de la anterior.
    let lastTool = useMap.getState().tool
    this.cleanup.push(
      useMap.subscribe((s) => {
        if (s.tool !== lastTool) {
          getTool(lastTool).cancel?.()
          lastTool = s.tool
          this.toolActive = false
          clearPreview()
          canvas.style.cursor = idleCursor()
        }
      }),
    )
  }
}

export let currentScene: Scene | null = null
export function setCurrentScene(s: Scene | null) {
  currentScene = s
}
