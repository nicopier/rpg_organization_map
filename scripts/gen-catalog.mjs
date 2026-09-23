// Escanea assets/*.png y genera src/assets/catalog.generated.ts.
// Escala del pack: 70 px = 1 casilla; el nombre indica el footprint (bed1x2, tile5x5).
import { readdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = readdirSync(resolve(root, 'assets')).filter((f) => f.toLowerCase().endsWith('.png')).sort()

function footprint(base) {
  // Última coincidencia NxM: tolera "table1x2-rough" y "doortransparentflip.1x1".
  const all = [...base.matchAll(/(\d+)x(\d+)/g)]
  if (!all.length) return { w: 1, h: 1 }
  const m = all[all.length - 1]
  return { w: Number(m[1]), h: Number(m[2]) }
}

function category(id) {
  const s = id.toLowerCase()
  if (/tile\d+x\d+$/.test(s)) return 'floor'
  if (/^(door|window|stairs|pit)/.test(s)) return 'structure'
  if (/^effects|^fire$/.test(s)) return 'effect'
  if (/^(number|arrow)/.test(s)) return 'marker'
  return 'prop'
}

function label(id) {
  return id
    .replace(/[.-]?\d+x\d+/g, '')
    .replace(/[-.]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b(two)\b/gi, '2')
    .replace(/(two|double|rough|circle|flip|transparent|pile|plant)/gi, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

const entries = files.map((file) => {
  const id = file.slice(0, -4)
  const { w, h } = footprint(id)
  return { id, file, w, h, category: category(id), label: label(id) }
})

const out = `// Generado por scripts/gen-catalog.mjs — no editar a mano. Correr \`npm run catalog\`.
import type { AssetDef } from './types'

export const GENERATED_ASSETS: AssetDef[] = ${JSON.stringify(entries, null, 2)}
`
writeFileSync(resolve(root, 'src/assets/catalog.generated.ts'), out)
console.log(`catalog: ${entries.length} assets`)
