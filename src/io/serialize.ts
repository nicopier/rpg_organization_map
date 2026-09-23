import type { Campaign } from '../model/types'

function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'campana'
  )
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Descarga la campaña entera (zonas, mapas, party, jugadores). Las imágenes subidas quedan en data/uploads. */
export function exportCampaign(c: Campaign) {
  download(`${slug(c.name)}.campana.json`, c)
}

export async function readJsonFile(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text())
  } catch {
    throw new Error(`"${file.name}" no es un JSON válido.`)
  }
}
