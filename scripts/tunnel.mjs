// Abre un túnel de Cloudflare hacia Mappaneitor para jugar por internet.
// Uso: node scripts/tunnel.mjs [puerto]   (3000 = npm start, 5173 = npm run dev)
// Busca cloudflared en el PATH y, si la terminal todavía no lo ve (recién instalado), en su carpeta de siempre.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const port = process.argv[2] ?? '3000'
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

const probe = await fetch(`http://localhost:${port}/api/info`).catch(() => null)
if (!probe?.ok) {
  console.error(`No hay nada corriendo en http://localhost:${port}. Primero prendé Mappaneitor (${port === '3000' ? 'npm start' : 'npm run dev'}) en otra terminal.`)
  process.exit(1)
}

console.log(`Abriendo el túnel hacia http://localhost:${port}…`)
console.log('Buscá abajo la dirección https://…trycloudflare.com y pegala en Invitar → "Dirección de internet (túnel)".\n')
const child = spawn(exe, ['tunnel', '--url', `http://localhost:${port}`], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
