import { useEffect, useState } from 'react'
import { readPref, writePref } from '../App'
import { DICE_PREFS } from '../dice/DiceStage'
import { natural, splitCommand, type RolledDice } from '../dice/notation'
import { net } from '../net/bridge'
import type { Character } from '../model/types'
import type { LogEntry } from '../net/protocol'
import { useLog } from '../state/logStore'
import { useMap } from '../state/mapStore'
import { Icon } from './Icon'

const DICE = [4, 6, 8, 10, 12, 20, 100] as const
type Pool = Partial<Record<(typeof DICE)[number], number>>

const SECRET_PREF = 'mappaneitor:rollSecret'

/** "1d20+2d6+3 adv", en el orden de los botones con el d20 primero. */
function poolExpr(pool: Pool, mod: number, adv: 'adv' | 'dis' | null): string {
  const order = [20, ...DICE.filter((d) => d !== 20)] as (typeof DICE)[number][]
  const dice = order.filter((d) => pool[d]).map((d) => `${pool[d]}d${d}`)
  if (!dice.length) return ''
  return dice.join('+') + (mod ? (mod > 0 ? `+${mod}` : `${mod}`) : '') + (adv && pool[20] === 1 ? ` ${adv}` : '')
}

export function roll(expr: string, label?: string, secret = readPref(SECRET_PREF, '0') === '1') {
  const as = rollingAs(useMap.getState())?.id
  net.send({ t: 'roll', expr, ...(label ? { label } : {}), secret, ...(as ? { as } : {}) })
}

/** DM con un solo NPC seleccionado: sus tiradas quedan firmadas "DM (nombre del NPC)". */
function rollingAs(s: ReturnType<typeof useMap.getState>): Character | undefined {
  if (s.role !== 'dm' || s.selection.type !== 'items' || s.selection.ids.length !== 1) return undefined
  const id = s.selection.ids[0]
  const item = s.doc.layers.flatMap((l) => l.items ?? []).find((i) => i.id === id)
  return item?.characterId ? s.doc.characters.find((c) => c.id === item.characterId) : undefined
}

/** Jugador al que el DM le bloqueó los dados (a todos o a su personaje). El DM nunca. */
function useDiceLocked() {
  return useMap((s) => s.role !== 'dm' && (!!s.campaign.diceLocked || s.campaign.party.some((c) => c.owner === s.me && c.diceLocked)))
}

/** Segundos que le faltan a este jugador para poder volver a tirar (0 = ya puede). */
function useCooldown(): number {
  const until = useLog((s) => s.cooldownUntil)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [until])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

/** Por qué no se puede tirar ahora, o null si se puede. */
function useRollBlock(): string | null {
  const locked = useDiceLocked()
  const wait = useCooldown()
  if (locked) return 'Dados bloqueados'
  if (wait > 0) return `Esperá ${wait} s`
  return null
}

/** Id con el que firma este cliente: 'dm' o el del jugador. */
function useMyId() {
  return useMap((s) => (s.role === 'dm' ? 'dm' : s.me))
}

