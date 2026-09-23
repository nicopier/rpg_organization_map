import { create } from 'zustand'
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'
import { createCampaign } from '../model/mapDoc'
import type { Campaign, FloorCell, MapDoc, Rotation, WallKind } from '../model/types'
import type { Viewer } from '../model/visibility'

enablePatches()

export type Tool =
  | 'select'
  | 'pan'
  | 'paint'
  | 'room'
  | 'place'
  | 'token'
  | 'wall'
  | 'erase'
  | 'measure'
  | 'fog'
  | 'partyDrop'

export type Role = 'dm' | 'player'

export type Selection =
  | { type: 'none' }
  | { type: 'items'; ids: string[] }
  | { type: 'wall'; layerId: string; key: string }

/** Personaje a colocar con la herramienta 'token'. Si trae characterId, es un PJ de la party ya existente. */
export type TokenDraft = {
  name: string
  kind: 'pc' | 'npc'
  owner: string
  hpMax: number
  ac: number
  speed: number
  initiativeMod: number
  color: string
  size: number
  image?: string
  characterId?: string
}

type HistoryEntry = { patches: Patch[]; inverse: Patch[] }

export type UiState = {
  tool: Tool
  activeLayerId: string
  selection: Selection
  viewer: Viewer
  /** edit: se diseña el mapa (piso, objetos, NPC). play: se juega (party, niebla, marcas). */
  mode: 'edit' | 'play'
  floorBrush: FloorCell
  paintRect: boolean
  placeAssetId: string | null
  tokenDraft: TokenDraft | null
  placeRot: Rotation
  placeFlip: boolean
  wallKind: WallKind
  roomShape: 'rect' | 'path'
  roomOp: 'add' | 'sub'
  roomBrush: number
  fogOp: 'reveal' | 'hide'
  toastMsg: { text: string; id: number } | null
}

type Store = UiState & {
  campaign: Campaign
  /** Mapa que está mirando/editando este cliente (puede no ser el de la mesa). */
  mapId: string
  /** Vista derivada: el mapa `mapId` dentro de la campaña. */
  doc: MapDoc
  role: Role
  /** Id del jugador, en el cliente de jugador. */
  me: string | null
  past: HistoryEntry[]
  future: HistoryEntry[]
  /** Modifica el mapa abierto. Deshacible. */
  change(recipe: (d: Draft<MapDoc>) => void): void
  /** Modifica cualquier parte de la campaña. Deshacible. */
  changeCampaign(recipe: (c: Draft<Campaign>) => void): void
  /** Agrupa todos los cambios hasta endGroup() en una sola entrada de historial (arrastres). */
  beginGroup(): void
  endGroup(): void
  undo(): void
  redo(): void
  /** Aplica parches que llegan del servidor (cambios de jugadores). No entran al historial. */
  applyRemote(patches: Patch[]): void
  loadCampaign(c: Campaign, mapId?: string): void
  /** Reemplaza la campaña sin tocar la interfaz ni el historial (vista del jugador que llega del servidor). */
  syncCampaign(c: Campaign): void
  openMap(id: string): void
  setUi(p: Partial<UiState>): void
  toast(text: string): void
}

const HISTORY_LIMIT = 200

let grouping = false
let groupPatches: Patch[] = []
let groupInverse: Patch[] = []

/** El módulo de red se suscribe acá para mandar al servidor los cambios hechos por el DM. */
const patchListeners = new Set<(patches: Patch[]) => void>()
export function onLocalPatches(fn: (patches: Patch[]) => void) {
  patchListeners.add(fn)
  return () => {
    patchListeners.delete(fn)
  }
}

function initialUi(doc: MapDoc): UiState {
  return {
    tool: 'select',
    activeLayerId: doc.layers[0].id,
    selection: { type: 'none' },
    viewer: 'dm',
    mode: 'edit',
    floorBrush: { assetId: 'stonytile5x5' },
    paintRect: false,
    placeAssetId: null,
    tokenDraft: null,
    placeRot: 0,
    placeFlip: false,
    wallKind: 'door',
    roomShape: 'rect',
    roomOp: 'add',
    roomBrush: 1,
    fogOp: 'reveal',
    toastMsg: null,
  }
}

