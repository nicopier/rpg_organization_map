// Abre un túnel de Cloudflare hacia Mappaneitor para jugar por internet.
// Uso: node scripts/tunnel.mjs [puerto]   (3000 = npm start, 5173 = npm run dev)
// Busca cloudflared en el PATH y, si la terminal todavía no lo ve (recién instalado), en su carpeta de siempre.
// Cuando cloudflared anuncia su dirección pública, se la pasa al servidor: Invitar la usa sola.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const port = process.argv[2] ?? '3000'
const local = `http://localhost:${port}`
const candidates = [
  'cloudflared',
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
]
const exe = candidates.find((c) => (c.includes('\\') ? existsSync(c) : spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0))

if (!exe) {
  console.error('No encuentro cloudflared. Instalalo con:  winget install --id Cloudflare.cloudflared')
  process.exit(1)
}

const probe = await fetch(`${local}/api/info`).catch(() => null)
if (!probe?.ok) {
  console.error(`No hay nada corriendo en ${local}. Primero prendé Mappaneitor (${port === '3000' ? 'npm start' : 'npm run dev'}) en otra terminal.`)
  process.exit(1)
}

/** Le avisa al servidor la dirección pública (o null cuando el túnel se cierra). */
const announce = (url) =>
  fetch(`${local}/api/tunnel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) }).then(
    (r) => r.ok,
    () => false,
  )

console.log(`Abriendo el túnel hacia ${local}…\n`)
const child = spawn(exe, ['tunnel', '--url', local], { stdio: ['ignore', 'pipe', 'pipe'] })

let found = null
const scan = (chunk, out) => {
  out.write(chunk)
  if (found) return
  const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
  if (!m) return
  found = m[0]
  announce(found).then((ok) =>
    console.log(
      ok
        ? `\n  ✓ Dirección pública: ${found}\n    Ya quedó cargada en Invitar: abrí Invitar y copiá los links.\n`
        : `\n  Dirección pública: ${found}\n    No pude avisarle al servidor: pegala a mano en Invitar → "Dirección de internet (túnel)".\n`,
    ),
  )
}
child.stdout.on('data', (c) => scan(c, process.stdout))
child.stderr.on('data', (c) => scan(c, process.stderr))

// Al cerrar (Ctrl+C), el servidor deja de ofrecer una dirección que ya no anda.
let closing = false
const close = async (code) => {
  if (closing) return
  closing = true
  if (found) await announce(null)
  process.exit(code)
}
process.on('SIGINT', () => {
  child.kill()
  void close(0)
})
child.on('exit', (code) => void close(code ?? 0))
