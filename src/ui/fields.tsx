import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { useMap } from '../state/mapStore'

/**
 * Input que confirma al salir o con Enter (Esc descarta). Evita que cada tecla
 * sea una entrada distinta en el historial de deshacer.
 */
export function CommitText({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = () => {
    if (v !== value) onCommit(v)
  }
  return (
    <input
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(value)
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
    />
  )
}

export function CommitNumber({
  value,
  onCommit,
  min,
  max,
  ...rest
}: { value: number; onCommit: (v: number) => void; min?: number; max?: number } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'min' | 'max'
>) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    let n = Number(v)
    if (v.trim() === '' || !Number.isFinite(n)) return setV(String(value))
    n = Math.round(n)
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    setV(String(n))
    if (n !== value) onCommit(n)
  }
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(String(value))
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  small?: boolean
}) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const TOKEN_COLORS = ['#c0392b', '#d35400', '#d4a017', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#c2185b', '#5d6d7e', '#6d4c41']

export function ColorSwatches({ value, onChange, colors = TOKEN_COLORS }: { value: string; onChange: (c: string) => void; colors?: string[] }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch${c.toLowerCase() === value.toLowerCase() ? ' on' : ''}`}
          style={{ background: c }}
          title={c}
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="swatch custom" title="Otro color">
        <input type="color" value={/^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#000000"} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}

const begin = () => useMap.getState().beginGroup()
const end = () => useMap.getState().endGroup()

/** Para sliders: todo el arrastre queda como un solo paso de deshacer. */
export const groupWhileDragging = { onPointerDown: begin, onPointerUp: end, onPointerCancel: end }

/** Para selectores de color: mientras el picker está abierto, un solo paso de deshacer. */
export const groupWhileFocused = { onFocus: begin, onBlur: end }
