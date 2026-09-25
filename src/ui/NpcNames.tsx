import { setRevealNpcNames } from '../state/actions'
import { useMap } from '../state/mapStore'

/**
 * Los jugadores no deberían saber que el tipo del fondo es "Lord Vecna". Apagado (por defecto)
 * el servidor les manda "NPC 1", "NPC 2"…: pueden seguir la iniciativa sin enterarse de quién es.
 * Es por mapa, y se puede prender en plena partida cuando ya se presentaron.
 *
 * Vive en su propio archivo porque lo usan NpcPanel (Edición) y PlayPanels (Juego), y PlayPanels
 * ya importa de NpcPanel: ponerlo en cualquiera de los dos cerraría un ciclo de imports.
 */
export function NpcNamesToggle() {
  const reveal = useMap((s) => !!s.doc.revealNpcNames)
  const count = useMap((s) => s.doc.characters.length)
  return (
    <section className="form">
      <label className="check">
        <input type="checkbox" checked={reveal} onChange={(e) => setRevealNpcNames(e.target.checked)} />
        Mostrarles el nombre de los NPC
      </label>
      <p className="hint">
        {reveal
          ? `Los jugadores ven el nombre real de los ${count} NPC de este mapa.`
          : 'Los jugadores los ven como “NPC 1”, “NPC 2”… El nombre real no sale de tu PC.'}
      </p>
    </section>
  )
}
