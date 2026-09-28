import { useEffect, useMemo, useRef, useState, type DragEvent, type ClipboardEvent } from 'react'
import { create } from 'zustand'
import { getMonster, MANUAL_PAGE_OFFSET, searchMonsters, type Monster } from '../model/bestiary'
import type { Character } from '../model/types'
import { uploadImage, uploadSheet } from '../net/client'
import {
  addRefImage,
  isRefImageUrl,
  removeRefImage,
  setCharacterMonster,
  setRefImagesOff,
  setRefQuery,
  showToPlayers,
} from '../state/actions'
import { useMap } from '../state/mapStore'
import { Icon } from './Icon'
import { armToken, SIZES } from './NpcPanel'

/* ---------- Ventana de hojas (DM): manual y hojas de personaje, en pestañas ---------- */

type SheetTab = { id: string; title: string } & ({ kind: 'manual'; page: number } | { kind: 'pc'; characterId: string })
type SheetsState = { tabs: SheetTab[]; active: string | null; minimized: boolean }
const useSheets = create<SheetsState>(() => ({ tabs: [], active: null, minimized: false }))

/** Abre la pestaña, o la activa si ya estaba abierta. */
function openTab(tab: SheetTab) {
  useSheets.setState((s) => ({
    tabs: s.tabs.some((t) => t.id === tab.id) ? s.tabs : [...s.tabs, tab],
    active: tab.id,
    minimized: false,
  }))
}

function closeTab(id: string) {
  useSheets.setState((s) => {
    const i = s.tabs.findIndex((t) => t.id === id)
    const tabs = s.tabs.filter((t) => t.id !== id)
    const active = s.active !== id ? s.active : (tabs[Math.min(i, tabs.length - 1)]?.id ?? null)
    return { tabs, active }
  })
}

/** Abre la hoja de la criatura en una pestaña de la ventana de hojas. */
export function openManual(m: Monster) {
  openTab({ id: `mm:${m.id}`, kind: 'manual', page: m.page, title: m.name })
}

/** Abre la hoja en PDF de un personaje en una pestaña de la ventana de hojas. */
export function openCharacterSheet(ch: Character) {
  openTab({ id: `pc:${ch.id}`, kind: 'pc', characterId: ch.id, title: ch.name })
}

/** ¿Está el PDF en la carpeta del proyecto? Se pregunta una vez por sesión. */
let manualCheck: Promise<boolean> | null = null
function manualAvailable(): Promise<boolean> {
  manualCheck ??= fetch('/api/manual?check')
    .then((r) => r.json())
    .then((b: { available?: boolean }) => !!b.available)
    .catch(() => false)
  return manualCheck
}

