import { useEffect, useRef, useState } from 'react'
import { currentScene, Scene, setCurrentScene, type ContextMenuRequest } from '../render/Scene'
import { useMap } from '../state/mapStore'
import { ContextMenu } from './ContextMenu'
import { FloatingPanel } from './FloatingPanel'
import { bringPartyTo } from './MapsPanel'

export function MapCanvas() {
  const host = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [menu, setMenu] = useState<ContextMenuRequest | null>(null)
  const viewer = useMap((s) => s.viewer)
  const role = useMap((s) => s.role)
  const mode = useMap((s) => s.mode)
  const tool = useMap((s) => s.tool)
  const docId = useMap((s) => s.doc.id)
  const tableId = useMap((s) => s.campaign.activeMapId)
  const tableName = useMap((s) => s.campaign.maps.find((m) => m.id === s.campaign.activeMapId)?.name)

  useEffect(() => {
    const scene = new Scene()
    scene.onReady = () => setLoading(false)
    scene.onContextMenu = (req) => useMap.getState().role === 'dm' && setMenu(req)
    setCurrentScene(scene)
    // Gancho para pruebas automáticas en el navegador; no existe en el build de producción.
    if (import.meta.env.DEV) Object.assign(window, { __mappa: { scene, useMap } })
    void scene.init(host.current!)
    return () => {
      setCurrentScene(null)
      scene.destroy()
    }
  }, [])

  // Al abrir otro mapa, encuadrarlo.
  useEffect(() => {
    if (!loading) requestAnimationFrame(() => currentScene?.fitToMap())
  }, [docId, loading])

  const elsewhere = role === 'dm' && tableId && tableId !== docId && tool !== 'partyDrop'

  return (
    <div className="canvas-wrap">
      <div ref={host} className="canvas-host" />
      {loading && <div className="canvas-loading">Cargando assets…</div>}
      {role === 'dm' && <FloatingPanel />}
      <div className="banners">
        {role === 'dm' && viewer === 'player' && (
          <div className="banner player">
            Vista de jugador: así ven el mapa los jugadores. <kbd>P</kbd> para volver.
          </div>
        )}
        {tool === 'partyDrop' && <div className="banner play">Clic donde entra la party. Esc para cancelar.</div>}
        {elsewhere && (
          <div className="banner elsewhere">
            Los jugadores están en <b>{tableName}</b>.
            <button onClick={() => bringPartyTo(docId)}>Llevar la party acá</button>
          </div>
        )}
        {role === 'dm' && viewer === 'dm' && mode === 'play' && !elsewhere && tool !== 'partyDrop' && (
          <div className="banner play">Modo juego: lo inamovible queda fijo.</div>
        )}
      </div>
      {menu && <ContextMenu req={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
