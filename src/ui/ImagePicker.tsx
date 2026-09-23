import { useRef, useState } from 'react'
import { uploadImage } from '../net/client'
import { Icon } from './Icon'

/** Sube una imagen al servidor de la partida y devuelve su URL. Se usa para tokens de PJ y NPC. */
export function ImagePicker({ value, onChange, color }: { value?: string; onChange: (url: string | undefined) => void; color: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    setError(null)
    try {
      onChange(await uploadImage(f))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="image-picker">
      <button type="button" className="avatar" style={{ background: value ? undefined : color }} onClick={() => input.current?.click()} title="Subir imagen">
        {value ? <img src={value} alt="" /> : <Icon name="upload" size={18} />}
      </button>
      <div className="image-actions">
        <button type="button" className="small-btn" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Subiendo…' : value ? 'Cambiar imagen' : 'Subir imagen'}
        </button>
        {value && (
          <button type="button" className="link" onClick={() => onChange(undefined)}>
            Quitar
          </button>
        )}
        {error && <span className="error small">{error}</span>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  )
}