const pdfUrl = (page: number) => `/api/manual#page=${page + MANUAL_PAGE_OFFSET}&view=FitH`
const stamp = (ts: number) => new Date(ts).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function SheetWindow() {
  const { tabs, active, minimized } = useSheets()
  const party = useMap((s) => s.campaign.party)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [pos, setPos] = useState(() => ({ x: Math.max(16, innerWidth - 640), y: 70 }))
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const hasManual = tabs.some((t) => t.kind === 'manual')

  useEffect(() => {
    if (hasManual && available === null) manualAvailable().then(setAvailable)
  }, [hasManual, available])

  const tab = tabs.find((t) => t.id === active) ?? tabs[0]
  if (!tab) return null
  const charOf = (t: SheetTab) => (t.kind === 'pc' ? party.find((c) => c.id === t.characterId) : undefined)
  const go = (d: number) =>
    useSheets.setState((s) => ({ tabs: s.tabs.map((t) => (t.id === tab.id && t.kind === 'manual' ? { ...t, page: Math.max(1, t.page + d) } : t)) }))
  const activeChar = charOf(tab)
  const external = tab.kind === 'manual' ? pdfUrl(tab.page) : activeChar?.sheet

  return (
    <div className={`manual-window${minimized ? ' minimized' : ''}`} style={{ left: pos.x, top: pos.y }} role="dialog" aria-label={`Hojas: ${tab.title}`}>
      <div
        className="manual-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button, a')) return
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          setPos({
            x: Math.min(innerWidth - 80, Math.max(-400, e.clientX - drag.current.dx)),
            y: Math.min(innerHeight - 40, Math.max(0, e.clientY - drag.current.dy)),
          })
        }}
        onPointerUp={() => {
          drag.current = null
          setDragging(false)
        }}
      >
        <Icon name="book" size={16} />
        <strong>{tab.title}</strong>
        {tab.kind === 'manual' && <span className="manual-page">p. {tab.page}</span>}
        {activeChar?.sheetAt && <span className="manual-page">{stamp(activeChar.sheetAt)}</span>}
        <div className="spacer" />
        {tab.kind === 'manual' && !minimized && (
          <>
            <button className="icon-btn" onClick={() => go(-1)} title="Página anterior" aria-label="Página anterior">
              <Icon name="prev" size={14} />
            </button>
            <button className="icon-btn" onClick={() => go(1)} title="Página siguiente" aria-label="Página siguiente">
              <Icon name="next" size={14} />
            </button>
          </>
        )}
        {external && (
          <a className="icon-btn" href={external} target="_blank" rel="noreferrer" title="Abrir en otra pestaña" aria-label="Abrir en otra pestaña">
            <Icon name="external" size={14} />
          </a>
        )}
        <button
          className="icon-btn"
          onClick={() => useSheets.setState({ minimized: !minimized })}
          title={minimized ? 'Agrandar' : 'Minimizar'}
          aria-label={minimized ? 'Agrandar' : 'Minimizar'}
        >
          <Icon name={minimized ? 'down' : 'up'} size={14} />
        </button>
        <button className="icon-btn" onClick={() => useSheets.setState({ tabs: [], active: null })} title="Cerrar todas" aria-label="Cerrar todas">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="sheet-tabs" role="tablist">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === tab.id}
            className={`sheet-tab${t.id === tab.id ? ' on' : ''}`}
            onClick={() => useSheets.setState({ active: t.id, minimized: false })}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
            title={t.title}
          >
            <Icon name={t.kind === 'manual' ? 'book' : 'token'} size={12} />
            <span>{t.title}</span>
            <button
              className="sheet-tab-x"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              aria-label={`Cerrar ${t.title}`}
            >
              <Icon name="x" size={11} />
            </button>
          </div>
        ))}
      </div>
      <div className="manual-body" hidden={minimized}>
        {/* Todas las pestañas quedan montadas: cambiar de una a otra no recarga el PDF. */}
        {tabs.map((t) => {
          const ch = charOf(t)
          return (
            <div key={t.id} className="sheet-pane" hidden={t.id !== tab.id}>
              {t.kind === 'manual' ? (
                available === false ? (
                  <div className="manual-missing">
                    <p>No encuentro el PDF del Manual de monstruos.</p>
                    <p className="hint">
                      Copialo a la carpeta del proyecto (la de <code>package.json</code>) con "monstruo" en el nombre, o indicá la ruta en la variable{' '}
                      <code>MAPPA_MANUAL</code>.
                    </p>
                    <button
                      className="small-btn"
                      onClick={() => {
                        manualCheck = null
                        setAvailable(null)
                      }}
                    >
                      Volver a buscar
                    </button>
                  </div>
                ) : available ? (
                  // key: cambiar sólo el #page no siempre mueve el visor del navegador; así se recarga (del caché).
                  <iframe key={t.page} src={pdfUrl(t.page)} title={`Manual de monstruos, página ${t.page}`} />
                ) : (
                  <p className="hint manual-missing">Abriendo el manual…</p>
                )
              ) : ch?.sheet ? (
                // key: si el jugador sube una versión nueva, se recarga sola.
                <iframe key={ch.sheet} src={ch.sheet} title={`Hoja de ${ch.name}`} />
              ) : (
                <p className="hint manual-missing">{ch ? `${ch.name} todavía no subió su hoja.` : 'Ese personaje ya no está en la campaña.'}</p>
              )}
            </div>
          )
        })}
        {dragging && <div className="manual-shield" />}
      </div>
    </div>
  )
}

/* ---------- Hoja de personaje en PDF ---------- */

