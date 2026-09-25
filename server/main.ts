// Producción: sirve la app compilada (dist/) y el servidor de la partida en el mismo puerto.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { createGameServer, lanUrls } from './core'

const root = join(import.meta.dirname, '..')
const dist = join(root, 'dist')
const port = Number(process.env.PORT ?? 3000)
// MAPPA_DATA mueve la campaña a otra carpeta (sacarla de OneDrive, o aislar una de prueba).
// `npm run dev` ya lo respetaba; acá faltaba.
const game = createGameServer(process.env.MAPPA_DATA ?? join(root, 'data'))

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
}

const server = createServer((req, res) => {
  game.http(req, res, () => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    let file = normalize(join(dist, path))
    if (!file.startsWith(dist)) return res.writeHead(403).end()
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
})
server.on('upgrade', (req, socket, head) => {
  if (!game.upgrade(req, socket, head)) socket.destroy()
})
server.listen(port, '0.0.0.0', () => {
  console.log(`\nMappaneitor listo.\n  DM (en esta PC):  http://localhost:${port}`)
  for (const u of lanUrls(port)) console.log(`  Jugadores:        ${u}`)
  console.log('')
})
