import { createContext, useContext, useState, type DragEvent, type ReactNode } from 'react'
import { readPref, writePref } from '../App'
import { childrenOf, countMaps, isInside, type NodeKind } from '../model/tree'
import type { MapDoc, Zone } from '../model/types'
import {
  addMap,
  addZone,
  deleteMap,
  duplicateMap,
  moveNode,
  partyLocation,
  removeZone,
  renameCampaign,
  renameMapById,
  renameZone,
} from '../state/actions'
import { useMap } from '../state/mapStore'
import { CommitText } from './fields'
import { Icon } from './Icon'

/**
 * Abre el mapa y arma "llevar la party": el próximo clic en el mapa elige dónde entran.
 * Con `ids` se lleva sólo a esos personajes; sin nada, a toda la party.
 */
export function bringPartyTo(mapId: string, ids?: string[]) {
  const s = useMap.getState()
  if (!s.campaign.party.length) return s.toast('La party está vacía: creá personajes en el panel Party.')
  if (ids && !ids.length) return s.toast('Elegí al menos un personaje.')
  s.openMap(mapId)
  s.setUi({ mode: 'play', tool: 'partyDrop', viewer: 'dm', partyPick: ids ?? null })
  const n = ids?.length ?? s.campaign.party.length
  s.toast(n === 1 && ids ? 'Hacé clic en el mapa donde entra.' : 'Hacé clic en el mapa donde entran.')
}

type Drag = { kind: NodeKind; id: string }
type Over = { id: string; pos: 'before' | 'inside' } | { id: '@root'; pos: 'inside' }

type TreeCtx = {
  collapsed: Record<string, boolean>
  toggle: (id: string, open?: boolean) => void
  drag: Drag | null
  setDrag: (d: Drag | null) => void
  over: Over | null
  setOver: (o: Over | null) => void
  partyCount: Map<string, number>
}
const Tree = createContext<TreeCtx>(null!)

const COLLAPSED_PREF = 'mappaneitor:treeCollapsed'
const FOLDED_PREF = 'mappaneitor:mapsFolded'

export function MapsPanel() {
  const [folded, setFolded] = useState(() => readPref(FOLDED_PREF, '0') === '1')
  const fold = (v: boolean) => {
    setFolded(v)
    writePref(FOLDED_PREF, v ? '1' : '0')
  }
  return folded ? <FoldedMaps onOpen={() => fold(false)} /> : <MapsTree onFold={() => fold(true)} />
}

/** Barra finita: sólo lo justo para saber dónde estás y volver a abrir la lista. */
function FoldedMaps({ onOpen }: { onOpen: () => void }) {
  const mapName = useMap((s) => s.doc.name)
  return (
    <aside className="side left maps-panel folded">
      <button className="icon-btn" onClick={onOpen} title="Mostrar la lista de mapas" aria-label="Mostrar la lista de mapas">
        <Icon name="next" size={16} />
      </button>
      <button className="folded-name" onClick={onOpen} title={`Mapa abierto: ${mapName}`}>
        {mapName}
      </button>
    </aside>
  )
}

function MapsTree({ onFold }: { onFold: () => void }) {
  const campaign = useMap((s) => s.campaign)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(readPref(COLLAPSED_PREF, '{}'))
    } catch {
      return {}
    }
  })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [over, setOver] = useState<Over | null>(null)

  const toggle = (id: string, open?: boolean) => {
    const next = { ...collapsed, [id]: open === undefined ? !collapsed[id] : !open }
    setCollapsed(next)
    writePref(COLLAPSED_PREF, JSON.stringify(next))
  }

  const partyCount = new Map<string, number>()
  for (const m of partyLocation(campaign).values()) if (m) partyCount.set(m, (partyCount.get(m) ?? 0) + 1)

  return (
    <aside className="side left maps-panel">
      <div className="campaign-head">
        <Icon name="grid" size={18} />
        <CommitText className="campaign-name" value={campaign.name} onCommit={(v) => renameCampaign(v.trim() || 'Mi campaña')} aria-label="Nombre de la campaña" />
        <button className="icon-btn tiny" onClick={onFold} title="Esconder la lista de mapas" aria-label="Esconder la lista de mapas">
          <Icon name="prev" size={14} />
        </button>
      </div>
      <Tree.Provider value={{ collapsed, toggle, drag, setDrag, over, setOver, partyCount }}>
        <div
          className={`side-scroll tree${over?.id === '@root' ? ' drop-root' : ''}`}
          onDragOver={(e) => {
            if (!drag) return
            e.preventDefault()
            setOver({ id: '@root', pos: 'inside' })
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (drag) moveNode(drag.kind, drag.id, null)
            setDrag(null)
            setOver(null)
          }}
        >
          <Branch parentId={null} depth={0} />
          <div className="tree-add">
            <button onClick={() => addZone(null)}>
              <Icon name="folder" size={15} /> Carpeta
            </button>
            <button onClick={() => addMap(null)}>
              <Icon name="plus" size={15} /> Mapa
            </button>
          </div>
          {drag && <p className="hint tree-hint">Soltá arriba de una fila para ponerlo antes, en el medio para meterlo adentro, o acá para dejarlo en la raíz.</p>}
        </div>
      </Tree.Provider>
    </aside>
  )
}