/** Subir o reemplazar la hoja en PDF de un PJ. El jugador la ve en otra pestaña; el DM, en la ventana de hojas. */
export function CharacterPdf({ ch }: { ch: Character }) {
  const isDm = useMap((s) => s.role === 'dm')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const upload = async (f: File | undefined) => {
    if (!f) return
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) return useMap.getState().toast('Tiene que ser un PDF.')
    setBusy(true)
    try {
      await uploadSheet(ch.id, f)
      useMap.getState().toast(ch.sheet ? 'Hoja actualizada.' : 'Hoja subida.')
    } catch (e) {
      useMap.getState().toast((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <section
      className={`pc-pdf${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.nativeEvent.stopPropagation()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        // Que no lo agarre el "soltá una campaña" de toda la ventana.
        e.nativeEvent.stopPropagation()
        setOver(false)
        void upload(e.dataTransfer.files[0])
      }}
    >
      <span className="label">
        <Icon name="book" size={14} /> Hoja de personaje (PDF)
      </span>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      <div className="pc-pdf-row">
        {ch.sheet &&
          (isDm ? (
            <button className="small-btn" onClick={() => openCharacterSheet(ch)}>
              <Icon name="book" size={13} /> Abrir
            </button>
          ) : (
            <a className="small-btn link-btn" href={ch.sheet} target="_blank" rel="noreferrer">
              <Icon name="external" size={13} /> Ver
            </a>
          ))}
        <button className="small-btn" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="upload" size={13} /> {busy ? 'Subiendo…' : ch.sheet ? 'Actualizar' : 'Subir PDF'}
        </button>
      </div>
      <p className="hint">
        {ch.sheet && ch.sheetAt ? `Subida el ${stamp(ch.sheetAt)}. ` : ''}Podés arrastrar el PDF acá.{isDm ? '' : ' Sólo la ven vos y el DM.'}
      </p>
    </section>
  )
}

/* ---------- Buscador de criaturas ---------- */

export function MonsterSearch({ onPick, selected, autoFocus }: { onPick: (m: Monster) => void; selected?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => searchMonsters(q), [q])
  return (
    <div className="bst-search">
      <input
        className="search"
        type="search"
        autoFocus={autoFocus}
        placeholder="Buscar criatura del manual…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && list[0]) onPick(list[0])
        }}
      />
      <ul className="bst-list" role="listbox">
        {list.map((m) => (
          <li key={m.id} role="option" aria-selected={m.id === selected}>
            <button className={m.id === selected ? 'on' : ''} onClick={() => onPick(m)}>
              <span>{m.name}</span>
              <small>p. {m.page}</small>
            </button>
          </li>
        ))}
        {!list.length && <li className="hint">No hay criaturas con ese nombre.</li>}
      </ul>
    </div>
  )
}

/* ---------- Imágenes de referencia ---------- */

const googleImages = (q: string) => `https://www.google.com/search?udm=2&q=${encodeURIComponent(q)}`

/** Saca el link de una imagen arrastrada desde otra pestaña (Google Imágenes, una wiki…). */
function droppedUrl(dt: DataTransfer): string | null {
  const html = dt.getData('text/html')
  const src = html && /<img[^>]+src="([^"]+)"/i.exec(html)?.[1]?.replace(/&amp;/g, '&')
  const uri = dt.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#'))
  return src || uri?.trim() || dt.getData('text/plain').trim() || null
}

async function dataUrlToFile(url: string): Promise<File> {
  const blob = await (await fetch(url)).blob()
  return new File([blob], 'imagen', { type: blob.type })
}

/**
 * Imágenes de una criatura o NPC. Se buscan en Google (en otra pestaña) y se traen pegando el link,
 * arrastrando la imagen o copiándola. El DM elige cuál mostrarles a los jugadores.
 */
export function RefImages({ refKey, name }: { refKey: string; name: string }) {
  const off = useMap((s) => !!s.campaign.refImagesOff)
  const images = useMap((s) => s.campaign.refImages?.[refKey]) ?? []
  const query = useMap((s) => s.campaign.refQueries?.[refKey])
  const showing = useMap((s) => s.campaign.showcase?.url)
  const [q, setQ] = useState(query ?? '')
  const [link, setLink] = useState('')
  const [withName, setWithName] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  useEffect(() => setQ(query ?? ''), [query, refKey])

  if (off) return null
  const defaultQuery = `${name} D&D 5e`

  const add = async (raw: string | File | null) => {
    setError(null)
    if (!raw) return
    try {
      let url: string
      if (typeof raw === 'string' && !raw.startsWith('data:image/')) url = raw.trim()
      else {
        // Imágenes copiadas o miniaturas embebidas: se suben al servidor, que las guarda.
        setBusy(true)
        url = await uploadImage(typeof raw === 'string' ? await dataUrlToFile(raw) : raw)
      }
      if (!addRefImage(refKey, url)) setError('Eso no parece el link de una imagen (tiene que empezar con http).')
      else setLink('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    // Que no lo agarre el "soltá una campaña" de toda la ventana.
    e.nativeEvent.stopPropagation()
    setOver(false)
    const f = e.dataTransfer.files[0]
    void add(f && f.type.startsWith('image/') ? f : droppedUrl(e.dataTransfer))
  }
  const onPaste = (e: ClipboardEvent) => {
    const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'))
    if (!f) return
    e.preventDefault()
    void add(f)
  }

  return (
    <section className="bst-images" onPaste={onPaste}>
      <span className="label">
        <Icon name="image" size={14} /> Imágenes de referencia
      </span>

      <div className="bst-google">
        <input
          value={q}
          placeholder={defaultQuery}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => q.trim() !== (query ?? '') && setRefQuery(refKey, q)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            setRefQuery(refKey, q)
            window.open(googleImages(q.trim() || defaultQuery), '_blank', 'noopener')
          }}
          aria-label="Búsqueda en Google Imágenes"
        />
        <a className="small-btn link-btn" href={googleImages(q.trim() || defaultQuery)} target="_blank" rel="noreferrer" onClick={() => q.trim() !== (query ?? '') && setRefQuery(refKey, q)}>
          <Icon name="external" size={13} /> Google
        </a>
      </div>

      <div
        className={`bst-drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          e.nativeEvent.stopPropagation()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input
          value={link}
          placeholder={busy ? 'Subiendo…' : 'Pegá el link de la imagen o arrastrala acá'}
          disabled={busy}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add(link)}
          aria-label="Link de la imagen"
        />
        <button className="small-btn" disabled={!link.trim() || busy} onClick={() => void add(link)}>
          Agregar
        </button>
      </div>
      {error && <p className="error small">{error}</p>}

      {images.length > 0 ? (
        <>
          <ul className="bst-thumbs">
            {images.map((url) => {
              const live = showing === url
              return (
                <li key={url} className={live ? 'live' : ''}>
                  <a href={url} target="_blank" rel="noreferrer" title="Ver en grande">
                    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </a>
                  <div className="bst-thumb-actions">
                    <button
                      className={live ? 'on' : ''}
                      onClick={() => showToPlayers(live ? null : url, withName ? name : undefined)}
                      title={live ? 'Dejar de mostrarla' : 'Mostrársela a los jugadores'}
                    >
                      <Icon name={live ? 'eyeOff' : 'eye'} size={13} /> {live ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <button className="danger" onClick={() => removeRefImage(refKey, url)} title="Quitar de las referencias" aria-label="Quitar">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <label className="check">
            <input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} />
            Mostrarla con el nombre ({name})
          </label>
        </>
      ) : (
        <p className="hint">Buscá en Google, abrí la imagen y copiá su dirección (o la imagen misma) y pegala acá.</p>
      )}
    </section>
  )
}

/** Interruptor general: sin imágenes de referencia no hay nada que mostrarles a los jugadores. */
function RefImagesToggle() {
  const off = useMap((s) => !!s.campaign.refImagesOff)
  return (
    <label className="check">
      <input type="checkbox" checked={!off} onChange={(e) => setRefImagesOff(!e.target.checked)} />
      Imágenes de referencia para mostrar a los jugadores
    </label>
  )
}

/* ---------- Pestaña Bestiario ---------- */

export function BestiaryPanel() {
  const [picked, setPicked] = useState<string | undefined>()
  const [size, setSize] = useState(1)
  const m = getMonster(picked)
  return (
    <div className="token-panel bestiary">
      <section className="form">
        <RefImagesToggle />
      </section>
      <MonsterSearch selected={picked} onPick={(x) => setPicked(x.id)} />
      {m && (
        <section className="bst-card">
          <div className="bst-card-head">
            <strong>{m.name}</strong>
            <small>Manual de monstruos, p. {m.page}</small>
          </div>
          <div className="bst-card-actions">
            <button onClick={() => openManual(m)}>
              <Icon name="book" size={15} /> Ver hoja
            </button>
            <select value={String(size)} onChange={(e) => setSize(Number(e.target.value))} aria-label="Tamaño del token">
              {SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              className="primary"
              onClick={() =>
                armToken({ name: m.name, kind: 'npc', owner: 'dm', hpMax: 10, ac: 12, speed: 30, initiativeMod: 0, color: '#c0392b', size, monster: m.id })
              }
            >
              <Icon name="token" size={15} /> Colocar
            </button>
          </div>
          <p className="hint">HP, CA y demás se cargan en el Inspector con la hoja a la vista.</p>
          <RefImages refKey={`mm:${m.id}`} name={m.name} />
        </section>
      )}
    </div>
  )
}

/* ---------- En el Inspector de un NPC ---------- */

export function NpcManualSection({ ch }: { ch: Character }) {
  const [changing, setChanging] = useState(false)
  const m = getMonster(ch.monster)
  return (
    <section className="bst-npc">
      <span className="label">
        <Icon name="book" size={14} /> Manual de monstruos
      </span>
      {m && !changing ? (
        <div className="bst-linked">
          <button onClick={() => openManual(m)} title="Ver la hoja en el manual">
            <Icon name="book" size={15} /> {m.name} <small>p. {m.page}</small>
          </button>
          <button className="link" onClick={() => setChanging(true)}>
            Cambiar
          </button>
          <button className="link" onClick={() => setCharacterMonster(ch.id, undefined)}>
            Quitar
          </button>
        </div>
      ) : changing || !m ? (
        <details open={changing} className="bst-link">
          <summary>{changing ? 'Elegí la criatura' : 'Vincular con una criatura del manual'}</summary>
          <MonsterSearch
            autoFocus={changing}
            selected={ch.monster}
            onPick={(x) => {
              setCharacterMonster(ch.id, x.id)
              setChanging(false)
            }}
          />
          {changing && (
            <button className="link" onClick={() => setChanging(false)}>
              Cancelar
            </button>
          )}
        </details>
      ) : null}
      <RefImages refKey={m ? `mm:${m.id}` : `npc:${ch.id}`} name={m?.name ?? ch.name} />
    </section>
  )
}

/* ---------- Lo que se está mostrando ---------- */

/** DM: recordatorio de qué ven los jugadores, para sacarlo cuando haga falta. */
export function ShowcaseBar() {
  const show = useMap((s) => (s.campaign.refImagesOff ? undefined : s.campaign.showcase))
  if (!show) return null
  return (
    <div className="showcase-bar" role="status">
      <img src={show.url} alt="" referrerPolicy="no-referrer" />
      <span>Los jugadores están viendo {show.title ? `“${show.title}”` : 'esta imagen'}</span>
      <button className="small-btn" onClick={() => showToPlayers(null)}>
        Dejar de mostrar
      </button>
    </div>
  )
}

/** Jugador: la imagen que muestra el DM, en un cartel que se puede cerrar y volver a abrir. */
export function ShowcasePopup() {
  const show = useMap((s) => s.campaign.showcase)
  const [closed, setClosed] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  if (!show || !isRefImageUrl(show.url)) return null
  if (closed === show.id)
    return (
      <button className="showcase-reopen" onClick={() => setClosed(null)}>
        <Icon name="image" size={15} /> Imagen del DM
      </button>
    )
  return (
    <div className="modal-backdrop showcase" onPointerDown={(e) => e.target === e.currentTarget && setClosed(show.id)}>
      <figure className="showcase-card">
        <button className="icon-btn showcase-close" onClick={() => setClosed(show.id)} aria-label="Cerrar">
          <Icon name="x" />
        </button>
        {failed === show.url ? (
          <p className="hint">No se pudo cargar la imagen.</p>
        ) : (
          <img src={show.url} alt={show.title ?? 'Imagen del DM'} referrerPolicy="no-referrer" onError={() => setFailed(show.url)} />
        )}
        {show.title && <figcaption>{show.title}</figcaption>}
      </figure>
    </div>
  )
}
