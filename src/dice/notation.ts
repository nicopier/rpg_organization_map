// Notación de dados: "2d6+3", "d20", "1d20+5 adv", "4d6kh3", "d%", "1d8+1d6-1".
// Código puro: lo usa el servidor para tirar (con su azar) y el cliente para validar y mostrar.

export type KeepMode = 'kh' | 'kl' | 'dh' | 'dl'
export type DiceTerm = { kind: 'dice'; sign: 1 | -1; count: number; sides: number; keep?: { mode: KeepMode; n: number } }
export type NumTerm = { kind: 'num'; sign: 1 | -1; value: number }
export type Term = DiceTerm | NumTerm

/** Un grupo de dados tirado: todos los valores, y cuáles cuentan (los descartados por kh/kl no). */
export type RolledDice = { sign: 1 | -1; sides: number; values: number[]; kept: boolean[] }
export type RollResult = { dice: RolledDice[]; mod: number; total: number }

export const LIMITS = { dice: 50, sides: 1000, terms: 20, chars: 200, mod: 1000 }

const TERM = /^([+-])?(?:(\d*)d(\d+|%)(?:(kh|kl|dh|dl)(\d*))?|(\d+))/i
const ADV = /\s+(adv|ventaja|dis|desventaja|desv)$/i

export class DiceError extends Error {}

/** Interpreta una expresión. Tira DiceError con un mensaje para mostrar si no es válida. */
export function parse(input: string): Term[] {
  let src = input.trim().toLowerCase()
  if (!src) throw new DiceError('Escribí qué tirar, por ejemplo 1d20+3.')
  if (src.length > LIMITS.chars) throw new DiceError('La tirada es demasiado larga.')

  // Ventaja / desventaja: el primer 1d20 pasa a 2d20 quedándose con el mayor (o el menor).
  let adv: 'kh' | 'kl' | null = null
  const a = src.match(ADV)
  if (a) {
    adv = a[1].startsWith('adv') || a[1] === 'ventaja' ? 'kh' : 'kl'
    src = src.slice(0, a.index).trim()
  }
  src = src.replace(/\s+/g, '')

  const terms: Term[] = []
  while (src) {
    const m = src.match(TERM)
    if (!m || (terms.length && !m[1])) throw new DiceError(`No entiendo "${src}".`)
    src = src.slice(m[0].length)
    const sign = m[1] === '-' ? -1 : 1
    if (m[6] !== undefined) {
      terms.push({ kind: 'num', sign, value: Number(m[6]) })
      continue
    }
    const count = m[2] ? Number(m[2]) : 1
    const sides = m[3] === '%' ? 100 : Number(m[3])
    if (count < 1) throw new DiceError('Hay que tirar al menos un dado.')
    if (sides < 2 || sides > LIMITS.sides) throw new DiceError(`Un dado de ${sides} caras no existe.`)
    const t: DiceTerm = { kind: 'dice', sign, count, sides }
    if (m[4]) {
      const n = m[5] ? Number(m[5]) : 1
      if (n < 1 || n > count) throw new DiceError(`No se puede ${m[4].startsWith('k') ? 'quedar con' : 'descartar'} ${n} de ${count} dados.`)
      t.keep = { mode: m[4] as KeepMode, n }
    }
    terms.push(t)
  }

  if (adv) {
    const d20 = terms.find((t): t is DiceTerm => t.kind === 'dice' && t.sides === 20 && t.count === 1 && !t.keep)
    if (!d20) throw new DiceError('La ventaja y la desventaja van con 1d20.')
    d20.count = 2
    d20.keep = { mode: adv, n: 1 }
  }

  const dice = terms.reduce((n, t) => n + (t.kind === 'dice' ? t.count : 0), 0)
  if (!dice) throw new DiceError('Falta algún dado: por ejemplo 1d20.')
  if (dice > LIMITS.dice) throw new DiceError(`Máximo ${LIMITS.dice} dados por tirada.`)
  if (terms.length > LIMITS.terms) throw new DiceError('Demasiados términos.')
  if (terms.some((t) => t.kind === 'num' && t.value > LIMITS.mod)) throw new DiceError(`El modificador máximo es ${LIMITS.mod}.`)
  return terms
}

/** Forma canónica, la que se guarda y se muestra: "2d20kh1+5". */
export function format(terms: Term[]): string {
  return terms
    .map((t, i) => {
      const op = t.sign < 0 ? '-' : i ? '+' : ''
      if (t.kind === 'num') return op + t.value
      return op + `${t.count}d${t.sides}` + (t.keep ? t.keep.mode + t.keep.n : '')
    })
    .join('')
}

/** Tira. `rng(sides)` devuelve un entero entre 1 y sides. */
export function evaluate(terms: Term[], rng: (sides: number) => number): RollResult {
  const dice: RolledDice[] = []
  let mod = 0
  let total = 0
  for (const t of terms) {
    if (t.kind === 'num') {
      mod += t.sign * t.value
      continue
    }
    const values = Array.from({ length: t.count }, () => rng(t.sides))
    const kept = keepMask(values, t.keep)
    dice.push({ sign: t.sign, sides: t.sides, values, kept })
    total += t.sign * values.reduce((s, v, i) => s + (kept[i] ? v : 0), 0)
  }
  return { dice, mod, total: total + mod }
}

function keepMask(values: number[], keep?: DiceTerm['keep']): boolean[] {
  if (!keep) return values.map(() => true)
  // Orden de mayor a menor; ante empate gana el primero.
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  const high = keep.mode === 'kh' || keep.mode === 'dl'
  const n = keep.mode.startsWith('k') ? keep.n : values.length - keep.n
  const chosen = new Set((high ? order : [...order].reverse()).slice(0, n).map(([, i]) => i))
  return values.map((_, i) => chosen.has(i))
}

/** "20 natural" o "1 natural": una sola d20 que cuenta en la tirada. */
export function natural(r: RollResult): 20 | 1 | null {
  const d20 = r.dice.filter((d) => d.sides === 20)
  if (d20.length !== 1) return null
  const kept = d20[0].values.filter((_, i) => d20[0].kept[i])
  if (kept.length !== 1) return null
  return kept[0] === 20 ? 20 : kept[0] === 1 ? 1 : null
}

/**
 * Separa un comando "/r 1d20+5 Ataque con espada" en expresión y etiqueta:
 * la expresión son las primeras palabras que parecen dados; el resto es la etiqueta.
 */
export function splitCommand(text: string): { expr: string; label: string } {
  const words = text.trim().split(/\s+/)
  let i = 0
  const dicey = (w: string) => /^[+-]$/.test(w) || (/^[+-]?[\dd%+\-khl]+$/i.test(w) && /\d|%/.test(w))
  while (i < words.length && (dicey(words[i]) || (i > 0 && ADV.test(' ' + words[i])))) i++
  return { expr: words.slice(0, i).join(' '), label: words.slice(i).join(' ') }
}
