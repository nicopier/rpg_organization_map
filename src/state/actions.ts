// Operaciones de dominio. Herramientas y UI llaman acá; todo pasa por change()/changeCampaign() y es deshacible.
import type { Draft } from 'immer'
import { getAsset } from '../assets/catalog'
import { newId, newKey } from '../model/ids'
import { isInside, type NodeKind } from '../model/tree'
import { cellKey, createEmptyMap, layerOfKind, makePlayer } from '../model/mapDoc'
import { findLayer } from '../model/queries'
import { isPlayerOwned, sortCombat } from '../model/combat'
import {
  TOKEN_ASSET,
  type Campaign,
  type Character,
  type CombatEntry,
  type DungeonStyle,
  type FloorCell,
  type Grid,
  type Layer,
  type MapDoc,
  type Placement,
  type RoomShape,
  type RoomShapeInput,
  type Rotation,
  type Visibility,
  type DmNote,
  type WallPiece,
} from '../model/types'
import { effectiveVisibility } from '../model/visibility'
import { net } from '../net/bridge'
import { useMap, type TokenDraft } from './mapStore'

const S = () => useMap.getState()
const change = (r: (d: Draft<MapDoc>) => void) => S().change(r)
const changeCampaign = (r: (c: Draft<Campaign>) => void) => S().changeCampaign(r)

/** Cambio sobre el mapa abierto con acceso a la campaña (party, jugadores). */
function changeMap(r: (m: Draft<MapDoc>, c: Draft<Campaign>) => void) {
  const id = S().mapId
  changeCampaign((c) => {
    const m = c.maps.find((x) => x.id === id)
    if (m) r(m, c)
  })
}

const layerOf = (d: Draft<MapDoc>, id: string) => d.layers.find((l) => l.id === id)

function findDraftItem(d: Draft<MapDoc>, id: string) {
  for (const layer of d.layers) {
    const item = layer.items?.find((i) => i.id === id)
    if (item) return { layer, item }
  }
  return null
}

/** Una ficha puede ser un NPC del mapa o un PJ de la party. */
function charIn(c: Draft<Campaign>, m: Draft<MapDoc> | undefined, id: string | undefined) {
  if (!id) return undefined
  return m?.characters.find((x) => x.id === id) ?? c.party.find((x) => x.id === id)
}

export const isPartyChar = (id: string | undefined) => !!id && S().campaign.party.some((c) => c.id === id)

export function activeLayer(): Layer | undefined {
  const { doc, activeLayerId } = S()
  return findLayer(doc, activeLayerId)
}

/* ---------- Piso ---------- */

export function paintFloor(layerId: string, cells: [number, number][], brush: FloorCell) {
  change((d) => {
    const l = layerOf(d, layerId)
    if (!l) return
    l.cells ??= {}
    for (const [x, y] of cells) {
      const k = cellKey(x, y)
      const cur = l.cells[k]
      if (cur && JSON.stringify(cur) === JSON.stringify(brush)) continue
      l.cells[k] = { ...brush }
    }
  })
}

export function eraseFloor(layerId: string, cells: [number, number][]) {
  change((d) => {
    const l = layerOf(d, layerId)
    if (!l?.cells) return
    for (const [x, y] of cells) delete l.cells[cellKey(x, y)]
  })
}

/* ---------- Salas ---------- */

export function addRoomShape(layerId: string, shape: RoomShapeInput) {
  change((d) => {
    const l = layerOf(d, layerId)
    if (!l) return
    ;(l.shapes ??= []).push({ ...shape, id: newId('R') } as RoomShape)
  })
}

export function updateDungeonStyle(layerId: string, patch: Partial<DungeonStyle>) {
  change((d) => {
    const l = layerOf(d, layerId)
    if (l?.dungeon) Object.assign(l.dungeon, patch)
  })
}

export function clearRooms(layerId: string) {
  change((d) => {
    const l = layerOf(d, layerId)
    if (l) l.shapes = []
  })
}

/* ---------- Puertas y muros sobre bordes ---------- */

export function setWalls(layerId: string, keys: string[], piece: WallPiece) {
  change((d) => {
    const l = layerOf(d, layerId)
    if (!l) return
    l.walls ??= {}
    for (const k of keys) {
      const p: WallPiece = { ...piece }
      // La puerta secreta nace oculta para los jugadores.
      if (p.kind === 'secretDoor' && !p.visibility) p.visibility = 'dm'
      l.walls[k] = p
    }
  })
}

export function removeWalls(layerId: string, keys: string[]) {
  change((d) => {
    const l = layerOf(d, layerId)
    if (!l?.walls) return
    for (const k of keys) delete l.walls[k]
  })
}

export function updateWall(layerId: string, key: string, patch: Partial<WallPiece>) {
  change((d) => {
    const w = layerOf(d, layerId)?.walls?.[key]
    if (!w) return
    Object.assign(w, patch)
    if ('visibility' in patch && patch.visibility === undefined) delete w.visibility
  })
}

/* ---------- Objetos ---------- */

