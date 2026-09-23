import { TOKEN_ASSET } from '../model/types'
import { hpColor, initials } from '../render/layers/tokenGraphic'
import {
  clearCombat,
  endCombat,
  removeFromCombat,
  rerollInitiative,
  setInitiative,
  sortInitiative,
  startCombat,
  stepTurn,
} from '../state/actions'
import { useMap } from '../state/mapStore'
import { CommitNumber } from './fields'
import { Icon } from './Icon'

const NONE: string[] = []

/** Selecciona el token de un personaje en el mapa, así el inspector muestra su ficha. */
function selectCharacter(charId: string) {
  const { doc, setUi } = useMap.getState()
  for (const l of doc.layers) {
    const it = l.items?.find((i) => i.assetId === TOKEN_ASSET && i.characterId === charId)
    if (it) return setUi({ selection: { type: 'items', ids: [it.id] }, activeLayerId: l.id })
  }
}

export function InitiativeTracker() {
  const combat = useMap((s) => s.doc.combat)
  const npcs = useMap((s) => s.doc.characters)
  const party = useMap((s) => s.campaign.party)
  const players = useMap((s) => s.campaign.players)
  const isDm = useMap((s) => s.role === 'dm')
  const selectedIds = useMap((s) => (s.selection.type === 'items' ? s.selection.ids : NONE))
  const doc = useMap((s) => s.doc)
  const byId = new Map([...party, ...npcs].map((c) => [c.id, c]))

  const tokensOnMap = doc.layers.some((l) => (l.kind === 'npc' || l.kind === 'game') && l.visible && l.items?.some((i) => i.characterId))

  if (!isDm && !combat.active) return <div className="initiative empty"><p>No hay combate en curso.</p></div>

  if (!combat.active && !combat.order.length) {
    return (
      <div className="initiative empty">
        <p>{tokensOnMap ? 'Tirá iniciativa para todos los personajes que hay en el mapa.' : 'Colocá personajes en el mapa para armar un combate.'}</p>
        <button className="primary block" onClick={startCombat} disabled={!tokensOnMap}>
          <Icon name="sword" size={16} /> Iniciar combate
        </button>
      </div>
    )
  }

  const current = combat.order[combat.turnIndex]?.characterId

  return (
    <div className="initiative">
      {combat.active ? (
        <div className="round-bar">
          {isDm && (
            <button className="icon-btn" onClick={() => stepTurn(-1)} title="Turno anterior">
              <Icon name="prev" size={16} />
            </button>
          )}
          <div className="round">
            <span>Ronda</span>
            <strong>{combat.round}</strong>
          </div>
          {isDm && (
            <button className="primary next" onClick={() => stepTurn(1)} title="Siguiente turno">
              Siguiente <Icon name="next" size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="round-bar paused">
          <span>Combate terminado</span>
          <button className="primary" onClick={startCombat}>
            Retomar
          </button>
        </div>
      )}

      <ol className="order">
        {combat.order.map((e) => {
          const c = byId.get(e.characterId)
          if (!c) return null
          const ratio = c.hp.max > 0 ? Math.max(0, c.hp.cur / c.hp.max) : 0
          const down = c.hp.cur <= 0
          const isTurn = combat.active && e.characterId === current
          const selected = selectedIds.some((id) => doc.layers.some((l) => l.items?.some((i) => i.id === id && i.characterId === c.id)))
          return (
            <li
              key={e.characterId}
              className={`${isTurn ? 'turn' : ''}${down ? ' down' : ''}${selected ? ' selected' : ''}`}
              onClick={() => selectCharacter(c.id)}
            >
              {isDm ? (
                <CommitNumber
                  className="init"
                  value={e.initiative}
                  onCommit={(v) => setInitiative(c.id, v)}
                  onClick={(ev) => ev.stopPropagation()}
                  aria-label={`Iniciativa de ${c.name}`}
                />
              ) : (
                <span className="init">{e.initiative}</span>
              )}
              <span className="token-dot small" style={{ background: down ? '#6b6b6b' : c.color }}>
                {initials(c.name)}
              </span>
              <div className="who">
                <span className="name">
                  {c.name}
                  {c.kind === 'pc' && c.owner !== 'dm' && <small> · {players.find((p) => p.id === c.owner)?.name ?? 'jugador'}</small>}
                </span>
                {/* hp.max 0: ficha ajena que el servidor le manda al jugador sin números. */}
                {c.hp.max > 0 ? (
                  <span className="mini-hp">
                    <span className="bar">
                      <span style={{ width: `${Math.min(1, ratio) * 100}%`, background: `#${hpColor(ratio).toString(16).padStart(6, '0')}` }} />
                    </span>
                    {c.hp.cur}/{c.hp.max}
                    {c.hp.temp > 0 && <em> +{c.hp.temp}</em>} · CA {c.ac}
                  </span>
                ) : (
                  down && <span className="mini-hp">Caído</span>
                )}
                {c.conditions.length > 0 && <span className="conds">{c.conditions.join(', ')}</span>}
              </div>
              {isDm && <button
                className="icon-btn tiny"
                title="Sacar del combate"
                onClick={(ev) => {
                  ev.stopPropagation()
                  removeFromCombat(c.id)
                }}
              >
                <Icon name="x" size={13} />
              </button>}
            </li>
          )
        })}
      </ol>

      {isDm && <div className="init-actions">
        <button onClick={sortInitiative} title="Reordenar después de editar números">
          <Icon name="sort" size={15} /> Ordenar
        </button>
        <button onClick={rerollInitiative} title="Tirar d20 + mod para todos de nuevo">
          <Icon name="dice" size={15} /> Tirar de nuevo
        </button>
        {combat.active ? (
          <button onClick={endCombat}>Terminar</button>
        ) : (
          <button className="danger" onClick={clearCombat}>
            Limpiar
          </button>
        )}
      </div>}
      {isDm && <p className="hint">Los NPC derrotados se saltean solos. Los PJ caídos conservan su turno para las tiradas de muerte.</p>}
    </div>
  )
}
