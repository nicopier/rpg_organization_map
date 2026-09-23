import { useMemo, useState } from 'react'
import { ASSETS, assetUrl } from '../assets/catalog'
import { CATEGORY_LABELS } from '../assets/overrides'
import type { AssetCategory, AssetDef } from '../assets/types'
import { useMap } from '../state/mapStore'
import { ColorSwatches, Segmented } from './fields'

const FLAT_COLORS = ['#2b2b2b', '#5b4a3a', '#7a6a55', '#9c8f7a', '#c9bfa8', '#3f5a3a', '#2f4f6f', '#6b2f2f']
const ORDER: AssetCategory[] = ['floor', 'structure', 'prop', 'effect', 'marker']

/** Paleta de assets. `categories` limita qué se muestra (Piso, Objetos, Marcas usan la misma paleta). */
export function AssetPalette({ categories = ORDER }: { categories?: AssetCategory[] }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<AssetCategory | 'all'>('all')
  const catKey = categories.join()
  const shown = useMemo(() => ORDER.filter((c) => catKey.split(',').includes(c)), [catKey])
  const tool = useMap((s) => s.tool)
  const brush = useMap((s) => s.floorBrush)
  const placeId = useMap((s) => s.placeAssetId)
  const paintRect = useMap((s) => s.paintRect)

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = (a: AssetDef) =>
      (cat === 'all' || a.category === cat) && (!needle || a.label.toLowerCase().includes(needle) || a.id.toLowerCase().includes(needle))
    return shown.map((c) => ({ c, items: ASSETS.filter((a) => a.category === c && match(a)) })).filter((g) => g.items.length)
  }, [q, cat, shown])

  const pick = (a: AssetDef) => {
    const s = useMap.getState()
    if (a.category === 'floor') s.setUi({ floorBrush: { assetId: a.id }, tool: 'paint' })
    else s.setUi({ placeAssetId: a.id, tool: 'place', placeRot: 0, placeFlip: false })
  }

  const isOn = (a: AssetDef) =>
    a.category === 'floor' ? tool === 'paint' && 'assetId' in brush && brush.assetId === a.id : tool === 'place' && placeId === a.id

  return (
    <div className="palette">
      <input className="search" type="search" placeholder="Buscar asset…" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length > 1 && <div className="chips">
        <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
          Todos
        </button>
        {shown.map((c) => (
          <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>}

      {categories.includes('floor') && (cat === 'all' || cat === 'floor') && !q && (
        <section className="brush-box">
          <div className="section-head">
            <h4>Pincel de piso</h4>
            <Segmented
              small
              value={paintRect ? 'rect' : 'brush'}
              onChange={(v) => useMap.getState().setUi({ paintRect: v === 'rect' })}
              options={[
                { value: 'brush', label: 'Pincel', title: 'Arrastrar pinta casilla por casilla' },
                { value: 'rect', label: 'Rectángulo', title: 'Arrastrar rellena un rectángulo (también con Shift)' },
              ]}
            />
          </div>
          <p className="hint">Color liso:</p>
          <ColorSwatches
            colors={FLAT_COLORS}
            value={'color' in brush ? brush.color : ''}
            onChange={(color) => useMap.getState().setUi({ floorBrush: { color }, tool: 'paint' })}
          />
          <p className="hint">Alt+clic en el mapa toma el piso de una casilla.</p>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.c}>
          <h4>{CATEGORY_LABELS[g.c]}</h4>
          <div className="asset-grid">
            {g.items.map((a) => (
              <button
                key={a.id}
                className={`asset${isOn(a) ? ' on' : ''}`}
                onClick={() => pick(a)}
                title={`${a.label} (${a.w}×${a.h})`}
                draggable={false}
              >
                <span className="thumb">
                  <img src={assetUrl(a)} alt="" loading="lazy" draggable={false} />
                </span>
                <span className="asset-label">{a.label}</span>
                {(a.w > 1 || a.h > 1) && (
                  <span className="size">
                    {a.w}×{a.h}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className="hint">Nada coincide con “{q}”.</p>}
    </div>
  )
}