export function placeAsset(layerId: string, assetId: string, x: number, y: number, rot: Rotation, flipX: boolean): string | null {
  const a = getAsset(assetId)
  if (!a) return null
  const swap = rot === 90 || rot === 270
  const id = newId('P')
  change((d) => {
    layerOf(d, layerId)?.items?.push({ id, assetId, x, y, w: swap ? a.h : a.w, h: swap ? a.w : a.h, rot, flipX })
  })
  return id
}

/** Mueve tokens/objetos. El jugador no edita la campaña: manda la jugada al servidor y la ve al instante. */
export function setPositions(pos: Map<string, [number, number]>) {
  if (S().role === 'player') {
    for (const [id, [x, y]] of pos) {
      const it = S().doc.layers.flatMap((l) => l.items ?? []).find((i) => i.id === id)
      if (it?.characterId) net.send({ t: 'move', characterId: it.characterId, x, y })
    }
  }
  change((d) => {
    for (const [id, [x, y]] of pos) {
      const f = findDraftItem(d, id)
      if (f) {
        f.item.x = x
        f.item.y = y
      }
    }
  })
}

export function rotateItems(ids: string[]) {
  change((d) => {
    for (const id of ids) {
      const f = findDraftItem(d, id)
      if (!f || f.item.assetId === TOKEN_ASSET) continue
      const it = f.item
      it.rot = ((it.rot + 90) % 360) as Rotation
      const w = it.w
      it.w = it.h
      it.h = w
    }
  })
}

/** Tope de tamaño: más que esto no entra en ningún mapa razonable y evita un typo de 3 dígitos. */
export const MAX_ITEM_CELLS = 20

/**
 * Cambia el footprint de objetos ya colocados, en casillas.
 * `size` puede ser fijo o depender de cada objeto (para agrandar/achicar de a uno).
 * Se recorta para que el objeto no se salga del mapa; los tokens de personaje no se tocan.
 */
export function resizeItems(ids: string[], size: { w: number; h: number } | ((it: Placement) => { w: number; h: number })) {
  change((d) => {
    for (const id of ids) {
      const f = findDraftItem(d, id)
      if (!f || f.item.assetId === TOKEN_ASSET) continue
      const it = f.item
      const want = typeof size === 'function' ? size(it) : size
      // El objeto se queda donde está: el tope es lo que hay entre su esquina y el borde.
      const w = Math.max(1, Math.min(Math.round(want.w), MAX_ITEM_CELLS, d.grid.cols - it.x))
      const h = Math.max(1, Math.min(Math.round(want.h), MAX_ITEM_CELLS, d.grid.rows - it.y))
      it.w = w
      it.h = h
    }
  })
}

/** Devuelve el footprint que tendría el asset sin rotar, ya intercambiado si el objeto está de costado. */
export function baseSize(it: Placement): { w: number; h: number } {
  const swap = it.rot === 90 || it.rot === 270
  const a = getAsset(it.assetId)
  if (!a) return { w: it.w, h: it.h }
  return swap ? { w: a.h, h: a.w } : { w: a.w, h: a.h }
}

export function flipItems(ids: string[]) {
  change((d) => {
    for (const id of ids) {
      const f = findDraftItem(d, id)
      if (f && f.item.assetId !== TOKEN_ASSET) f.item.flipX = !f.item.flipX
    }
  })
}

export function updateItem(id: string, patch: Partial<Placement>) {
  change((d) => {
    const f = findDraftItem(d, id)
    if (!f) return
    Object.assign(f.item, patch)
    // `undefined` significa "heredar de la capa": se borra la clave.
    for (const k of Object.keys(patch) as (keyof Placement)[]) if (patch[k] === undefined) delete f.item[k]
  })
}

/** Notas y datos del DM sobre un objeto; sin texto ni propiedades se borran. */
export function setItemNote(id: string, note: DmNote | undefined) {
  const clean = note && {
    text: note.text.trim(),
    props: note.props.map((p) => ({ k: p.k.trim(), v: p.v.trim() })).filter((p) => p.k || p.v),
    color: note.color,
  }
  change((d) => {
    const f = findDraftItem(d, id)
    if (!f) return
    if (clean && (clean.text || clean.props.length)) f.item.note = clean
    else delete f.item.note
  })
}

/** Pasa objetos entre Objetos y Juego (marcas). Los tokens no cambian de capa. */
export function moveItemsToLayer(ids: string[], layerId: string) {
  change((d) => {
    const target = layerOf(d, layerId)
    if (!target?.items) return
    for (const l of d.layers) {
      if (l === target || !l.items) continue
      const moving = l.items.filter((it) => ids.includes(it.id) && it.assetId !== TOKEN_ASSET)
      if (!moving.length) continue
      l.items = l.items.filter((it) => !moving.includes(it))
      target.items.push(...moving)
    }
  })
}

function removeFromOrder(m: Draft<MapDoc>, ids: Set<string>) {
  const cur = m.combat.order[m.combat.turnIndex]?.characterId
  m.combat.order = m.combat.order.filter((e) => !ids.has(e.characterId))
  const idx = m.combat.order.findIndex((e) => e.characterId === cur)
  m.combat.turnIndex = idx >= 0 ? idx : Math.min(m.combat.turnIndex, Math.max(0, m.combat.order.length - 1))
}

