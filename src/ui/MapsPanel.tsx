import { useState } from 'react'
import type { MapDoc, Zone } from '../model/types'
import {
  addMap,
  addZone,
  deleteMap,
  duplicateMap,
  moveMap,
  partyLocation,
  removeZone,
  renameCampaign,
  renameMapById,
  renameZone,
} from '../state/actions'
import { useMap } from '../state/mapStore'
import { CommitText } from './fields'
import { Icon } from './Icon'

/** Abre el mapa y arma "llevar la party": el próximo clic en el mapa elige dónde entran. */
export function bringPartyTo(mapId: string) {
  const s = useMap.getState()
  if (!s.campaign.party.length) return s.toast('La party está vacía: creá personajes en el panel Party.')
  s.openMap(mapId)
  s.setUi({ mode: 'play', tool: 'partyDrop', viewer: 'dm' })
  s.toast('Hacé clic en el mapa donde entra la party.')
}

export function MapsPanel() {
  const campaign = useMap((s) => s.campaign)
  const mapId = useMap((s) => s.mapId)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [overZone, setOverZone] = useState<string | null>(null)

  const where = partyLocation(campaign)
  const partyCount = new Map<string, number>()
  for (const m of where.values()) if (m) partyCount.set(m, (partyCount.get(m) ?? 0) + 1)

  const groups: { zone: Zone | null; maps: MapDoc[] }[] = campaign.zones.map((z) => ({ zone: z, maps: campaign.maps.filter((m) => m.zoneId === z.id) }))
  const loose = campaign.maps.filter((m) => !m.zoneId || !campaign.zones.some((z) => z.id === m.zoneId))
  if (loose.length) groups.push({ zone: null, maps: loose })

  const dropOn = (zoneId: string | null, beforeId?: string) => {
    if (dragId && dragId !== beforeId) moveMap(dragId, zoneId, beforeId)
    setDragId(null)
    setOverZone(null)
  }

  return (
    <aside className="side left maps-panel">
      <div className="campaign-head">
        <Icon name="grid" size={18} />
        <CommitText className="campaign-name" value={campaign.name} onCommit={(v) => renameCampaign(v.trim() || 'Mi campaña')} aria-label="Nombre de la campaña" />
      </div>
      <div className="side-scroll">
        {groups.map(({ zone, maps }) => {
          const key = zone?.id ?? '@loose'
          const open = !collapsed[key]
          return (
            <section
              key={key}
              className={`zone${overZone === key ? ' drop' : ''}`}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                setOverZone(key)
              }}
              onDragLeave={(e) => e.currentTarget === e.target && setOverZone(null)}
              onDrop={(e) => {
                e.preventDefault()
                dropOn(zone?.id ?? null)
              }}
            >
              <div className="zone-head">
                <button className="icon-btn tiny" onClick={() => setCollapsed({ ...collapsed, [key]: open })} aria-label={open ? 'Cerrar zona' : 'Abrir zona'}>
                  <span className={`chev-sm${open ? ' open' : ''}`}>▸</span>
                </button>
                {zone ? (
                  <CommitText className="zone-name" value={zone.name} onCommit={(v) => renameZone(zone.id, v.trim() || zone.name)} aria-label="Nombre de la zona" />
                ) : (
                  <span className="zone-name loose">Sin zona</span>
                )}
                <span className="zone-count">{maps.length}</span>
                <button className="icon-btn tiny" title="Nuevo mapa en esta zona" onClick={() => addMap(zone?.id ?? null)}>
                  <Icon name="plus" size={14} />
                </button>
                {zone && (
                  <button
                    className="icon-btn tiny danger"
                    title="Borrar zona (los mapas quedan sin zona)"
                    onClick={() => confirm(`¿Borrar la zona "${zone.name}"? Sus mapas pasan a "Sin zona".`) && removeZone(zone.id)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
              {open && (
                <ul className="map-rows">
                  {maps.map((m) => (
                    <MapRow
                      key={m.id}
                      map={m}
                      current={m.id === mapId}
                      table={m.id === campaign.activeMapId}
                      party={partyCount.get(m.id) ?? 0}
                      dragging={dragId === m.id}
                      onDragStart={() => setDragId(m.id)}
                      onDragEnd={() => {
                        setDragId(null)
                        setOverZone(null)
                      }}
                      onDropBefore={() => dropOn(zone?.id ?? null, m.id)}
                    />
                  ))}
                  {!maps.length && <li className="empty">Arrastrá mapas acá o creá uno con +</li>}
                </ul>
              )}
            </section>
          )
        })}
        <button className="add-zone" onClick={() => addZone()}>
          <Icon name="plus" size={15} /> Nueva zona
        </button>
      </div>
    </aside>
  )
}

function MapRow({
  map,
  current,
  table,
  party,
  dragging,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: {
  map: MapDoc
  current: boolean
  table: boolean
  party: number
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropBefore: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  return (
    <li
      className={`map-row${current ? ' current' : ''}${dragging ? ' dragging' : ''}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', map.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropBefore()
      }}
      onClick={() => useMap.getState().openMap(map.id)}
      onDoubleClick={() => setEditing(true)}
    >
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
        <span className="map-title">{map.name}</span>
      )}
      {table && (
        <span className="badge table" title="Mapa de la mesa: es el que ven los jugadores">
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
        <div className="row-pop" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setMenu(false)}>
          <button onClick={() => (setMenu(false), bringPartyTo(map.id))}>
            <Icon name="token" size={14} /> Llevar la party acá
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
              if (confirm(`¿Borrar el mapa "${map.name}"? (Ctrl+Z lo recupera)`)) deleteMap(map.id)
            }}
          >
            <Icon name="trash" size={14} /> Borrar
          </button>
        </div>
      )}
    </li>
  )
}
