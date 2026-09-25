// Servidor de la partida: guarda la campaña, sincroniza al DM y reparte a cada jugador sólo lo que puede ver.
// Se monta sobre cualquier servidor HTTP: el de Vite en desarrollo (plugin) o el de server/main.ts.
import { randomBytes, randomInt } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type { Duplex } from 'node:stream'
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'
import { WebSocket, WebSocketServer } from 'ws'
import { layerOfKind, migrateCampaign } from '../src/model/mapDoc'
import { projectForPlayer } from '../src/model/projection'
import { TOKEN_ASSET, type Campaign, type Character } from '../src/model/types'
import { DiceError, evaluate, format, parse } from '../src/dice/notation'
import type { ClientMsg, LogEntry, ServerMsg } from '../src/net/protocol'

enablePatches()

type Client = { ws: WebSocket; role: 'dm' | 'player' | null; playerId: string | null; key: string | null; local: boolean; hits: number[] }

const LOG_MAX = 500
const DM_COLOR = '#ffcc33'

const MAX_UPLOAD = 5 * 1024 * 1024
const IMAGE_TYPES: [string, (b: Buffer) => boolean][] = [
  ['png', (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))],
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['gif', (b) => b.subarray(0, 3).toString() === 'GIF'],
  ['webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'],
]
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

const isLoopback = (addr?: string) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const TUNNEL_URL = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/

/**
 * ¿El pedido viene de un navegador en esta misma PC? No alcanza con la IP: un túnel
 * (cloudflared, ngrok) entrega todo desde 127.0.0.1, pero agrega cabeceras de reenvío.
 * Y el Origin frena a una página de afuera que intente hablarle a localhost desde tu navegador.
 */
function isLocalRequest(req: IncomingMessage): boolean {
  if (!isLoopback(req.socket.remoteAddress)) return false
  const h = req.headers
  if (h['x-forwarded-for'] || h['cf-connecting-ip'] || h['forwarded'] || h['x-real-ip']) return false
  const origin = h.origin
  if (!origin) return true
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname)
  } catch {
    return false
  }
}
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback
const str = (v: unknown, max: number, fallback: string) => (typeof v === 'string' ? v.slice(0, max) : fallback)