/** Borra objetos. La ficha de un NPC se va con su token; un PJ sólo sale del mapa, sigue en la party. */
export function deleteItems(ids: string[]) {
  const set = new Set(ids)
  change((d) => {
    const gone = new Set<string>()
    for (const l of d.layers) {
      if (!l.items) continue
      for (const it of l.items) if (set.has(it.id) && it.characterId) gone.add(it.characterId)
      l.items = l.items.filter((it) => !set.has(it.id))
    }
    const still = new Set(d.layers.flatMap((l) => (l.items ?? []).map((i) => i.characterId)))
    const npcGone = new Set([...gone].filter((c) => !still.has(c) && d.characters.some((x) => x.id === c)))
    d.characters = d.characters.filter((c) => !npcGone.has(c.id))
    removeFromOrder(d, new Set([...gone].filter((c) => !still.has(c))))
  })
}

function baseName(name: string) {
  return name.replace(/\s+\d+$/, '')
}

function uniqueName(chars: { name: string }[], name: string): string {
  const base = baseName(name)
  let max = 0
  let found = false
  for (const c of chars) {
    if (c.name === base) {
      found = true
      max = Math.max(max, 1)
    }
    const m = c.name.match(/^(.*)\s+(\d+)$/)
    if (m && m[1] === base) {
      found = true
      max = Math.max(max, Number(m[2]))
    }
  }
  return found ? `${base} ${max + 1}` : base
}

/** Duplica objetos y NPCs corridos una casilla (los NPC con ficha nueva autonumerada). Los PJ no se duplican. */
export function duplicateItems(ids: string[]): string[] {
  const out: string[] = []
  change((d) => {
    for (const id of ids) {
      const f = findDraftItem(d, id)
      if (!f || (f.layer.kind === 'game' && f.item.characterId)) continue
      const copy: Placement = { ...JSON.parse(JSON.stringify(f.item)), id: newId('P'), x: f.item.x + 1, y: f.item.y + 1 }
      if (f.item.characterId) {
        const src = d.characters.find((c) => c.id === f.item.characterId)
        if (!src) continue
        const ch: Character = { ...JSON.parse(JSON.stringify(src)), id: newId('C') }
        ch.name = uniqueName(d.characters, src.name)
        ch.hp.cur = ch.hp.max
        ch.hp.temp = 0
        ch.conditions = []
        d.characters.push(ch)
        copy.characterId = ch.id
      }
      f.layer.items!.push(copy)
      out.push(copy.id)
    }
  })
  return out
}

/* ---------- Visibilidad ---------- */

export function setItemsVisibility(ids: string[], vis: Visibility | undefined) {
  change((d) => {
    for (const id of ids) {
      const f = findDraftItem(d, id)
      if (!f) continue
      // Si coincide con la capa, se hereda en vez de guardar un override redundante.
      if (vis === undefined || vis === f.layer.visibility) delete f.item.visibility
      else f.item.visibility = vis
    }
  })
}

/** Oculta si está visible, revela si está oculto. Mira el primer elemento para decidir. */
export function toggleHiddenSelection() {
  const { selection, doc } = S()
  if (selection.type === 'items' && selection.ids.length) {
    let hidden = false
    for (const l of doc.layers) {
      const it = l.items?.find((i) => i.id === selection.ids[0])
      if (it) hidden = effectiveVisibility(it, l) === 'dm'
    }
    setItemsVisibility(selection.ids, hidden ? 'all' : 'dm')
    S().toast(hidden ? 'Revelado a los jugadores' : 'Oculto para los jugadores')
  } else if (selection.type === 'wall') {
    const l = findLayer(doc, selection.layerId)
    const w = l?.walls?.[selection.key]
    if (!l || !w) return
    const hidden = effectiveVisibility(w, l) === 'dm'
    updateWall(l.id, selection.key, { visibility: hidden ? 'all' : 'dm' })
    S().toast(hidden ? 'Revelado a los jugadores' : 'Oculto para los jugadores')
  }
}

/* ---------- Resaltar ---------- */

export function setItemsHighlight(ids: string[], on: boolean) {
  change((d) => {
    for (const id of ids) {
      const f = findDraftItem(d, id)
      if (!f) continue
      if (on) f.item.highlight = true
      else delete f.item.highlight
    }
  })
}

/** Resalta lo seleccionado, o le saca el brillo si el primero ya lo tenía. */
export function toggleHighlightSelection() {
  const { selection, doc } = S()
  if (selection.type !== 'items' || !selection.ids.length) return
  const first = doc.layers.flatMap((l) => l.items ?? []).find((i) => i.id === selection.ids[0])
  const on = !first?.highlight
  setItemsHighlight(selection.ids, on)
  S().toast(on ? 'Resaltado: brilla para todos' : 'Ya no brilla')
}

/* ---------- Personajes ---------- */

