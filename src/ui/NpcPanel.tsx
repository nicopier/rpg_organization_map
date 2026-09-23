import { useState } from 'react'
import { useMap, type TokenDraft } from '../state/mapStore'
import { ColorSwatches } from './fields'
import { Icon } from './Icon'
import { ImagePicker } from './ImagePicker'

type Template = Omit<TokenDraft, 'kind' | 'owner'>

// Estadísticas de SRD 5e, redondeadas a lo que se usa en mesa.
const NPC_TEMPLATES: Template[] = [
  { name: 'Goblin', hpMax: 7, ac: 15, speed: 30, initiativeMod: 2, color: '#27ae60', size: 1 },
  { name: 'Kobold', hpMax: 5, ac: 12, speed: 30, initiativeMod: 2, color: '#d35400', size: 1 },
  { name: 'Bandido', hpMax: 11, ac: 12, speed: 30, initiativeMod: 1, color: '#5d6d7e', size: 1 },
  { name: 'Esqueleto', hpMax: 13, ac: 13, speed: 30, initiativeMod: 2, color: '#9e9e9e', size: 1 },
  { name: 'Zombi', hpMax: 22, ac: 8, speed: 20, initiativeMod: -2, color: '#6d4c41', size: 1 },
  { name: 'Lobo', hpMax: 11, ac: 13, speed: 40, initiativeMod: 2, color: '#795548', size: 1 },
  { name: 'Orco', hpMax: 15, ac: 13, speed: 30, initiativeMod: 1, color: '#16a085', size: 1 },
  { name: 'Ogro', hpMax: 59, ac: 11, speed: 40, initiativeMod: -1, color: '#8e44ad', size: 2 },
]

const SIZES = [
  { value: '1', label: 'Mediano 1×1' },
  { value: '2', label: 'Grande 2×2' },
  { value: '3', label: 'Enorme 3×3' },
]

export function NumField({ label, value, onChange, min }: { label: string; value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        onBlur={() => !Number.isFinite(value) && onChange(min ?? 0)}
      />
    </label>
  )
}

/** Deja la herramienta de token lista: cada clic en el mapa agrega uno (Goblin, Goblin 2…). */
export function armToken(d: TokenDraft) {
  const clean: TokenDraft = {
    ...d,
    name: d.name.trim() || (d.kind === 'pc' ? 'Personaje' : 'NPC'),
    hpMax: Math.max(1, Math.round(d.hpMax) || 1),
    ac: Math.round(d.ac) || 10,
    speed: Math.round(d.speed) || 30,
    initiativeMod: Math.round(d.initiativeMod) || 0,
  }
  useMap.getState().setUi({ tokenDraft: clean, tool: 'token', viewer: 'dm' })
  useMap
    .getState()
    .toast(clean.kind === 'npc' ? `Clic en el mapa para colocar ${clean.name}. Cada clic agrega otro.` : `Clic en el mapa para colocar a ${clean.name}.`)
}

export function NpcPanel() {
  const [draft, setDraft] = useState<TokenDraft>({
    name: '',
    kind: 'npc',
    owner: 'dm',
    hpMax: 10,
    ac: 12,
    speed: 30,
    initiativeMod: 0,
    color: '#c0392b',
    size: 1,
  })
  const set = (p: Partial<TokenDraft>) => setDraft((d) => ({ ...d, ...p }))

  return (
    <div className="token-panel">
      <section>
        <h4>NPC rápidos</h4>
        <div className="templates">
          {NPC_TEMPLATES.map((t) => (
            <button key={t.name} className="template" onClick={() => armToken({ ...t, kind: 'npc', owner: 'dm' })} title={`HP ${t.hpMax} · CA ${t.ac}`}>
              <span className="dot" style={{ background: t.color }} />
              {t.name}
              <small>
                {t.hpMax} HP · CA {t.ac}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4>NPC propio</h4>
        <div className="form">
          <ImagePicker value={draft.image} color={draft.color} onChange={(image) => set({ image })} />
          <label>
            Nombre
            <input value={draft.name} placeholder="Ej: Capitán bandido" onChange={(e) => set({ name: e.target.value })} />
          </label>
          <div className="row">
            <NumField label="HP máx" value={draft.hpMax} min={1} onChange={(hpMax) => set({ hpMax })} />
            <NumField label="CA" value={draft.ac} onChange={(ac) => set({ ac })} />
          </div>
          <div className="row">
            <NumField label="Velocidad" value={draft.speed} onChange={(speed) => set({ speed })} />
            <NumField label="Mod. inic." value={draft.initiativeMod} onChange={(initiativeMod) => set({ initiativeMod })} />
          </div>
          <label>
            Tamaño
            <select value={String(draft.size)} onChange={(e) => set({ size: Number(e.target.value) })}>
              {SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="label">Color</span>
            <ColorSwatches value={draft.color} onChange={(color) => set({ color })} />
          </div>
          <button className="primary" onClick={() => armToken(draft)}>
            <Icon name="token" size={16} /> Colocar en el mapa
          </button>
        </div>
      </section>
    </div>
  )
}
