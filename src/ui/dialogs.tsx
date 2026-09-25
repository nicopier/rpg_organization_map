import { useEffect, useRef, useState, type ReactNode } from 'react'
import { exportCampaign, readJsonFile } from '../io/serialize'
import { importMapInto, migrateCampaign } from '../model/mapDoc'
import { readPref, writePref } from '../App'
import { inviteUrl, replaceCampaign, useNet } from '../net/client'
import { addInvites, regenerateInvite, removePlayer, renameMap, updateGrid } from '../state/actions'
import { useMap } from '../state/mapStore'
import { CommitNumber, CommitText, groupWhileDragging, groupWhileFocused } from './fields'
import { Icon } from './Icon'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

const MAX_CELLS = 200

export function GridSettings({ onClose }: { onClose: () => void }) {
  const doc = useMap((s) => s.doc)
  const g = doc.grid
  const gridHex = g.color.slice(0, 7)
  const gridAlpha = g.color.length === 9 ? parseInt(g.color.slice(7, 9), 16) / 255 : 1
  const setGridColor = (hex: string, alpha: number) =>
    updateGrid({ color: `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` })

  return (
    <Modal title="Grilla y mapa" onClose={onClose}>
      <div className="form">
        <label>
          Nombre
          <CommitText value={doc.name} onCommit={(v) => renameMap(v.trim() || 'Mapa sin título')} />
        </label>
        <div className="row">
          <label>
            Columnas
            <CommitNumber value={g.cols} min={1} max={MAX_CELLS} onCommit={(cols) => updateGrid({ cols })} />
          </label>
          <label>
            Filas
            <CommitNumber value={g.rows} min={1} max={MAX_CELLS} onCommit={(rows) => updateGrid({ rows })} />
          </label>
        </div>
        <p className="hint">
          Achicar el mapa no borra nada: lo que quede afuera sigue guardado y vuelve a aparecer si lo agrandás.
        </p>
        <label>
          Tamaño de casilla: {g.cellPx} px
          <input type="range" min={30} max={140} step={5} value={g.cellPx} onChange={(e) => updateGrid({ cellPx: Number(e.target.value) })} {...groupWhileDragging} />
        </label>
        <p className="hint">El pack de assets está dibujado a 70 px por casilla; ese es el tamaño más nítido.</p>
        <div className="row">
          <label>
            Color de grilla
            <input type="color" value={gridHex} onChange={(e) => setGridColor(e.target.value, gridAlpha)} {...groupWhileFocused} />
          </label>
          <label>
            Opacidad: {Math.round(gridAlpha * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={gridAlpha}
              onChange={(e) => setGridColor(gridHex, Number(e.target.value))}
              {...groupWhileDragging}
            />
          </label>
        </div>
        <div className="row">
          <label>
            Fondo
            <input type="color" value={g.bg.slice(0, 7)} onChange={(e) => updateGrid({ bg: e.target.value })} {...groupWhileFocused} />
          </label>
          <label className="check">
            <input type="checkbox" checked={g.show} onChange={(e) => updateGrid({ show: e.target.checked })} />
            Mostrar grilla
          </label>
        </div>
      </div>
    </Modal>
  )
}

/** Link para los jugadores: la IP de esta PC en la red local. */
const BASE_PREF = 'mappaneitor:inviteBase'
const CUSTOM_PREF = 'mappaneitor:inviteCustom'
const CUSTOM = '@custom'
/** La dirección que anunció npm run tunnel; se guarda como marcador para seguirla si cambia. */
const TUNNEL = '@tunnel'

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const [lan, setLan] = useState<string[] | null>(null)
  const [tunnel, setTunnel] = useState<string | null>(null)
  const [base, setBase] = useState(() => readPref(BASE_PREF, ''))
  const [custom, setCustom] = useState(() => readPref(CUSTOM_PREF, ''))
  const [count, setCount] = useState(4)
  const [copied, setCopied] = useState<string | null>(null)
  const players = useMap((s) => s.campaign.players)
  const party = useMap((s) => s.campaign.party)
  const online = useNet((s) => s.online)

  // Se consulta seguido: si abrís o reiniciás el túnel con el diálogo abierto, aparece solo.
  useEffect(() => {
    const load = () =>
      fetch('/api/info')
        .then((r) => r.json())
        .then((b: { lan: string[]; tunnel?: string | null }) => {
          setLan(b.lan.map((u) => new URL(u).origin))
          setTunnel(b.tunnel ?? null)
        })
        .catch(() => setLan((l) => l ?? []))
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [])

  const options = [...(tunnel ? [TUNNEL] : []), ...(lan ?? []), CUSTOM]
  // Con un túnel activo se usa ése, salvo que hayas elegido a propósito una dirección de wifi.
  const pickedLan = !!lan?.includes(base)
  const chosen = tunnel && !pickedLan ? TUNNEL : options.includes(base) ? base : (lan?.[0] ?? CUSTOM)
  const origin = chosen === TUNNEL ? tunnel! : chosen === CUSTOM ? custom.trim() : chosen
  const validOrigin = /^https?:\/\/[^\s/]+/.test(origin)
  const link = (key?: string) => (key && validOrigin ? inviteUrl(origin, key) : '')
  const seatName = (name: string, i: number) => name || `Invitación ${i + 1}`

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
    } catch {
      setCopied(null)
    }
  }
  const allLinks = players.map((p, i) => `${seatName(p.name, i)}: ${link(p.key)}`).join('\n')

  return (
    <Modal title="Invitar jugadores" onClose={onClose} wide>
      <div className="form">
        <p className="hint lead">
          Cada invitación es un link único: quien lo abre entra a esa silla, pone su nombre y arma su personaje. Sin link no entra nadie.
        </p>

        <label>
          Dirección de esta PC
          <select
            value={chosen}
            onChange={(e) => {
              setBase(e.target.value)
              writePref(BASE_PREF, e.target.value)
            }}
          >
            {tunnel && <option value={TUNNEL}>{tunnel} (internet, automática)</option>}
            {(lan ?? []).map((u) => (
              <option key={u} value={u}>
                {u} (misma wifi)
              </option>
            ))}
            <option value={CUSTOM}>Otra dirección de internet…</option>
          </select>
          {chosen === TUNNEL && <small className="hint">La trajo sola <code>npm run tunnel</code>. Si reiniciás el túnel, se actualiza acá.</small>}
          {!tunnel && chosen !== CUSTOM && (
            <small className="hint">
              Para jugar por internet corré <code>npm run tunnel</code> en otra terminal: la dirección aparece acá sola.
            </small>
          )}
        </label>
        {chosen === CUSTOM && (
          <label>
            Dirección pública
            <input
              value={custom}
              placeholder="https://algo.trycloudflare.com"
              onChange={(e) => {
                setCustom(e.target.value)
                writePref(CUSTOM_PREF, e.target.value)
              }}
            />
            <small className="hint">
              Sólo si abriste el túnel a mano. Con <code>npm run tunnel</code> la dirección se carga sola.
            </small>
          </label>
        )}

        <div className="invite-gen">
          <span>Generar</span>
          <input
            type="number"
            min={1}
            max={12}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
            aria-label="Cantidad de invitaciones"
          />
          <button className="primary" onClick={() => addInvites(count)}>
            <Icon name="plus" size={15} /> invitaciones
          </button>
          <div className="spacer" />
          {players.length > 0 && validOrigin && (
            <button onClick={() => copy(allLinks, '@all')}>
              <Icon name="copy" size={15} /> {copied === '@all' ? 'Copiados' : 'Copiar todos'}
            </button>
          )}
        </div>

        {players.length ? (
          <ul className="seats">
            {players.map((p, i) => {
              const on = online.includes(p.id)
              const chars = party.filter((c) => c.owner === p.id).map((c) => c.name)
              const url = link(p.key)
              return (
                <li key={p.id}>
                  <span className={`presence${on ? ' on' : ''}`} title={on ? 'Conectado' : 'Desconectado'} />
                  <div className="seat-who">
                    <strong>{seatName(p.name, i)}</strong>
                    <small>{p.name ? (chars.length ? chars.join(', ') : 'sin personaje todavía') : 'sin usar'}</small>
                  </div>
                  <code title={url}>{url || 'Elegí una dirección'}</code>
                  <button className="small-btn" disabled={!url} onClick={() => copy(url, p.id)}>
                    {copied === p.id ? 'Copiado' : 'Copiar'}
                  </button>
                  <button
                    className="icon-btn"
                    title="Link nuevo: el anterior deja de funcionar"
                    onClick={() => confirm(`¿Link nuevo para ${seatName(p.name, i)}? El anterior deja de funcionar.`) && regenerateInvite(p.id)}
                  >
                    <Icon name="rotate" size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Quitar invitación (sus personajes quedan a cargo del DM)"
                    onClick={() => confirm(`¿Quitar ${seatName(p.name, i)}? Su link deja de funcionar.`) && removePlayer(p.id)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="hint">Todavía no hay invitaciones. Generá una por jugador.</p>
        )}

        {chosen !== CUSTOM && chosen !== TUNNEL && (
          <p className="hint">
            Con la dirección de wifi tienen que estar en tu misma red. Si no carga desde otro dispositivo, puede ser el firewall de Windows: permití el
            acceso a Node.js en redes privadas.
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Guardar la campaña en un archivo, abrir otra, o sumar un mapa suelto del formato anterior. */
export function FileDialog({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const openInput = useRef<HTMLInputElement>(null)
  const mapInput = useRef<HTMLInputElement>(null)

  const openCampaign = async (f: File | undefined) => {
    if (!f) return
    try {
      const { campaign, notes } = migrateCampaign(await readJsonFile(f))
      if (!confirm(`¿Reemplazar la campaña actual por "${campaign.name}"? Guardá antes la actual si la querés conservar.`)) return
      replaceCampaign(campaign)
      useMap.getState().toast(notes[0] ?? `Abierta "${campaign.name}"`)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const importMap = async (f: File | undefined) => {
    if (!f) return
    try {
      const s = useMap.getState()
      const { map, party, players } = importMapInto(await readJsonFile(f), s.doc.parentId)
      s.changeCampaign((c) => {
        c.maps.push(map)
        for (const p of players) if (!c.players.some((x) => x.name === p.name)) c.players.push(p)
        c.party.push(...party.filter((p) => !c.party.some((x) => x.id === p.id)))
      })
      s.openMap(map.id)
      s.toast(`Mapa "${map.name}" agregado a la campaña`)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Modal title="Campaña" onClose={onClose}>
      <div className="form">
        <p className="hint lead">
          La campaña se guarda sola en esta PC (carpeta <code>data/</code>). Descargala para tener una copia o pasarla a otra compu.
        </p>
        <button className="primary" onClick={() => exportCampaign(useMap.getState().campaign)}>
          <Icon name="download" size={16} /> Descargar campaña (.campana.json)
        </button>
        <button onClick={() => openInput.current?.click()}>
          <Icon name="folder" size={16} /> Abrir una campaña guardada
        </button>
        <button onClick={() => mapInput.current?.click()}>
          <Icon name="upload" size={16} /> Sumar un mapa suelto (.mappa.json)
        </button>
        <input ref={openInput} type="file" accept=".json,application/json" hidden onChange={(e) => openCampaign(e.target.files?.[0])} />
        <input ref={mapInput} type="file" accept=".json,application/json" hidden onChange={(e) => importMap(e.target.files?.[0])} />
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  )
}