function newCharacter(d: TokenDraft, name: string): Character {
  return {
    id: newId('C'),
    name,
    kind: d.kind,
    owner: d.kind === 'pc' ? d.owner : 'dm',
    hp: { cur: d.hpMax, max: d.hpMax, temp: 0 },
    ac: d.ac,
    speed: d.speed,
    initiativeMod: d.initiativeMod,
    conditions: [],
    notes: '',
    color: d.color,
    ...(d.image ? { image: d.image } : {}),
    ...(d.monster && d.kind === 'npc' ? { monster: d.monster } : {}),
  }
}

/**
 * Coloca un token. NPC: crea la ficha en el mapa (capa NPC).
 * PJ: usa la ficha de la party (o la crea) y lo pone en la capa Juego; si estaba en otro mapa, lo trae.
 */
export function placeToken(draft: TokenDraft, x: number, y: number): string | null {
  const pid = newId('P')
  const mapId = S().mapId
  changeCampaign((c) => {
    const m = c.maps.find((mm) => mm.id === mapId)!
    if (draft.kind === 'npc') {
      const ch = newCharacter(draft, uniqueName(m.characters, draft.name || 'NPC'))
      m.characters.push(ch)
      layerOfKind(m, 'npc').items!.push({ id: pid, assetId: TOKEN_ASSET, x, y, w: draft.size, h: draft.size, rot: 0, flipX: false, characterId: ch.id })
      return
    }
    let ch = draft.characterId ? c.party.find((p) => p.id === draft.characterId) : undefined
    if (!ch) {
      ch = newCharacter(draft, uniqueName(c.party, draft.name || 'Personaje'))
      c.party.push(ch)
    }
    const cid = ch.id
    // Un PJ está en un solo mapa a la vez.
    for (const mm of c.maps) {
      const g = layerOfKind(mm, 'game')
      g.items = g.items!.filter((it) => it.characterId !== cid)
    }
    layerOfKind(m, 'game').items!.push({ id: pid, assetId: TOKEN_ASSET, x, y, w: draft.size, h: draft.size, rot: 0, flipX: false, characterId: cid })
  })
  return pid
}

export function updateCharacter(id: string, recipe: (c: Draft<Character>) => void) {
  if (S().role === 'player') {
    // El jugador edita su ficha: se calcula el resultado localmente y se manda al servidor.
    const cur = S().campaign.party.find((c) => c.id === id)
    if (!cur) return
    const draft = JSON.parse(JSON.stringify(cur)) as Character
    recipe(draft as Draft<Character>)
    net.send({ t: 'char', characterId: id, patch: draft })
  }
  changeMap((m, c) => {
    const ch = charIn(c, m, id)
    if (ch) recipe(ch)
  })
}

/** amount < 0 es daño (absorbe primero el HP temporal), amount > 0 es curación hasta el máximo. */
function hpDelta(c: Draft<Character>, amount: number) {
  if (amount < 0) {
    let dmg = -amount
    const fromTemp = Math.min(c.hp.temp, dmg)
    c.hp.temp -= fromTemp
    dmg -= fromTemp
    c.hp.cur = Math.max(0, c.hp.cur - dmg)
  } else {
    c.hp.cur = Math.min(c.hp.max, c.hp.cur + amount)
  }
}

export function applyHp(id: string, amount: number) {
  updateCharacter(id, (c) => hpDelta(c, amount))
}

/* ---------- Varios NPC a la vez (una sola entrada de deshacer) ---------- */

/** Edita las fichas de varios NPC del mapa abierto. Sólo el DM. */
export function updateCharacters(ids: string[], recipe: (c: Draft<Character>) => void) {
  const set = new Set(ids)
  changeMap((m) => {
    for (const ch of m.characters) if (set.has(ch.id)) recipe(ch)
  })
}

/** Daño o curación a todos (una bola de fuego). */
export function applyHpMany(ids: string[], amount: number) {
  updateCharacters(ids, (c) => hpDelta(c, amount))
}

/** Cambia el HP máximo; los que estaban enteros quedan enteros con el nuevo máximo. */
export function setHpMaxMany(ids: string[], max: number) {
  updateCharacters(ids, (c) => {
    c.hp.cur = c.hp.cur >= c.hp.max ? max : Math.min(c.hp.cur, max)
    c.hp.max = max
  })
}

/** Los renombra "Goblin", "Goblin 2", "Goblin 3"… sin chocar con otros NPC del mapa. */
export function renameMany(ids: string[], name: string) {
  const set = new Set(ids)
  changeMap((m) => {
    const taken = m.characters.filter((c) => !set.has(c.id)).map((c) => ({ name: c.name }))
    for (const id of ids) {
      const ch = m.characters.find((c) => c.id === id)
      if (!ch) continue
      ch.name = uniqueName(taken, name.trim() || ch.name)
      taken.push({ name: ch.name })
    }
  })
}

/**
 * Manda NPCs (tokens de la capa NPC) del mapa abierto a otro: la ficha viaja con el token, sale del
 * combate de este mapa y queda en la misma posición (ajustada si el otro mapa es más chico).
 * Si el nombre choca con uno de allá, se renumera. Devuelve cuántos se mandaron.
 */