export function DicePanel() {
  const isDm = useMap((s) => s.role === 'dm')
  const locked = useDiceLocked()
  const block = useRollBlock()
  const asNpc = useMap((s) => rollingAs(s))
  const [pool, setPool] = useState<Pool>({})
  const [mod, setMod] = useState(0)
  const [adv, setAdv] = useState<'adv' | 'dis' | null>(null)
  const [secret, setSecretState] = useState(() => readPref(SECRET_PREF, '0') === '1')
  const setSecret = (v: boolean) => {
    setSecretState(v)
    writePref(SECRET_PREF, v ? '1' : '0')
  }
  const rollError = useLog((s) => s.rollError)

  useEffect(() => {
    if (rollError) useMap.getState().toast(rollError.text)
  }, [rollError])

  const expr = poolExpr(pool, mod, adv)
  const add = (d: (typeof DICE)[number], delta: number) =>
    setPool((p) => {
      const n = Math.max(0, Math.min(20, (p[d] ?? 0) + delta))
      const next = { ...p, [d]: n }
      if (!n) delete next[d]
      return next
    })
  const reset = () => {
    setPool({})
    setMod(0)
    setAdv(null)
  }
  const doRoll = () => {
    if (!expr || block) return
    roll(expr, undefined, secret)
    reset()
  }

  return (
    <div className="dice-panel">
      <div className="dice-tray">
        <div className="dice-buttons">
          {DICE.map((d) => (
            <button
              key={d}
              className={`die-btn${pool[d] ? ' on' : ''}`}
              onClick={() => add(d, 1)}
              onContextMenu={(e) => {
                e.preventDefault()
                add(d, -1)
              }}
              title={`Sumar un d${d} (clic derecho lo saca)`}
            >
              d{d === 100 ? '%' : d}
              {!!pool[d] && <span className="count">{pool[d]}</span>}
            </button>
          ))}
        </div>
        <div className="dice-row">
          <div className="stepper" title="Modificador">
            <button onClick={() => setMod((m) => Math.max(-99, m - 1))} aria-label="Restar 1 al modificador">
              −
            </button>
            <input type="number" value={mod} aria-label="Modificador" onChange={(e) => setMod(Math.max(-99, Math.min(99, Math.round(Number(e.target.value)) || 0)))} />
            <button onClick={() => setMod((m) => Math.min(99, m + 1))} aria-label="Sumar 1 al modificador">
              +
            </button>
          </div>
          <div className="segmented small">
            <button className={adv === 'adv' ? 'on' : ''} disabled={pool[20] !== 1} onClick={() => setAdv(adv === 'adv' ? null : 'adv')} title="Ventaja: 2d20, el mayor">
              Ventaja
            </button>
            <button className={adv === 'dis' ? 'on' : ''} disabled={pool[20] !== 1} onClick={() => setAdv(adv === 'dis' ? null : 'dis')} title="Desventaja: 2d20, el menor">
              Desv.
            </button>
          </div>
        </div>
        <div className="dice-row">
          <label className="check" title={isDm ? 'Sólo vos ves el resultado' : 'Sólo vos y el DM ven el resultado'}>
            <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
            <Icon name="eyeOff" size={14} /> {isDm ? 'Secreta' : 'Sólo al DM'}
          </label>
          <div className="spacer" />
          {expr && (
            <button className="icon-btn tiny" onClick={reset} title="Vaciar" aria-label="Vaciar la tirada">
              <Icon name="x" size={14} />
            </button>
          )}
          <button className="primary roll-btn" disabled={!expr || !!block} onClick={doRoll} title={locked ? 'El DM bloqueó las tiradas' : undefined}>
            <Icon name={locked ? 'lock' : 'dice'} size={16} /> {block ?? (expr ? `Tirar ${expr}` : 'Elegí dados')}
          </button>
        </div>
        {asNpc && (
          <div className="rolling-as" title="Tenés este NPC seleccionado: tus tiradas quedan a su nombre. Deseleccioná para tirar como DM.">
            <span className="dot" style={{ background: asNpc.color }} />
            Tirás como <strong>DM ({asNpc.name})</strong>
          </div>
        )}
        <details className="dice-settings">
          <summary>Opciones</summary>
          <div className="dice-options-row">
            <DiceOptions />
            {isDm && <ClearLogButton />}
          </div>
        </details>
      </div>
      <ChatBox secret={secret} />
      <RollLog />
    </div>
  )
}

/** Lo más nuevo arriba. */
function RollLog() {
  const entries = useLog((s) => s.entries)
  const myId = useMyId()
  const block = useRollBlock()
  const rolling = useLog((s) => s.rolling)
  return (
    <ol className="roll-log">
      {entries.length === 0 && <li className="hint empty">Todavía no hay tiradas. Elegí dados arriba o escribí /r 1d20+3 en el chat.</li>}
      {entries
        .slice()
        .reverse()
        .map((e) => (
          <Entry key={e.id} e={e} myId={myId} block={block} rolling={!!rolling[e.id]} />
        ))}
    </ol>
  )
}

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Una línea por entrada: quién y qué a la izquierda, el total a la derecha. La hora queda en el tooltip. */
function Entry({ e, myId, block, rolling }: { e: LogEntry; myId: string | null; block: string | null; rolling: boolean }) {
  const mine = e.from === myId
  const who = (
    <>
      <span className="dot" style={{ background: e.color }} />
      <strong className="name">{e.name}</strong>
      {e.vis === 'whisper' && <span className="to">→ {e.to === myId ? 'vos' : e.toName}</span>}
    </>
  )

  if (e.hidden)
    return (
      <li className="log-item muted" title={time(e.ts)}>
        <div className="log-line">
          {who}
          <span className="log-text">tiró en secreto</span>
        </div>
      </li>
    )

  if (e.kind === 'chat')
    return (
      <li className={`log-item chat${e.vis === 'whisper' ? ' whisper' : ''}${mine ? ' mine' : ''}`} title={time(e.ts)}>
        <div className="log-line">
          {who}
          <span className="log-text">{e.text}</span>
        </div>
      </li>
    )

  // Los dados 3D todavía ruedan: el resultado aparece cuando frenan.
  if (rolling)
    return (
      <li className="log-item muted rolling" title={time(e.ts)}>
        <div className="log-line">
          {who}
          <span className="log-text">
            <Icon name="dice" size={12} /> está tirando{e.label ? ` ${e.label}` : ''}…
          </span>
        </div>
      </li>
    )

  const r = e.result!
  const nat = natural(r)
  return (
    <li className={`log-item roll${Date.now() - e.ts < 8000 ? ' revealed' : ''}${mine ? ' mine' : ''}`} title={time(e.ts)}>
      <div className="log-main">
        <div className="log-line">
          {who}
          {e.label && <span className="label">{e.label}</span>}
          {e.vis === 'secret' && <Icon name="eyeOff" size={12} className="secret-mark" />}
        </div>
        <div className="values">
          <span className="expr">{e.expr}</span>
          {r.dice.map((d, i) => (
            <DiceValues key={i} d={d} first={i === 0} />
          ))}
          {r.mod !== 0 && <span className="mod">{r.mod > 0 ? `+${r.mod}` : `−${-r.mod}`}</span>}
        </div>
      </div>
      <button
        className={`total${nat === 20 ? ' crit' : nat === 1 ? ' fumble' : ''}`}
        disabled={!!block}
        onClick={() => roll(e.expr!, e.label)}
        title={block ?? `Tirar de nuevo ${e.expr}`}
      >
        {r.total}
      </button>
    </li>
  )
}

