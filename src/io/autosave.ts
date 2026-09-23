import { get, set } from 'idb-keyval'
import { migrateCampaign } from '../model/mapDoc'
import type { Campaign } from '../model/types'
import { useMap } from '../state/mapStore'

// La campaña de verdad vive en el servidor (data/campaign.json). Esto es un respaldo en el navegador del DM:
// sirve para arrancar si el servidor está vacío y para no perder nada si se corta la conexión.
const CAMPAIGN = 'mappaneitor:campaign'
// Formato anterior: un mapa suelto por clave.
const LEGACY_CURRENT = 'mappaneitor:current'
const legacyMap = (id: string) => `mappaneitor:map:${id}`

export async function loadLocalCampaign(): Promise<{ campaign: Campaign; notes: string[] } | null> {
  try {
    const saved = await get(CAMPAIGN)
    if (saved) return migrateCampaign(saved)
    const id = (await get(LEGACY_CURRENT)) as string | undefined
    const legacy = id ? await get(legacyMap(id)) : null
    return legacy ? migrateCampaign(legacy) : null
  } catch (e) {
    console.warn('No se pudo leer el respaldo local', e)
    return null
  }
}

/** Copia la campaña al navegador un segundo después de cada cambio, y al esconder la pestaña. */
export function startLocalBackup(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let last = useMap.getState().campaign
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    set(CAMPAIGN, useMap.getState().campaign).catch((e) => console.warn('Respaldo local falló', e))
  }
  const unsub = useMap.subscribe((s) => {
    if (s.campaign === last) return
    last = s.campaign
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 1000)
  })
  const onHide = () => document.visibilityState === 'hidden' && timer && flush()
  document.addEventListener('visibilitychange', onHide)
  return () => {
    unsub()
    document.removeEventListener('visibilitychange', onHide)
    if (timer) flush()
  }
}
