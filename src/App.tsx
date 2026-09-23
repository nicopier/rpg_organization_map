import { useEffect, useState, type ReactNode } from 'react'
import { loadLocalCampaign, startLocalBackup } from './io/autosave'
import { readJsonFile } from './io/serialize'
import { importMapInto, migrateCampaign } from './model/mapDoc'
import { connectDm, replaceCampaign, useNet } from './net/client'
import { useMap } from './state/mapStore'
import { Icon, type IconName } from './ui/Icon'
import { InitiativeTracker } from './ui/InitiativeTracker'
import { InspectorPanel } from './ui/InspectorPanel'
import { LayerPanel } from './ui/LayerPanel'
import { MapCanvas } from './ui/MapCanvas'
import { MapsPanel } from './ui/MapsPanel'
import { Toolbar } from './ui/Toolbar'
import { useShortcuts } from './ui/useShortcuts'

export function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* sin almacenamiento local: la preferencia no se recuerda */
  }
}

export function Section({ id, title, icon, extra, children }: { id: string; title: string; icon: IconName; extra?: ReactNode; children: ReactNode }) {
  const key = `mappaneitor:open:${id}`
  const [open, setOpen] = useState(() => readPref(key, '1') === '1')
  return (
    <section className={`panel${open ? ' open' : ''}`}>
      <button
        className="panel-head"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          writePref(key, open ? '0' : '1')
        }}
      >
        <Icon name={icon} size={16} />
        <span>{title}</span>
        {extra}
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}

function RightPanel() {
  const combat = useMap((s) => s.doc.combat)
  if (combat.active) {
    return (
      <aside className="side right split">
        <div className="side-scroll combat-col">
          <Section id="combat" title="Iniciativa" icon="sword" extra={<span className="badge live">Ronda {combat.round}</span>}>
            <InitiativeTracker />
          </Section>
        </div>
        <div className="side-scroll">
          <Section id="inspector" title="Inspector" icon="select">
            <InspectorPanel />
          </Section>
          <Section id="layers" title="Capas" icon="layers">
            <LayerPanel />
          </Section>
        </div>
      </aside>
    )
  }
  return (
    <aside className="side right">
      <div className="side-scroll">
        <Section id="inspector" title="Inspector" icon="select">
          <InspectorPanel />
        </Section>
        <Section id="combat" title="Iniciativa" icon="sword" extra={combat.active ? <span className="badge live">Ronda {combat.round}</span> : undefined}>
          <InitiativeTracker />
        </Section>
        <Section id="layers" title="Capas" icon="layers">
          <LayerPanel />
        </Section>
      </div>
    </aside>
  )
}

export function Toast() {
  const msg = useMap((s) => s.toastMsg)
  const [shown, setShown] = useState<typeof msg>(null)
  useEffect(() => {
    if (!msg) return
    setShown(msg)
    const t = setTimeout(() => setShown(null), 2800)
    return () => clearTimeout(t)
  }, [msg])
  return shown ? (
    <div className="toast" role="status" key={shown.id}>
      {shown.text}
    </div>
  ) : null
}

/** Soltar un archivo sobre la ventana: una campaña la abre; un mapa suelto lo suma a la campaña. */
function useDropImport() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    const isFile = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!isFile(e)) return
      e.preventDefault()
      setOver(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setOver(false)
    }
    const drop = async (e: DragEvent) => {
      if (!isFile(e)) return
      e.preventDefault()
      setOver(false)
      const f = e.dataTransfer?.files[0]
      if (!f) return
      const s = useMap.getState()
      try {
        const raw = (await readJsonFile(f)) as { version?: number }
        if (raw?.version === 2) {
          const { campaign } = migrateCampaign(raw)
          if (confirm(`¿Reemplazar la campaña actual por "${campaign.name}"?`)) replaceCampaign(campaign)
        } else {
          const { map, party, players } = importMapInto(raw, s.doc.parentId)
          s.changeCampaign((c) => {
            c.maps.push(map)
            for (const p of players) if (!c.players.some((x) => x.name === p.name)) c.players.push(p)
            c.party.push(...party.filter((p) => !c.party.some((x) => x.id === p.id)))
          })
          s.openMap(map.id)
          s.toast(`Mapa "${map.name}" agregado`)
        }
      } catch (err) {
        s.toast((err as Error).message)
      }
    }
    window.addEventListener('dragover', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])
  return over
}

/** App del DM. La campaña vive en el servidor; el navegador guarda un respaldo. */
export function App() {
  const [booted, setBooted] = useState(false)
  const error = useNet((s) => s.error)
  useShortcuts()
  const dropping = useDropImport()

  useEffect(() => {
    let stop: (() => void)[] = []
    let cancelled = false
    loadLocalCampaign().then((local) => {
      if (cancelled) return
      if (local) {
        useMap.getState().loadCampaign(local.campaign)
        if (local.notes[0]) useMap.getState().toast(local.notes[0])
      }
      stop = [startLocalBackup(), connectDm(() => useMap.getState().campaign)]
      setBooted(true)
    })
    return () => {
      cancelled = true
      stop.forEach((f) => f())
    }
  }, [])

  if (error) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h2>{error}</h2>
          <p>
            Si sos jugador, entrá con el link de invitación: <a href="/?play">abrir como jugador</a>.
          </p>
        </div>
      </div>
    )
  }
  if (!booted) return <div className="boot">Cargando…</div>

  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <MapsPanel />
        <MapCanvas />
        <RightPanel />
      </main>
      <Toast />
      {dropping && <div className="drop-overlay">Soltá una campaña para abrirla, o un mapa para sumarlo</div>}
    </div>
  )
}
