import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { findItem, findLayer } from '../model/queries'
import { effectiveVisibility } from '../model/visibility'
import type { ContextMenuRequest } from '../render/Scene'
import { useMap } from '../state/mapStore'
import { pickTarget } from '../tools/select'
import { duplicateSelection, fitMap, flipSelection, removeSelection, rotateSelection, toggleHiddenSelection } from './commands'
import { Icon, type IconName } from './Icon'
import { NoteEditor } from './NoteEditor'
import { TOKEN_ASSET } from '../model/types'

type Entry = { label: string; icon: IconName; key?: string; run: () => void; danger?: boolean; accent?: boolean; keepOpen?: boolean }

/** Clic derecho: selecciona lo que hay bajo el cursor y ofrece las acciones sobre eso. */
export function ContextMenu({ req, onClose }: { req: ContextMenuRequest; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: req.clientX, y: req.clientY })
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [entries] = useState<Entry[]>(() => build(req, setNoteFor))
  const noteItem = useMap((s) => (noteFor ? findItem(s.doc, noteFor)?.item : undefined))

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(req.clientX, window.innerWidth - r.width - 8),
      y: Math.min(req.clientY, window.innerHeight - r.height - 8),
    })
  }, [req, noteFor])

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close)
    window.addEventListener('wheel', onClose)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close)
      window.removeEventListener('wheel', onClose)
    }
  }, [onClose])

  if (!entries.length) return null
  if (noteFor && noteItem)
    return (
      <div ref={ref} className="context-menu note-pop" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label="Notas y datos">
        <div className="note-pop-head">
          <Icon name="note" size={16} /> Notas y datos <small>sólo vos las ves</small>
        </div>
        <NoteEditor itemId={noteFor} note={noteItem.note} onDone={onClose} autoFocus />
      </div>
    )
  return (
    <div ref={ref} className="context-menu" style={{ left: pos.x, top: pos.y }} role="menu">
      {entries.map((e) => (
        <button
          key={e.label}
          role="menuitem"
          className={`${e.danger ? 'danger' : ''}${e.accent ? ' accent' : ''}`}
          onClick={() => {
            e.run()
            if (!e.keepOpen) onClose()
          }}
        >
          <Icon name={e.icon} size={16} />
          <span>{e.label}</span>
          {e.key && <kbd>{e.key}</kbd>}
        </button>
      ))}
    </div>
  )
}

function build(req: ContextMenuRequest, editNote: (id: string) => void): Entry[] {
  const s = useMap.getState()
  const target = pickTarget(req.pointer)
  if (!target) return [{ label: 'Encuadrar mapa', icon: 'fit', run: fitMap }]

  // Si ya estaba dentro de una selección múltiple, se conserva.
  const keep =
    target.selection.type === 'items' &&
    s.selection.type === 'items' &&
    s.selection.ids.includes(target.selection.ids[0])
  if (!keep) s.setUi({ selection: target.selection, activeLayerId: target.layerId })

  const sel = useMap.getState().selection
  let hidden = false
  if (sel.type === 'items') {
    const f = findItem(s.doc, sel.ids[0])
    if (f) hidden = effectiveVisibility(f.item, f.layer) === 'dm'
  } else if (sel.type === 'wall') {
    const l = findLayer(s.doc, sel.layerId)
    const w = l?.walls?.[sel.key]
    if (l && w) hidden = effectiveVisibility(w, l) === 'dm'
  }

  const out: Entry[] = []
  if (s.viewer === 'dm') {
    out.push(
      hidden
        ? { label: 'Revelar a los jugadores', icon: 'eye', key: 'H', run: toggleHiddenSelection, accent: true }
        : { label: 'Ocultar a los jugadores', icon: 'eyeOff', key: 'H', run: toggleHiddenSelection },
    )
  }
  if (sel.type === 'items' && sel.ids.length === 1 && s.viewer === 'dm') {
    const f = findItem(s.doc, sel.ids[0])
    if (f && f.item.assetId !== TOKEN_ASSET) {
      const id = f.item.id
      out.unshift({ label: f.item.note ? 'Editar notas y datos' : 'Agregar notas y datos', icon: 'note', run: () => editNote(id), keepOpen: true })
    }
  }
  if (sel.type === 'items') {
    out.push(
      { label: 'Rotar', icon: 'rotate', key: 'R', run: rotateSelection },
      { label: 'Espejar', icon: 'flip', key: 'F', run: flipSelection },
      { label: 'Duplicar', icon: 'copy', key: 'Ctrl+D', run: duplicateSelection },
    )
  }
  out.push({ label: 'Borrar', icon: 'trash', key: 'Supr', run: removeSelection, danger: true })
  return out
}
