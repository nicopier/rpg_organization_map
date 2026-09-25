// Dados 3D sobre toda la pantalla. El resultado ya lo decidió el servidor: acá sólo se anima,
// y los dados "caen" en esos valores. Si no hay WebGL, queda el cartel con el total.
import { useEffect, useState } from 'react'
import type DiceBox from '@3d-dice/dice-box-threejs'
import { readPref } from '../App'
import type { LogEntry } from '../net/protocol'
import { onLiveEntry } from '../state/logStore'
import { useMap } from '../state/mapStore'
import { natural, type RollResult } from './notation'

export const DICE_PREFS = {
  /** Animar los dados (propios y ajenos). */
  on: 'mappaneitor:dice3d',
  /** Animar también las tiradas de los demás. */
  others: 'mappaneitor:diceOthers',
  sound: 'mappaneitor:diceSound',
}
const pref = (key: string) => readPref(key, '1') === '1'

const SHAPES = new Set([4, 6, 8, 10, 12, 20])
/** Más dados que esto en pantalla es un amontonamiento: se animan los primeros. */
const MAX_ANIMATED = 20
const CHIP_MS = 2600

/**
 * Notación de la librería con los valores fijados, agrupada por tipo de dado
 * (la librería junta los grupos iguales, así que el orden de los valores tiene que seguir esos grupos).
 * El d100 se muestra como el par clásico: decenas (d100) y unidades (d10).
 */
export function animationNotation(r: RollResult): string | null {
  const groups = new Map<string, number[]>()
  const push = (type: string, v: number) => {
    if (!groups.has(type)) groups.set(type, [])
    groups.get(type)!.push(v)
  }
  let n = 0
  for (const d of r.dice) {
    for (const v of d.values) {
      if (n >= MAX_ANIMATED) break
      if (d.sides === 100) {
        push('d100', Math.floor((v % 100) / 10) * 10 || 100)
        push('d10', v % 10 || 10)
        n += 2
      } else if (SHAPES.has(d.sides)) {
        push(`d${d.sides}`, v)
        n++
      }
    }
  }
  if (!groups.size) return null
  const sets = [...groups].map(([type, vs]) => `${vs.length}${type}`)
  const values = [...groups.values()].flat()
  return `${sets.join('+')}@${values.join(',')}`
}

let boxPromise: Promise<DiceBox | null> | null = null
let lastColor = ''

function getBox(): Promise<DiceBox | null> {
  boxPromise ??= (async () => {
    try {
      const { default: Box } = await import('@3d-dice/dice-box-threejs')
      const box = new Box('#dice-stage', {
        assetPath: '/dice/',
        sounds: true,
        volume: 60,
        shadows: true,
        theme_material: 'plastic',
        gravity_multiplier: 400,
        strength: 1.3,
      })
      await box.initialize()
      return box
    } catch (e) {
      console.warn('[mappaneitor] Sin dados 3D (¿WebGL apagado?):', e)
      return null
    }
  })()
  return boxPromise
}

/** Una tirada a la vez; si se acumulan, se saltean las viejas. */
let queue: LogEntry[] = []
let busy = false

export function DiceStage() {
  const [chip, setChip] = useState<LogEntry | null>(null)

  useEffect(() => {
    const play = async () => {
      if (busy) return
      busy = true
      while (queue.length) {
        const e = queue.shift()!
        const notation = pref(DICE_PREFS.on) ? animationNotation(e.result!) : null
        const box = notation ? await getBox() : null
        if (box && notation) {
          if (e.color !== lastColor) {
            lastColor = e.color
            await box.updateConfig({
              theme_customColorset: { name: `mappa-${e.color}`, foreground: '#ffffff', background: e.color, outline: '#000000', texture: 'none', material: 'plastic' },
            })
          }
          box.volume = pref(DICE_PREFS.sound) ? 60 : 0
          // Si algo se traba, a los 6 s se sigue igual.
          await Promise.race([box.roll(notation), new Promise((r) => setTimeout(r, 6000))])
        }
        setChip(e)
        await new Promise((r) => setTimeout(r, queue.length ? 900 : CHIP_MS))
        box?.clearDice()
        setChip(null)
      }
      busy = false
    }

    return onLiveEntry((e) => {
      const s = useMap.getState()
      const myId = s.role === 'dm' ? 'dm' : s.me
      // Un susurro para mí se avisa aunque el panel de dados esté cerrado.
      if (e.vis === 'whisper' && e.to === myId) s.toast(`Susurro de ${e.name}: ${e.text!.length > 70 ? e.text!.slice(0, 70) + '…' : e.text}`)
      if (e.kind !== 'roll' || !e.result || e.hidden) return
      const mine = e.from === myId
      if (!mine && !pref(DICE_PREFS.others)) return
      queue.push(e)
      if (queue.length > 2) queue = queue.slice(-2)
      void play()
    })
  }, [])

  const nat = chip?.result ? natural(chip.result) : null
  return (
    <div id="dice-stage" className="dice-stage" aria-hidden={!chip}>
      {chip && (
        <div className={`dice-chip${nat === 20 ? ' crit' : nat === 1 ? ' fumble' : ''}`} key={chip.id} role="status">
          <span className="who" style={{ color: chip.color }}>
            {chip.name}
            {chip.label ? ` · ${chip.label}` : ''}
          </span>
          <span className="total">{chip.result!.total}</span>
          <span className="expr">
            {chip.expr}
            {nat === 20 ? ' · ¡20 natural!' : nat === 1 ? ' · 1 natural' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