export function sendNpcsToMap(itemIds: string[], targetMapId: string): number {
  const fromId = S().mapId
  if (targetMapId === fromId) return 0
  const set = new Set(itemIds)
  let moved = 0
  changeCampaign((c) => {
    const from = c.maps.find((m) => m.id === fromId)
    const to = c.maps.find((m) => m.id === targetMapId)
    if (!from || !to) return
    const src = layerOfKind(from, 'npc')
    const dst = layerOfKind(to, 'npc')
    const gone = new Set<string>()
    for (const it of (src.items ?? []).filter((i) => set.has(i.id) && i.characterId)) {
      const ch = from.characters.find((x) => x.id === it.characterId)
      if (!ch) continue
      src.items = src.items!.filter((i) => i.id !== it.id)
      // Si el mismo NPC tenía otro token acá (raro), la ficha se queda.
      if (!src.items.some((i) => i.characterId === ch.id)) {
        from.characters = from.characters.filter((x) => x.id !== ch.id)
        gone.add(ch.id)
      }
      const copy = JSON.parse(JSON.stringify(ch)) as Character
      if (!gone.has(ch.id)) copy.id = newId('C')
      copy.name = uniqueName(to.characters, ch.name)
      to.characters.push(copy)
      const w = Math.min(it.w, to.grid.cols)
      const h = Math.min(it.h, to.grid.rows)
      ;(dst.items ??= []).push({
        ...JSON.parse(JSON.stringify(it)),
        characterId: copy.id,
        w,
        h,
        x: Math.max(0, Math.min(it.x, to.grid.cols - w)),
        y: Math.max(0, Math.min(it.y, to.grid.rows - h)),
      })
      moved++
    }
    removeFromOrder(from, gone)
  })
  if (moved) S().setUi({ selection: { type: 'none' } })
  return moved
}

/** Selecciona en el mapa todos los NPC iguales a este: misma criatura del manual, o mismo nombre sin el número. */
export function selectSimilarNpcs(characterId: string) {
  const { doc } = S()
  const ref = doc.characters.find((c) => c.id === characterId)
  if (!ref) return
  const same = (c: Character) => (ref.monster ? c.monster === ref.monster : !c.monster && baseName(c.name) === baseName(ref.name))
  const chars = new Set(doc.characters.filter(same).map((c) => c.id))
  const ids = doc.layers.flatMap((l) => (l.kind === 'npc' ? (l.items ?? []).filter((i) => i.characterId && chars.has(i.characterId)).map((i) => i.id) : []))
  S().setUi({ selection: { type: 'items', ids } })
  S().toast(`${ids.length} seleccionados`)
}

/* ---------- Party y jugadores ---------- */

export function addPartyMember(draft: TokenDraft): string {
  const ch = newCharacter({ ...draft, kind: 'pc' }, '')
  changeCampaign((c) => {
    ch.name = uniqueName(c.party, draft.name || 'Personaje')
    c.party.push(ch)
  })
  return ch.id
}

/** Saca a un PJ de la campaña: su token desaparece de todos los mapas. */
export function removePartyMember(id: string) {
  changeCampaign((c) => {
    c.party = c.party.filter((p) => p.id !== id)
    for (const m of c.maps) {
      const g = layerOfKind(m, 'game')
      g.items = g.items!.filter((it) => it.characterId !== id)
      removeFromOrder(m, new Set([id]))
    }
  })
}

/** Dónde está cada PJ: id de mapa o null si no está en ninguno. */
export function partyLocation(c: Campaign): Map<string, string | null> {
  const out = new Map<string, string | null>(c.party.map((p) => [p.id, null]))
  for (const m of c.maps) {
    for (const it of layerOfKind(m, 'game').items ?? []) if (it.characterId && out.has(it.characterId)) out.set(it.characterId, m.id)
  }
  return out
}

/** Casillas libres en espiral desde (x, y), dentro del mapa. */
function* spiral(x: number, y: number, grid: Grid, taken: Set<string>): Generator<[number, number]> {
  for (let r = 0; r < Math.max(grid.cols, grid.rows); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const cx = x + dx
        const cy = y + dy
        if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows || taken.has(cellKey(cx, cy))) continue
        taken.add(cellKey(cx, cy))
        yield [cx, cy]
      }
    }
  }
}

/**
 * Lleva la party entera (o los PJ indicados) al mapa abierto, en formación alrededor de (x, y),
 * y lo marca como el mapa de la mesa. Los tokens se van de donde estaban.
 */
