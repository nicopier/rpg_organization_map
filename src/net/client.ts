import { create } from 'zustand'
import type { Campaign } from '../model/types'
import { logActions } from '../state/logStore'
import { onLocalPatches, useMap } from '../state/mapStore'
import { net } from './bridge'
import type { ClientMsg, ServerMsg } from './protocol'

export type NetState = {
  status: 'connecting' | 'online' | 'offline'
  /** Ya llegó la primera respuesta del servidor (bienvenida). */
  ready: boolean
  /** Ids de jugadores conectados ahora. */
  online: string[]
  error: string | null
  /** DM: dirección pública del túnel activo (npm run tunnel), o null. */
  tunnel: string | null
  /** La última dirección de túnel con la que el DM copió o mandó los links. */
  sharedTunnel: string | null
}

const SHARED_TUNNEL = 'mappaneitor:sharedTunnel'
const readShared = () => {
  try {
    return localStorage.getItem(SHARED_TUNNEL)
  } catch {
    return null
  }
}

export const useNet = create<NetState>(() => ({ status: 'connecting', ready: false, online: [], error: null, tunnel: null, sharedTunnel: readShared() }))

/** El DM ya pasó los links con esta dirección: se apaga el aviso de "links nuevos". */
export function markLinksShared(url: string) {
  useNet.setState({ sharedTunnel: url })
  try {
    localStorage.setItem(SHARED_TUNNEL, url)
  } catch {
    // Sin almacenamiento: el aviso vuelve a aparecer al recargar, nada más.
  }
}

const INVITE_KEY = 'mappaneitor:invite'

/**
 * La clave de la invitación: la del link (?play&k=…) si viene, si no la que quedó guardada
 * de la última vez. Así el jugador puede volver aunque abra la página sin el link completo.
 */
export function inviteKey(): string | null {
  const fromUrl = new URLSearchParams(location.search).get('k')
  try {
    if (fromUrl) localStorage.setItem(INVITE_KEY, fromUrl)
    return fromUrl ?? localStorage.getItem(INVITE_KEY)
  } catch {
    return fromUrl
  }
}

/** Link de invitación de una silla, sobre la dirección que elija el DM (red local o túnel). */
export function inviteUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, '')}/?play&k=${key}`
}

/** Conexión con reconexión automática. `onMessage` recibe todo lo que manda el servidor. */
function open(hello: () => ClientMsg, onMessage: (m: ServerMsg) => void, onOpen?: () => void): () => void {
  let ws: WebSocket | null = null
  let retry = 0
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    useNet.setState({ status: 'connecting' })
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
    ws.onopen = () => {
      retry = 0
      useNet.setState({ status: 'online', error: null })
      net.setSender((msg) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)))
      ws!.send(JSON.stringify(hello()))
      onOpen?.()
    }
    ws.onmessage = (ev) => {
      let msg: ServerMsg
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if (msg.t === 'presence') useNet.setState({ online: msg.online })
      else if (msg.t === 'error') useNet.setState({ error: msg.message, ready: false })
      else if (msg.t === 'log') logActions.set(msg.entries)
      else if (msg.t === 'logEntry') logActions.add(msg.entry)
      else if (msg.t === 'rollError') logActions.error(msg.message)
      else if (msg.t === 'rollCooldown') logActions.cooldown(msg.ms)
      else if (msg.t === 'tunnel') useNet.setState({ tunnel: msg.url })
      else onMessage(msg)
    }
    ws.onclose = () => {
      net.setSender(null)
      if (stopped) return
      useNet.setState({ status: 'offline' })
      timer = setTimeout(connect, Math.min(5000, 500 * 2 ** retry++))
    }
  }
  connect()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    net.setSender(null)
    ws?.close()
  }
}

/**
 * DM: el servidor guarda la campaña. Si todavía no tiene ninguna, se le manda la local.
 * Si el DM editó mientras estaba desconectado, al volver manda la suya (su trabajo manda).
 */
export function connectDm(localCampaign: () => Campaign): () => void {
  let dirtyOffline = false
  const unsub = onLocalPatches((patches) => {
    if (useNet.getState().status === 'online') net.send({ t: 'patches', patches })
    else dirtyOffline = true
  })
  const stop = open(
    () => ({ t: 'hello', role: 'dm' }),
    (msg) => {
      if (msg.t === 'welcome' && msg.role === 'dm') {
        useNet.setState({ ready: true, error: null })
        if (msg.campaign && !dirtyOffline) useMap.getState().loadCampaign(msg.campaign, useMap.getState().mapId)
        else {
          net.send({ t: 'init', campaign: dirtyOffline ? useMap.getState().campaign : localCampaign() })
          if (!msg.campaign && !dirtyOffline) useMap.getState().loadCampaign(localCampaign())
        }
        dirtyOffline = false
      } else if (msg.t === 'patches') {
        useMap.getState().applyRemote(msg.patches)
      }
    },
  )
  return () => {
    unsub()
    stop()
  }
}

/** Reemplaza la campaña del DM (abrir un archivo) y se la manda al servidor. */
export function replaceCampaign(c: Campaign) {
  useMap.getState().loadCampaign(c)
  net.send({ t: 'init', campaign: useMap.getState().campaign })
}

/** Jugador: sólo recibe su vista filtrada; sus jugadas viajan como mensajes que el servidor valida. */
export function connectPlayer(): () => void {
  useMap.setState({ role: 'player', viewer: 'player', mode: 'play', tool: 'select', me: null })
  return open(
    () => ({ t: 'hello', role: 'player', key: inviteKey() }),
    (msg) => {
      if (msg.t === 'welcome' && msg.role === 'player') {
        useNet.setState({ ready: true, error: null })
        useMap.setState({ me: msg.playerId })
        useMap.getState().syncCampaign(msg.view)
      } else if (msg.t === 'view') {
        useMap.getState().syncCampaign(msg.view)
      }
    },
  )
}

/** DM: sube un zip exportado y el servidor reemplaza la campaña; la nueva llega sola por el WebSocket. */
export async function importCampaignZip(file: File): Promise<string> {
  const res = await fetch('/api/import', { method: 'POST', body: file })
  const body = (await res.json().catch(() => ({}))) as { name?: string; error?: string }
  if (!res.ok) throw new Error(body.error ?? 'No se pudo importar la campaña.')
  return body.name ?? 'la campaña'
}

export async function uploadImage(file: File): Promise<string> {
  const key = useMap.getState().role === 'player' ? inviteKey() : null
  const res = await fetch('/api/upload', { method: 'POST', body: file, headers: key ? { 'x-key': key } : {} })
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok || !body.url) throw new Error(body.error ?? 'No se pudo subir la imagen.')
  return body.url
}

/** Sube (o reemplaza) la hoja de personaje en PDF. El servidor la guarda y actualiza la ficha. */
export async function uploadSheet(characterId: string, file: File): Promise<string> {
  const key = useMap.getState().role === 'player' ? inviteKey() : null
  const res = await fetch('/api/sheet', { method: 'POST', body: file, headers: { 'x-character': characterId, ...(key ? { 'x-key': key } : {}) } })
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok || !body.url) throw new Error(body.error ?? 'No se pudo subir la hoja.')
  return body.url
}