function Branch({ parentId, depth }: { parentId: string | null; depth: number }) {
  const campaign = useMap((s) => s.campaign)
  const { zones, maps } = childrenOf(campaign, parentId)
  if (!zones.length && !maps.length) return null
  return (
    <ul className="tree-list">
      {zones.map((z) => (
        <ZoneNode key={z.id} zone={z} depth={depth} />
      ))}
      {maps.map((m) => (
        <MapNode key={m.id} map={m} depth={depth} />
      ))}
    </ul>
  )
}

/** Arrastrar y soltar compartido por carpetas y mapas: arriba = antes, resto = adentro. */
function useDnd(kind: NodeKind, id: string, parentId: string | null) {
  const t = useContext(Tree)
  const campaign = useMap((s) => s.campaign)
  const invalid = !!t.drag && (t.drag.id === id || isInside(campaign, id, t.drag.id))
  const overPos = t.over && t.over.id === id ? t.over.pos : null
  return {
    className: `${t.drag?.id === id ? ' dragging' : ''}${overPos === 'before' ? ' drop-before' : ''}${overPos === 'inside' ? ' drop-inside' : ''}`,
    props: {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        t.setDrag({ kind, id })
      },
      onDragEnd: () => {
        t.setDrag(null)
        t.setOver(null)
      },
      onDragOver: (e: DragEvent) => {
        if (!t.drag) return
        e.stopPropagation()
        if (invalid) return
        e.preventDefault()
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const pos = e.clientY - r.top < r.height * 0.3 ? 'before' : 'inside'
        if (t.over?.id !== id || t.over.pos !== pos) t.setOver({ id, pos })
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const d = t.drag
        const pos = t.over?.id === id ? t.over.pos : 'inside'
        t.setDrag(null)
        t.setOver(null)
        if (!d || invalid) return
        if (pos === 'before') moveNode(d.kind, d.id, parentId, d.kind === kind ? id : undefined)
        else {
          moveNode(d.kind, d.id, id)
          t.toggle(id, true)
        }
      },
    },
  }
}

function RowPop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="row-pop" onClick={(e) => e.stopPropagation()} onMouseLeave={onClose}>
      {children}
    </div>
  )
}

function ZoneNode({ zone, depth }: { zone: Zone; depth: number }) {
  const t = useContext(Tree)
  const campaign = useMap((s) => s.campaign)
  const [menu, setMenu] = useState(false)
  const open = !t.collapsed[zone.id]
  const dnd = useDnd('zone', zone.id, zone.parentId ?? null)
  const count = countMaps(campaign, zone.id)
  return (
    <li>
      <div className={`tree-row folder${dnd.className}`} style={{ paddingLeft: 4 + depth * 12 }} {...dnd.props}>
        <button className="icon-btn tiny" onClick={() => t.toggle(zone.id)} aria-label={open ? 'Cerrar carpeta' : 'Abrir carpeta'}>
          <span className={`chev-sm${open ? ' open' : ''}`}>▸</span>
        </button>
        <Icon name="folder" size={14} />
        <CommitText className="zone-name" value={zone.name} onCommit={(v) => renameZone(zone.id, v.trim() || zone.name)} aria-label="Nombre de la carpeta" />
        <span className="zone-count">{count}</span>
        <button
          className="icon-btn tiny"
          title="Nuevo mapa en esta carpeta"
          onClick={() => {
            addMap(zone.id)
            t.toggle(zone.id, true)
          }}
        >
          <Icon name="plus" size={14} />
        </button>
        <button className="icon-btn tiny row-menu" aria-label="Opciones de la carpeta" onClick={() => setMenu(!menu)}>
          ⋯
        </button>
        {menu && (
          <RowPop onClose={() => setMenu(false)}>
            <button
              onClick={() => {
                setMenu(false)
                addZone(zone.id)
                t.toggle(zone.id, true)
              }}
            >
              <Icon name="folder" size={14} /> Nueva carpeta adentro
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenu(false)
                if (confirm(`¿Borrar la carpeta "${zone.name}"? Lo que tiene adentro sube un nivel.`)) removeZone(zone.id)
              }}
            >
              <Icon name="trash" size={14} /> Borrar carpeta
            </button>
          </RowPop>
        )}
      </div>
      {open && (count > 0 || childrenOf(campaign, zone.id).zones.length > 0 ? (
        <Branch parentId={zone.id} depth={depth + 1} />
      ) : (
        <p className="tree-empty" style={{ paddingLeft: 30 + depth * 12 }}>
          Vacía: arrastrá mapas acá o creá uno con +
        </p>
      ))}
    </li>
  )
}