export function moveParty(x: number, y: number, ids?: string[]) {
  const mapId = S().mapId
  changeCampaign((c) => {
    const m = c.maps.find((mm) => mm.id === mapId)!
    const members = c.party.filter((p) => !ids || ids.includes(p.id))
    const who = new Set(members.map((p) => p.id))
    const sizes = new Map<string, number>()
    for (const mm of c.maps) {
      const g = layerOfKind(mm, 'game')
      for (const it of g.items!) if (it.characterId && who.has(it.characterId)) sizes.set(it.characterId, it.w)
      g.items = g.items!.filter((it) => !it.characterId || !who.has(it.characterId))
      if (mm.id !== mapId) removeFromOrder(mm, who)
    }
    const taken = new Set<string>()
    for (const l of m.layers) {
      for (const it of l.items ?? []) {
        if (!it.characterId) continue
        for (let i = 0; i < it.w; i++) for (let j = 0; j < it.h; j++) taken.add(cellKey(it.x + i, it.y + j))
      }
    }
    const spots = spiral(x, y, m.grid, taken)
    for (const p of members) {
      const [sx, sy] = spots.next().value ?? [x, y]
      const size = sizes.get(p.id) ?? 1
      layerOfKind(m, 'game').items!.push({ id: newId('P'), assetId: TOKEN_ASSET, x: sx, y: sy, w: size, h: size, rot: 0, flipX: false, characterId: p.id })
    }
    c.activeMapId = mapId
  })
}

export function setActiveMap(id: string) {
  changeCampaign((c) => {
    c.activeMapId = id
  })
}

export function addPlayer(name: string): string {
  const id = newId('J')
  changeCampaign((c) => {
    c.players.push({ ...makePlayer(name, c.players.length), id })
  })
  return id
}

/** Congela (o libera) el movimiento de todos los jugadores. */
export function setMovementLocked(locked: boolean) {
  changeCampaign((c) => {
    if (locked) c.movementLocked = true
    else delete c.movementLocked
  })
}

/** Congela (o libera) el movimiento de un personaje. */
export function setCharacterLocked(id: string, locked: boolean) {
  changeCampaign((c) => {
    const ch = c.party.find((p) => p.id === id)
    if (!ch) return
    if (locked) ch.moveLocked = true
    else delete ch.moveLocked
  })
}

/** Bloquea (o libera) las tiradas de dados de todos los jugadores. */
export function setDiceLocked(locked: boolean) {
  changeCampaign((c) => {
    if (locked) c.diceLocked = true
    else delete c.diceLocked
  })
}

/** Bloquea (o libera) las tiradas de dados de un personaje. */
export function setCharacterDiceLocked(id: string, locked: boolean) {
  changeCampaign((c) => {
    const ch = c.party.find((p) => p.id === id)
    if (!ch) return
    if (locked) ch.diceLocked = true
    else delete ch.diceLocked
  })
}

/** Genera n invitaciones: cada una es una silla con su propio link. */
export function addInvites(n: number) {
  changeCampaign((c) => {
    for (let i = 0; i < n; i++) c.players.push(makePlayer('', c.players.length))
  })
}

/** Link nuevo para una silla: el anterior deja de funcionar y quien lo usaba queda afuera. */
export function regenerateInvite(id: string) {
  changeCampaign((c) => {
    const p = c.players.find((x) => x.id === id)
    if (p) p.key = newKey()
  })
}

export function renamePlayer(id: string, name: string) {
  changeCampaign((c) => {
    const p = c.players.find((x) => x.id === id)
    if (p) p.name = name
  })
}

/** Quita a un jugador. Sus personajes quedan en la party, a cargo del DM. */
export function removePlayer(id: string) {
  changeCampaign((c) => {
    c.players = c.players.filter((p) => p.id !== id)
    for (const ch of c.party) if (ch.owner === id) ch.owner = 'dm'
  })
}

/* ---------- Zonas y mapas ---------- */

export function renameCampaign(name: string) {
  changeCampaign((c) => {
    c.name = name
  })
}

export function addZone(parentId: string | null = null, name = 'Carpeta nueva'): string {
  const id = newId('Z')
  changeCampaign((c) => {
    c.zones.push({ id, name, parentId })
  })
  return id
}

export function renameZone(id: string, name: string) {
  changeCampaign((c) => {
    const z = c.zones.find((x) => x.id === id)
    if (z) z.name = name
  })
}

/** Lo que colgaba de un nodo borrado sube un nivel: borrar una carpeta o un mapa nunca se lleva a sus hijos. */
function adoptChildren(c: Draft<Campaign>, id: string, newParent: string | null) {
  for (const z of c.zones) if (z.parentId === id) z.parentId = newParent
  for (const m of c.maps) if (m.parentId === id) m.parentId = newParent
}

/** Borra una carpeta; su contenido pasa a la carpeta de arriba. */
export function removeZone(id: string) {
  changeCampaign((c) => {
    const z = c.zones.find((x) => x.id === id)
    if (!z) return
    adoptChildren(c, id, z.parentId ?? null)
    c.zones = c.zones.filter((x) => x.id !== id)
  })
}

export function addMap(parentId: string | null, name = 'Mapa nuevo', cols = 30, rows = 20): string {
  const map = createEmptyMap(name, cols, rows, parentId)
  changeCampaign((c) => {
    c.maps.push(map)
  })
  S().openMap(map.id)
  return map.id
}

export function renameMapById(id: string, name: string) {
  changeCampaign((c) => {
    const m = c.maps.find((x) => x.id === id)
    if (m) m.name = name
  })
}

export function renameMap(name: string) {
  renameMapById(S().mapId, name)
}