export function lanUrls(port: string | number): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}/?play`)
  }
  return out
}

export function createGameServer(dataDir: string) {
  const uploadsDir = join(dataDir, 'uploads')
  const file = join(dataDir, 'campaign.json')
  const logFile = join(dataDir, 'log.json')
  mkdirSync(uploadsDir, { recursive: true })

  let campaign: Campaign | null = null
  if (existsSync(file)) {
    try {
      campaign = migrateCampaign(JSON.parse(readFileSync(file, 'utf8'))).campaign
    } catch (e) {
      console.error('[mappaneitor] No se pudo leer la campaña guardada:', e)
    }
  }

  /** Tiradas y chat. Va aparte de la campaña: no entra en los parches ni en el deshacer del DM. */
  let log: LogEntry[] = []
  if (existsSync(logFile)) {
    try {
      const raw = JSON.parse(readFileSync(logFile, 'utf8'))
      if (Array.isArray(raw)) log = raw.slice(-LOG_MAX)
    } catch (e) {
      console.error('[mappaneitor] No se pudo leer el log de tiradas:', e)
    }
  }

  const clients = new Set<Client>()
  /** Dirección pública del túnel activo. Vive en memoria: cambia en cada sesión. */
  let tunnelUrl: string | null = null
  const wss = new WebSocketServer({ noServer: true, maxPayload: 20 * 1024 * 1024 })

  /* ---------- Persistencia ---------- */

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!campaign) return
      // Un error al guardar nunca puede tirar abajo el servidor (antes, borrar data/ con el
      // servidor prendido lo mataba). Se recrea la carpeta y, si igual falla, se avisa y se sigue.
      try {
        mkdirSync(dataDir, { recursive: true })
        // Escritura atómica: si se corta la luz a mitad, queda la versión anterior entera.
        writeFileSync(file + '.tmp', JSON.stringify(campaign))
        renameSync(file + '.tmp', file)
      } catch (e) {
        console.error('[mappaneitor] No se pudo guardar la campaña:', e)
      }
    }, 400)
  }
  // La migración puede haber completado datos (p. ej. claves de invitación): se guardan ya,
  // para que un reinicio no genere claves nuevas y deje sin efecto los links que ya se mandaron.
  if (campaign) save()

  let logTimer: ReturnType<typeof setTimeout> | null = null
  const saveLog = () => {
    if (logTimer) clearTimeout(logTimer)
    logTimer = setTimeout(() => {
      try {
        mkdirSync(dataDir, { recursive: true })
        writeFileSync(logFile + '.tmp', JSON.stringify(log))
        renameSync(logFile + '.tmp', logFile)
      } catch (e) {
        console.error('[mappaneitor] No se pudo guardar el log de tiradas:', e)
      }
    }, 400)
  }

  /* ---------- Envíos ---------- */

  const send = (c: Client, msg: ServerMsg) => {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg))
  }
  const dms = () => [...clients].filter((c) => c.role === 'dm')
  const players = () => [...clients].filter((c) => c.role === 'player')
  const online = () => [...new Set(players().map((c) => c.playerId).filter(Boolean) as string[])]

  let viewTimer: ReturnType<typeof setTimeout> | null = null
  const pushViews = () => {
    if (viewTimer) return
    viewTimer = setTimeout(() => {
      viewTimer = null
      if (!campaign) return
      for (const p of players()) send(p, { t: 'view', view: projectForPlayer(campaign, p.playerId) })
    }, 30)
  }
  const pushPresence = () => {
    const msg: ServerMsg = { t: 'presence', online: online() }
    for (const c of clients) if (c.role) send(c, msg)
  }

  /** Cambio originado en el servidor (jugadas de jugadores): se aplica, se guarda y se avisa a todos. */
  const mutate = (fn: (d: Draft<Campaign>) => void) => {
    if (!campaign) return
    const [next, patches] = produceWithPatches(campaign, fn)
    if (!patches.length) return
    campaign = next
    for (const d of dms()) send(d, { t: 'patches', patches })
    pushViews()
    save()
  }

  const playerByKey = (key: unknown) =>
    typeof key === 'string' && key.length >= 16 ? campaign?.players.find((p) => p.key === key) : undefined

  /** Si el DM quitó la silla o le cambió el link, quien estaba adentro queda afuera. */
  const dropRevoked = () => {
    for (const p of players()) {
      if (!p.playerId) continue
      if (campaign?.players.some((x) => x.id === p.playerId && x.key === p.key)) continue
      send(p, { t: 'error', message: 'Tu invitación ya no es válida. Pedile un link nuevo al DM.' })
      p.playerId = null
      p.key = null
      p.ws.close()
    }
  }

  /* ---------- Log: tiradas y chat ---------- */

  /** Lo que un cliente puede ver de una entrada: entera, sin resultado (secreta ajena) o nada. */
  const visibleTo = (e: LogEntry, c: Client): LogEntry | null => {
    if (c.role === 'dm') return e
    const me = c.playerId
    if (c.role !== 'player' || !me) return null
    if (e.vis === 'public' || e.from === me) return e
    if (e.vis === 'whisper') return e.to === me ? e : null
    // Secreta de otro: se ve que alguien tiró, no qué ni qué salió.
    return { id: e.id, ts: e.ts, from: e.from, name: e.name, color: e.color, kind: e.kind, vis: e.vis, hidden: true }
  }

  const sendLog = (c: Client) => send(c, { t: 'log', entries: log.map((e) => visibleTo(e, c)).filter((e): e is LogEntry => !!e) })

  const addEntry = (e: LogEntry) => {
    log.push(e)
    if (log.length > LOG_MAX) log = log.slice(-LOG_MAX)
    for (const c of clients) {
      const v = visibleTo(e, c)
      if (v) send(c, { t: 'logEntry', entry: v })
    }
    saveLog()
  }

  /** Quién firma: el DM, o el personaje del jugador (su nombre si todavía no tiene). */
  const author = (c: Client): Pick<LogEntry, 'from' | 'name' | 'color'> => {
    if (c.role === 'dm') return { from: 'dm', name: 'DM', color: DM_COLOR }
    const p = campaign?.players.find((x) => x.id === c.playerId)
    const ch = campaign?.party.find((x) => x.owner === c.playerId)
    return { from: c.playerId!, name: ch?.name || p?.name || 'Jugador', color: ch?.color ?? p?.color ?? '#888888' }
  }

  /** Freno anti-spam: hasta 8 tiradas o mensajes cada 2 segundos por conexión. */
  const flooding = (c: Client) => {
    const now = Date.now()
    c.hits = c.hits.filter((t) => now - t < 2000)
    if (c.hits.length >= 8) return true
    c.hits.push(now)
    return false
  }

  const handleLog = (c: Client, msg: ClientMsg) => {
    if (msg.t === 'clearLog') {
      if (c.role !== 'dm') return
      log = []
      for (const x of clients) if (x.role) send(x, { t: 'log', entries: [] })
      return saveLog()
    }
    if (msg.t !== 'roll' && msg.t !== 'chat') return
    if (flooding(c)) return send(c, { t: 'rollError', message: 'Más despacio: esperá un segundo.' })
    const base = { id: randomBytes(6).toString('hex'), ts: Date.now(), ...author(c) }

    if (msg.t === 'roll') {
      try {
        const terms = parse(str(msg.expr, 200, ''))
        const label = str(msg.label, 60, '').trim()
        addEntry({
          ...base,
          kind: 'roll',
          vis: msg.secret ? 'secret' : 'public',
          expr: format(terms),
          ...(label ? { label } : {}),
          result: evaluate(terms, (sides) => randomInt(1, sides + 1)),
        })
      } catch (e) {
        if (!(e instanceof DiceError)) throw e
        send(c, { t: 'rollError', message: e.message })
      }
      return
    }

    const text = str(msg.text, 500, '').trim()
    if (!text) return
    if (msg.to === undefined || msg.to === null || msg.to === '') return addEntry({ ...base, kind: 'chat', vis: 'public', text })
    // Susurro: al DM o a un jugador que exista, y nunca a uno mismo.
    const to = str(msg.to, 40, '')
    const target = to === 'dm' ? 'DM' : campaign?.players.find((p) => p.id === to)?.name
    if (!target || to === base.from) return
    const toChar = to === 'dm' ? undefined : campaign?.party.find((x) => x.owner === to)?.name
    addEntry({ ...base, kind: 'chat', vis: 'whisper', to, toName: toChar || target, text })
  }

  const ownChar = (c: Client, id: string): Character | undefined =>
    campaign?.party.find((p) => p.id === id && c.playerId && p.owner === c.playerId)

  /* ---------- Mensajes ---------- */

  const handle = (c: Client, msg: ClientMsg) => {
    if (msg.t === 'hello') {
      if (msg.role === 'dm') {
        // El DM sólo desde la PC donde corre el servidor: nadie en la wifi puede tomar el control.
        if (!c.local) return send(c, { t: 'error', message: 'La vista del DM sólo se abre desde la PC del servidor.' })
        c.role = 'dm'
        send(c, { t: 'welcome', role: 'dm', campaign })
        sendLog(c)
        return send(c, { t: 'presence', online: online() })
      }
      c.role = 'player'
      if (!campaign) return send(c, { t: 'error', message: 'El DM todavía no abrió la campaña.' })
      // Sólo se entra con un link de invitación válido.
      const seat = playerByKey(msg.key)
      if (!seat) return send(c, { t: 'error', message: 'Para entrar necesitás el link de invitación que te pasa el DM.' })
      c.playerId = seat.id
      c.key = seat.key!
      send(c, { t: 'welcome', role: 'player', playerId: c.playerId, view: projectForPlayer(campaign, c.playerId) })
      sendLog(c)
      return pushPresence()
    }

    if (msg.t === 'roll' || msg.t === 'chat' || msg.t === 'clearLog') {
      if (c.role === 'dm' || (c.role === 'player' && c.playerId)) handleLog(c, msg)
      return
    }

    if (c.role === 'dm') {
      if (msg.t === 'init') {
        campaign = migrateCampaign(msg.campaign).campaign
        save()
        for (const d of dms()) if (d !== c) send(d, { t: 'welcome', role: 'dm', campaign })
        dropRevoked()
        pushViews()
      } else if (msg.t === 'patches' && campaign) {
        try {
          campaign = applyPatches(campaign, msg.patches as Patch[])
        } catch (e) {
          // Si algo se desfasó, el DM recibe la campaña entera y sigue desde ahí.
          console.warn('[mappaneitor] parches inválidos, resincronizando al DM', e)
          return send(c, { t: 'welcome', role: 'dm', campaign })
        }
        for (const d of dms()) if (d !== c) send(d, { t: 'patches', patches: msg.patches })
        dropRevoked()
        pushViews()
        save()
      }
      return
    }

    if (c.role !== 'player' || !campaign || !c.playerId) return
    const me = c.playerId

    if (msg.t === 'join') {
      const name = str(msg.name, 30, '').trim()
      if (!name) return
      return mutate((d) => {
        const p = d.players.find((x) => x.id === me)
        if (p) p.name = name
      })
    }

    if (msg.t === 'claim') {
      mutate((d) => {
        const ch = d.party.find((p) => p.id === msg.characterId)
        if (ch && ch.owner === 'dm') ch.owner = me
      })
    } else if (msg.t === 'createCharacter') {
      const i = msg.input
      const hp = int(i.hpMax, 1, 999, 10)
      mutate((d) => {
        d.party.push({
          id: 'C' + randomBytes(4).toString('hex'),
          name: str(i.name, 40, 'Personaje').trim() || 'Personaje',
          kind: 'pc',
          owner: me,
          hp: { cur: hp, max: hp, temp: 0 },
          ac: int(i.ac, 0, 40, 10),
          speed: int(i.speed, 0, 200, 30),
          initiativeMod: int(i.initiativeMod, -10, 20, 0),
          conditions: [],
          notes: '',
          color: /^#[0-9a-f]{6}$/i.test(i.color) ? i.color : '#2980b9',
          ...(typeof i.image === 'string' && i.image.startsWith('/uploads/') ? { image: i.image } : {}),
        })
      })
    } else if (msg.t === 'move') {
      const ch = ownChar(c, msg.characterId)
      // Rechazado: se le reenvía su vista para que el token vuelva a donde estaba.
      if (!ch || campaign.movementLocked || ch.moveLocked) return send(c, { t: 'view', view: projectForPlayer(campaign, c.playerId) })
      mutate((d) => {
        const m = d.maps.find((x) => layerOfKind(x, 'game').items?.some((i) => i.characterId === msg.characterId))
        if (!m) return
        const g = layerOfKind(m, 'game')
        const it = g.items?.find((i) => i.assetId === TOKEN_ASSET && i.characterId === msg.characterId)
        if (!it || g.locked || it.permission === 'static') return
        it.x = int(msg.x, 0, m.grid.cols - it.w, it.x)
        it.y = int(msg.y, 0, m.grid.rows - it.h, it.y)
      })
    } else if (msg.t === 'char') {
      if (!ownChar(c, msg.characterId)) return
      const p = msg.patch
      mutate((d) => {
        const ch = d.party.find((x) => x.id === msg.characterId)
        if (!ch) return
        // Sólo campos de la ficha; nunca dueño, tipo ni id.
        ch.name = str(p.name, 40, ch.name).trim() || ch.name
        const max = int(p.hp?.max, 1, 999, ch.hp.max)
        ch.hp = { max, cur: int(p.hp?.cur, 0, max, ch.hp.cur), temp: int(p.hp?.temp, 0, 999, ch.hp.temp) }
        ch.ac = int(p.ac, 0, 40, ch.ac)
        ch.speed = int(p.speed, 0, 200, ch.speed)
        ch.initiativeMod = int(p.initiativeMod, -10, 20, ch.initiativeMod)
        if (Array.isArray(p.conditions)) ch.conditions = p.conditions.filter((x) => typeof x === 'string').slice(0, 20).map((x) => x.slice(0, 30))
        ch.notes = str(p.notes, 4000, ch.notes)
        if (typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color)) ch.color = p.color
        if (typeof p.image === 'string' && p.image.startsWith('/uploads/')) ch.image = p.image
      })
    }
  }

  wss.on('connection', (ws, req: IncomingMessage) => {
    const c: Client = { ws, role: null, playerId: null, key: null, local: isLocalRequest(req), hits: [] }
    clients.add(c)
    ws.on('message', (raw) => {
      let msg: ClientMsg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      try {
        handle(c, msg)
      } catch (e) {
        console.error('[mappaneitor] error procesando mensaje', msg.t, e)
      }
    })
    ws.on('close', () => {
      clients.delete(c)
      pushPresence()
    })
  })

  /* ---------- HTTP: subida de imágenes e info ---------- */

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  const http = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://x')

    // Direcciones para armar los links: sólo para el DM (desde afuera no se ven las IPs de la casa).
    if (url.pathname === '/api/info' && req.method === 'GET') {
      if (!isLocalRequest(req)) return json(res, 403, { error: 'Sólo desde la PC del DM.' })
      const port = (req.headers.host ?? '').split(':')[1] ?? '80'
      return json(res, 200, { lan: lanUrls(port), tunnel: tunnelUrl })
    }

    // npm run tunnel avisa la dirección pública que le dio cloudflared (o null al cerrarse).
    if (url.pathname === '/api/tunnel' && req.method === 'POST') {
      if (!isLocalRequest(req)) return json(res, 403, { error: 'Sólo desde la PC del DM.' })
      let body = ''
      req.on('data', (ch: Buffer) => {
        body += ch
        if (body.length > 1000) req.destroy()
      })
      req.on('end', () => {
        let next: unknown
        try {
          next = (JSON.parse(body) as { url?: unknown }).url
        } catch {
          return json(res, 400, { error: 'JSON inválido.' })
        }
        if (next !== null && !(typeof next === 'string' && TUNNEL_URL.test(next))) return json(res, 400, { error: 'Dirección inválida.' })
        tunnelUrl = next as string | null
        console.log(tunnelUrl ? `[mappaneitor] Túnel: ${tunnelUrl}` : '[mappaneitor] Túnel cerrado')
        json(res, 200, { ok: true })
      })
      return
    }

    if (url.pathname === '/api/upload' && req.method === 'POST') {
      // Suben el DM (desde la PC del servidor) o un jugador con invitación válida.
      const allowed = isLocalRequest(req) || !!playerByKey(req.headers['x-key'])
      if (!allowed) return json(res, 403, { error: 'Entrá con tu link de invitación antes de subir una imagen.' })
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (ch: Buffer) => {
        size += ch.length
        if (size > MAX_UPLOAD) {
          json(res, 413, { error: 'La imagen supera los 5 MB.' })
          req.destroy()
        } else chunks.push(ch)
      })
      req.on('end', () => {
        if (size > MAX_UPLOAD) return
        const buf = Buffer.concat(chunks)
        const type = IMAGE_TYPES.find(([, test]) => test(buf))?.[0]
        if (!type) return json(res, 415, { error: 'Sólo PNG, JPG, GIF o WEBP.' })
        const name = `${randomBytes(8).toString('hex')}.${type}`
        try {
          mkdirSync(uploadsDir, { recursive: true })
          writeFileSync(join(uploadsDir, name), buf)
        } catch (e) {
          console.error('[mappaneitor] No se pudo guardar la imagen:', e)
          return json(res, 500, { error: 'No se pudo guardar la imagen en el servidor.' })
        }
        json(res, 200, { url: `/uploads/${name}` })
      })
      return
    }

    const up = url.pathname.match(/^\/uploads\/([a-f0-9]{16}\.(png|jpg|gif|webp))$/)
    if (up && req.method === 'GET') {
      const path = join(uploadsDir, up[1])
      if (!existsSync(path)) return json(res, 404, { error: 'No existe.' })
      res.writeHead(200, { 'content-type': MIME[up[2]], 'cache-control': 'public, max-age=31536000, immutable' })
      createReadStream(path).pipe(res)
      return
    }

    next()
  }

  /** Engancha el WebSocket en /ws. Devuelve false si el pedido no es para nosotros (p. ej. el HMR de Vite). */
  const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') return false
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    return true
  }

  return { http, upgrade }
}