/** Resuelve el mapa abierto; si ya no existe, cae al de la mesa o al primero. */
function derive(campaign: Campaign, mapId: string) {
  const doc =
    campaign.maps.find((m) => m.id === mapId) ??
    campaign.maps.find((m) => m.id === campaign.activeMapId) ??
    campaign.maps[0]
  return { campaign, doc, mapId: doc.id }
}

const first = createCampaign()

export const useMap = create<Store>()((set, get) => {
  const emit = (patches: Patch[]) => {
    if (get().role === 'dm') for (const fn of patchListeners) fn(patches)
  }

  const commit = (next: Campaign, patches: Patch[], inverse: Patch[]) => {
    if (!patches.length) return
    // El jugador no edita la campaña: sus cambios son locales (optimistas) y la verdad llega del servidor.
    if (get().role === 'player') {
      set(derive(next, get().mapId))
      return
    }
    if (grouping) {
      groupPatches.push(...patches)
      groupInverse = [...inverse, ...groupInverse]
      set(derive(next, get().mapId))
    } else {
      set((s) => ({
        ...derive(next, s.mapId),
        past: [...s.past, { patches, inverse }].slice(-HISTORY_LIMIT),
        future: [],
      }))
    }
    emit(patches)
  }

  return {
    ...initialUi(first.maps[0]),
    ...derive(first, first.maps[0].id),
    role: 'dm',
    me: null,
    past: [],
    future: [],

    changeCampaign(recipe) {
      const [next, patches, inverse] = produceWithPatches(get().campaign, recipe)
      commit(next, patches, inverse)
    },

    change(recipe) {
      const id = get().mapId
      get().changeCampaign((c) => {
        const m = c.maps.find((x) => x.id === id)
        if (m) recipe(m)
      })
    },

    beginGroup() {
      if (grouping) get().endGroup()
      grouping = true
      groupPatches = []
      groupInverse = []
    },

    endGroup() {
      if (!grouping) return
      grouping = false
      if (!groupPatches.length) return
      const entry = { patches: groupPatches, inverse: groupInverse }
      groupPatches = []
      groupInverse = []
      set((s) => ({ past: [...s.past, entry].slice(-HISTORY_LIMIT), future: [] }))
    },

    undo() {
      get().endGroup()
      const entry = get().past[get().past.length - 1]
      if (!entry) return
      set((s) => ({
        ...derive(applyPatches(s.campaign, entry.inverse), s.mapId),
        past: s.past.slice(0, -1),
        future: [entry, ...s.future],
      }))
      emit(entry.inverse)
    },

    redo() {
      get().endGroup()
      const entry = get().future[0]
      if (!entry) return
      set((s) => ({
        ...derive(applyPatches(s.campaign, entry.patches), s.mapId),
        past: [...s.past, entry],
        future: s.future.slice(1),
      }))
      emit(entry.patches)
    },

    applyRemote(patches) {
      if (!patches.length) return
      set((s) => derive(applyPatches(s.campaign, patches), s.mapId))
    },

    loadCampaign(c, mapId) {
      grouping = false
      const d = derive(c, mapId ?? c.activeMapId ?? c.maps[0].id)
      set({ ...initialUi(d.doc), viewer: get().viewer, mode: get().mode, ...d, past: [], future: [] })
    },

    syncCampaign(c) {
      set((s) => derive(c, s.mapId))
    },

    openMap(id) {
      const s = get()
      if (id === s.mapId) return
      s.endGroup()
      const d = derive(s.campaign, id)
      set({ ...d, selection: { type: 'none' }, activeLayerId: d.doc.layers[0].id })
    },

    setUi(p) {
      set(p)
    },

    toast(text) {
      set({ toastMsg: { text, id: Date.now() } })
    },
  }
})