function DiceValues({ d, first }: { d: RolledDice; first: boolean }) {
  return (
    <>
      {(!first || d.sign < 0) && <span className="op">{d.sign < 0 ? '−' : '+'}</span>}
      {d.values.map((v, i) => (
        <span key={i} className={`die-val${d.kept[i] ? '' : ' dropped'}${v === d.sides ? ' max' : v === 1 ? ' min' : ''}`} title={`d${d.sides}${d.kept[i] ? '' : ' (descartado)'}`}>
          {v}
        </span>
      ))}
    </>
  )
}

/** Mensajes al log. "/r 1d20+5 Ataque" tira; el selector elige si es para todos o un susurro. */
function ChatBox({ secret }: { secret: boolean }) {
  const isDm = useMap((s) => s.role === 'dm')
  const block = useRollBlock()
  const me = useMap((s) => s.me)
  const players = useMap((s) => s.campaign.players)
  const party = useMap((s) => s.campaign.party)
  const [text, setText] = useState('')
  const [to, setTo] = useState('')

  const targets = [
    ...(isDm ? [] : [{ id: 'dm', name: 'DM' }]),
    ...players
      .filter((p) => p.id !== me && p.name)
      .map((p) => {
        const ch = party.find((c) => c.owner === p.id)
        return { id: p.id, name: ch ? `${ch.name} (${p.name})` : p.name }
      }),
  ]
  // Si el destinatario se fue de la mesa, vuelve a "Todos".
  const target = targets.some((t) => t.id === to) ? to : ''

  const send = () => {
    const t = text.trim()
    if (!t) return
    const cmd = t.match(/^\/(r|roll|tirar)\s+(.*)$/i)
    if (cmd) {
      const { expr, label } = splitCommand(cmd[2])
      if (!expr) return useMap.getState().toast('Después de /r va la tirada, por ejemplo /r 1d20+5 Ataque')
      if (block) return useMap.getState().toast(block === 'Dados bloqueados' ? 'El DM bloqueó las tiradas por ahora.' : `${block} para volver a tirar.`)
      roll(expr, label, secret)
    } else {
      net.send({ t: 'chat', text: t, ...(target ? { to: target } : {}) })
    }
    setText('')
  }

  return (
    <form
      className={`chat-box${target ? ' whisper' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <select value={target} onChange={(e) => setTo(e.target.value)} aria-label="Para quién" title="Para quién es el mensaje">
        <option value="">Para todos</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            Susurro a {t.name}
          </option>
        ))}
      </select>
      <div className="chat-row">
        <input value={text} maxLength={500} placeholder="Mensaje, o /r 1d20+5 Ataque" onChange={(e) => setText(e.target.value)} aria-label="Mensaje" />
        <button type="submit" className="icon-btn" disabled={!text.trim()} title="Enviar (Enter)" aria-label="Enviar">
          <Icon name="next" size={16} />
        </button>
      </div>
    </form>
  )
}

/** Opciones de los dados 3D, para el pie del panel. */
export function DiceOptions() {
  const [, force] = useState(0)
  const opt = (key: string, label: string) => (
    <label className="check">
      <input
        type="checkbox"
        checked={readPref(key, '1') === '1'}
        onChange={(e) => {
          writePref(key, e.target.checked ? '1' : '0')
          force((n) => n + 1)
        }}
      />
      {label}
    </label>
  )
  return (
    <div className="dice-options">
      {opt(DICE_PREFS.on, 'Dados 3D')}
      {opt(DICE_PREFS.others, 'Ver los de otros')}
      {opt(DICE_PREFS.sound, 'Sonido')}
    </div>
  )
}

/** DM: botón para vaciar el log. */
export function ClearLogButton() {
  const count = useLog((s) => s.entries.length)
  if (!count) return null
  return (
    <button
      className="icon-btn tiny"
      title="Vaciar el log de tiradas (para todos)"
      aria-label="Vaciar el log de tiradas"
      onClick={() => confirm('¿Borrar todas las tiradas y mensajes del log, para todos?') && net.send({ t: 'clearLog' })}
    >
      <Icon name="trash" size={14} />
    </button>
  )
}