/** Copia el diseño (piso, objetos, NPC); la party y las marcas de juego no se copian. */
export function duplicateMap(id: string): string | null {
  const src = S().campaign.maps.find((m) => m.id === id)
  if (!src) return null
  const copy: MapDoc = JSON.parse(JSON.stringify(src))
  copy.id = newId('M')
  copy.name = `${src.name} (copia)`
  for (const l of copy.layers) l.id = newId('L')
  layerOfKind(copy, 'game').items = []
  copy.combat = { active: false, round: 1, turnIndex: 0, order: [] }
  changeCampaign((c) => {
    const i = c.maps.findIndex((m) => m.id === id)
    c.maps.splice(i + 1, 0, copy)
  })
  return copy.id
}

export function deleteMap(id: string) {
  if (S().campaign.maps.length <= 1) return S().toast('La campaña necesita al menos un mapa.')
  changeCampaign((c) => {
    const m = c.maps.find((x) => x.id === id)
    if (!m) return
    adoptChildren(c, id, m.parentId)
    c.maps = c.maps.filter((x) => x.id !== id)
    if (c.activeMapId === id) c.activeMapId = c.maps[0].id
  })
}

/**
 * Mueve una carpeta o un mapa adentro de `parentId` (null = raíz), antes de `beforeId` si es
 * del mismo tipo, o al final. No deja meter un nodo dentro de sí mismo.
 */
export function moveNode(kind: NodeKind, id: string, parentId: string | null, beforeId?: string) {
  const c0 = S().campaign
  if (parentId === id || (parentId && isInside(c0, parentId, id))) return
  changeCampaign((c) => {
    const list = (kind === 'zone' ? c.zones : c.maps) as { id: string; parentId?: string | null }[]
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) return
    const [node] = list.splice(i, 1)
    node.parentId = parentId
    const j = beforeId ? list.findIndex((x) => x.id === beforeId) : -1
    if (j >= 0) list.splice(j, 0, node)
    else list.push(node)
  })
}

export function updateGrid(patch: Partial<Grid>) {
  change((d) => {
    Object.assign(d.grid, patch)
  })
}

export function updateLayer(id: string, patch: Partial<Layer>) {
  change((d) => {
    const l = layerOf(d, id)
    if (l) Object.assign(l, patch)
  })
}

/* ---------- Niebla y marcas ---------- */

export function setFogEnabled(enabled: boolean) {
  change((d) => {
    d.fog.enabled = enabled
  })
}

/** Revela u oculta los nombres de los NPC de este mapa para los jugadores. */
export function setRevealNpcNames(reveal: boolean) {
  change((d) => {
    if (reveal) d.revealNpcNames = true
    else delete d.revealNpcNames
  })
}

/* ---------- Manual de monstruos e imágenes de referencia ---------- */

/** Sólo links http(s) o imágenes subidas al servidor: nada de javascript: ni data: en la campaña. */
export function isRefImageUrl(url: string): boolean {
  if (url.startsWith('/uploads/')) return /^\/uploads\/[a-f0-9]{16}\.(png|jpg|gif|webp)$/.test(url)
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') && url.length <= 2000
  } catch {
    return false
  }
}

export function addRefImage(key: string, url: string): boolean {
  url = url.trim()
  if (!isRefImageUrl(url)) return false
  changeCampaign((c) => {
    const all = (c.refImages ??= {})
    const list = (all[key] ??= [])
    if (!list.includes(url)) list.push(url)
  })
  return true
}

export function removeRefImage(key: string, url: string) {
  changeCampaign((c) => {
    const list = c.refImages?.[key]
    if (!list) return
    c.refImages![key] = list.filter((u) => u !== url)
    if (!c.refImages![key].length) delete c.refImages![key]
    if (c.showcase?.url === url) delete c.showcase
  })
}

export function setRefQuery(key: string, q: string) {
  changeCampaign((c) => {
    const v = q.trim()
    if (v) (c.refQueries ??= {})[key] = v
    else if (c.refQueries) delete c.refQueries[key]
  })
}

export function setRefImagesOff(off: boolean) {
  changeCampaign((c) => {
    if (off) {
      c.refImagesOff = true
      delete c.showcase
    } else delete c.refImagesOff
  })
}

/** Les muestra la imagen a los jugadores (o deja de mostrarla con url null). */
export function showToPlayers(url: string | null, title?: string) {
  changeCampaign((c) => {
    if (!url || !isRefImageUrl(url)) delete c.showcase
    else c.showcase = { id: newId('S'), url, ...(title?.trim() ? { title: title.trim() } : {}) }
  })
}

export function setCharacterMonster(id: string, monster: string | undefined) {
  changeMap((m) => {
    const ch = m.characters.find((x) => x.id === id)
    if (!ch) return
    if (monster) ch.monster = monster
    else delete ch.monster
  })
}

export function revealCells(cells: [number, number][], reveal: boolean) {
  change((d) => {
    for (const [x, y] of cells) {
      const k = cellKey(x, y)
      if (reveal) d.fog.revealed[k] = 1
      else delete d.fog.revealed[k]
    }
  })
}

export function revealAll(reveal: boolean) {
  change((d) => {
    d.fog.revealed = {}
    if (reveal) for (let y = 0; y < d.grid.rows; y++) for (let x = 0; x < d.grid.cols; x++) d.fog.revealed[cellKey(x, y)] = 1
  })
}

