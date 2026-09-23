import { useState } from 'react'
import type { DmNote } from '../model/types'
import { setItemNote } from '../state/actions'
import { ColorSwatches } from './fields'
import { Icon } from './Icon'

export const AURA_COLORS = ['#f5b942', '#e74c3c', '#2ecc71', '#3498db', '#b04cff', '#ecf0f1']
const EMPTY: DmNote = { text: '', props: [], color: AURA_COLORS[0] }

/**
 * Notas y propiedades del DM sobre un objeto. Se editan en borrador y se guardan de una vez,
 * así cada edición es un solo paso de deshacer.
 */
export function NoteEditor({ itemId, note, onDone, autoFocus }: { itemId: string; note?: DmNote; onDone?: () => void; autoFocus?: boolean }) {
  const [d, setD] = useState<DmNote>(() => note ?? EMPTY)
  const [base, setBase] = useState(note)
  // Si la nota cambia desde afuera (deshacer, otro panel), el borrador la sigue.
  if (note !== base) {
    setBase(note)
    setD(note ?? EMPTY)
  }
  const dirty = JSON.stringify(d) !== JSON.stringify(note ?? EMPTY)
  const setProp = (i: number, p: Partial<DmNote['props'][number]>) => setD({ ...d, props: d.props.map((x, j) => (j === i ? { ...x, ...p } : x)) })

  const save = () => {
    setItemNote(itemId, d)
    onDone?.()
  }

  return (
    <div
      className="note-editor"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
      }}
    >
      <textarea
        rows={3}
        autoFocus={autoFocus}
        value={d.text}
        placeholder="Qué es, qué esconde, qué pasa si lo tocan…"
        onChange={(e) => setD({ ...d, text: e.target.value })}
        aria-label="Nota del DM"
      />
      {d.props.length > 0 && (
        <div className="note-props">
          {d.props.map((p, i) => (
            <div className="note-prop" key={i}>
              <input value={p.k} placeholder="Dato" onChange={(e) => setProp(i, { k: e.target.value })} aria-label="Nombre del dato" />
              <input value={p.v} placeholder="Valor" onChange={(e) => setProp(i, { v: e.target.value })} aria-label="Valor del dato" />
              <button className="icon-btn tiny" title="Quitar dato" onClick={() => setD({ ...d, props: d.props.filter((_, j) => j !== i) })}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="link" onClick={() => setD({ ...d, props: [...d.props, { k: '', v: '' }] })}>
        + Agregar dato (CD, trampa, contenido…)
      </button>
      <div>
        <span className="label">Aura</span>
        <ColorSwatches value={d.color} colors={AURA_COLORS} onChange={(color) => setD({ ...d, color })} />
      </div>
      <div className="note-actions">
        {note && (
          <button
            className="danger"
            onClick={() => {
              setItemNote(itemId, undefined)
              onDone?.()
            }}
          >
            Quitar notas
          </button>
        )}
        <div className="spacer" />
        {onDone && <button onClick={onDone}>Cancelar</button>}
        <button className="primary" disabled={!dirty} onClick={save} title="Ctrl+Enter">
          Guardar
        </button>
      </div>
    </div>
  )
}