function MapNode({ map, depth }: { map: MapDoc; depth: number }) {
  const t = useContext(Tree)
  const campaign = useMap((s) => s.campaign)
  const current = useMap((s) => s.mapId === map.id)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const dnd = useDnd('map', map.id, map.parentId)
  const kids = childrenOf(campaign, map.id)
  const hasKids = kids.zones.length + kids.maps.length > 0
  const open = !t.collapsed[map.id]
  const party = t.partyCount.get(map.id) ?? 0
  const table = map.id === campaign.activeMapId

  return (
    <li>
      <div
        className={`tree-row map-row${current ? ' current' : ''}${dnd.className}`}
        style={{ paddingLeft: 4 + depth * 12 }}
        {...dnd.props}
        draggable={!editing}
        onClick={() => useMap.getState().openMap(map.id)}
        onDoubleClick={() => setEditing(true)}
      >
        {hasKids ? (
          <button
            className="icon-btn tiny"
            onClick={(e) => {
              e.stopPropagation()
              t.toggle(map.id)
            }}
            aria-label={open ? 'Ocultar submapas' : 'Mostrar submapas'}
          >
            <span className={`chev-sm${open ? ' open' : ''}`}>▸</span>
          </button>
        ) : (
          <span className="tree-spacer" />
        )}
        {editing ? (
          <CommitText
            autoFocus
            className="map-name-edit"
            value={map.name}
            onCommit={(v) => renameMapById(map.id, v.trim() || map.name)}
            onBlur={() => setEditing(false)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="map-title" title={map.name}>{map.name}</span>
        )}
        {table && (
          <span className="badge table" title="Mapa de la mesa: el último donde llevaste gente. Cada jugador ve el mapa donde está su personaje.">
            Mesa
          </span>
        )}
        {party > 0 && (
          <span className="badge party" title={`${party} de la party acá`}>
            <Icon name="token" size={11} /> {party}
          </span>
        )}
        <button
          className="icon-btn tiny row-menu"
          aria-label="Opciones del mapa"
          onClick={(e) => {
            e.stopPropagation()
            setMenu(!menu)
          }}
        >
          ⋯
        </button>
        {menu && (
          <RowPop onClose={() => setMenu(false)}>
            <button onClick={() => (setMenu(false), bringPartyTo(map.id))}>
              <Icon name="token" size={14} /> Llevar la party acá
            </button>
            <button
              onClick={() => {
                setMenu(false)
                addMap(map.id, 'Submapa nuevo')
                t.toggle(map.id, true)
              }}
            >
              <Icon name="plus" size={14} /> Nuevo submapa
            </button>
            <button onClick={() => (setMenu(false), setEditing(true))}>
              <Icon name="file" size={14} /> Renombrar
            </button>
            <button
              onClick={() => {
                setMenu(false)
                const id = duplicateMap(map.id)
                if (id) useMap.getState().openMap(id)
              }}
            >
              <Icon name="copy" size={14} /> Duplicar
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenu(false)
                const note = hasKids ? ' Sus submapas suben un nivel.' : ''
                if (confirm(`¿Borrar el mapa "${map.name}"?${note} (Ctrl+Z lo recupera)`)) deleteMap(map.id)
              }}
            >
              <Icon name="trash" size={14} /> Borrar
            </button>
          </RowPop>
        )}
      </div>
      {hasKids && open && <Branch parentId={map.id} depth={depth + 1} />}
    </li>
  )
}