/** Borra las marcas de la sesión (lo que no es token en la capa Juego). */
export function clearMarks() {
  change((d) => {
    const g = layerOfKind(d, 'game')
    g.items = g.items!.filter((it) => it.assetId === TOKEN_ASSET)
  })
}

/* ---------- Combate ---------- */

const d20 = () => 1 + Math.floor(Math.random() * 20)

/** Personajes con token en el mapa (NPC y party), en capas visibles. */
function charactersOnMap(m: Draft<MapDoc>): string[] {
  const ids = new Set<string>()
  for (const l of m.layers) {
    if ((l.kind !== 'npc' && l.kind !== 'game') || !l.visible) continue
    for (const it of l.items ?? []) if (it.characterId) ids.add(it.characterId)
  }
  return [...ids]
}

/** Entrada nueva: el DM tira ya, salvo los personajes de jugadores, que quedan esperando su tirada. */
function freshEntry(c: Draft<Campaign>, m: Draft<MapDoc>, id: string): CombatEntry {
  const ch = charIn(c, m, id)
  if (isPlayerOwned(ch) && !c.dmRollsInitiative) return { characterId: id, initiative: 0, pending: true }
  return { characterId: id, initiative: d20() + (ch?.initiativeMod ?? 0) }
}

function sortOrderDraft(m: Draft<MapDoc>, c: Draft<Campaign>) {
  sortCombat(m, c.party)
}

export function startCombat() {
  changeMap((m, c) => {
    const known = new Map(m.combat.order.map((e) => [e.characterId, e]))
    m.combat.order = charactersOnMap(m).map((id) => known.get(id) ?? freshEntry(c, m, id))
    m.combat.active = true
    m.combat.round = 1
    m.combat.turnIndex = 0
    sortOrderDraft(m, c)
  })
}

export function rerollInitiative() {
  changeMap((m, c) => {
    m.combat.order = m.combat.order.map((e) => freshEntry(c, m, e.characterId))
    m.combat.turnIndex = 0
    m.combat.round = 1
    sortOrderDraft(m, c)
  })
}

export function setInitiative(characterId: string, value: number) {
  change((d) => {
    const e = d.combat.order.find((x) => x.characterId === characterId)
    if (!e) return
    e.initiative = value
    delete e.pending
  })
}

/** El DM tira por un jugador que todavía no tiró su iniciativa. */
export function rollInitiativeFor(characterId: string) {
  changeMap((m, c) => {
    const e = m.combat.order.find((x) => x.characterId === characterId)
    if (!e) return
    e.initiative = d20() + (charIn(c, m, characterId)?.initiativeMod ?? 0)
    delete e.pending
    sortOrderDraft(m, c)
  })
}

export function setDmRollsInitiative(on: boolean) {
  changeCampaign((c) => {
    if (on) c.dmRollsInitiative = true
    else delete c.dmRollsInitiative
  })
}

export function sortInitiative() {
  changeMap((m, c) => {
    sortOrderDraft(m, c)
  })
}

export function addToCombat(characterId: string) {
  changeMap((m, c) => {
    if (m.combat.order.some((e) => e.characterId === characterId)) return
    m.combat.order.push(freshEntry(c, m, characterId))
    sortOrderDraft(m, c)
  })
}

export function removeFromCombat(characterId: string) {
  change((d) => removeFromOrder(d, new Set([characterId])))
}

/** Avanza o retrocede turnos. Salta NPCs caídos; los PJ caídos siguen (tiradas de muerte). */
export function stepTurn(dir: 1 | -1) {
  changeMap((m, c) => {
    const n = m.combat.order.length
    if (!n) return
    const skip = (i: number) => {
      const ch = charIn(c, m, m.combat.order[i].characterId)
      return !!ch && ch.kind === 'npc' && ch.hp.cur <= 0
    }
    let i = m.combat.turnIndex
    for (let tries = 0; tries < n; tries++) {
      i += dir
      if (i >= n) {
        i = 0
        m.combat.round += 1
      } else if (i < 0) {
        if (m.combat.round <= 1) {
          i = 0
          break
        }
        i = n - 1
        m.combat.round -= 1
      }
      if (!skip(i)) break
    }
    m.combat.turnIndex = i
  })
}

export function endCombat() {
  change((d) => {
    d.combat.active = false
    d.combat.round = 1
    d.combat.turnIndex = 0
  })
}

export function clearCombat() {
  change((d) => {
    d.combat = { active: false, round: 1, turnIndex: 0, order: [] }
  })
}

/* ---------- Selección ---------- */

export function deleteSelection() {
  const { selection } = S()
  if (selection.type === 'items') {
    const movable = selection.ids.filter((id) => {
      for (const l of S().doc.layers) if (l.items?.some((i) => i.id === id)) return !l.locked
      return false
    })
    deleteItems(movable)
  } else if (selection.type === 'wall') {
    removeWalls(selection.layerId, [selection.key])
  }
  S().setUi({ selection: { type: 'none' } })
}
