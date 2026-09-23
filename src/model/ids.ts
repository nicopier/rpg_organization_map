export function newId(prefix = ''): string {
  return prefix + crypto.randomUUID().slice(0, 8)
}

/** Clave secreta de una invitación (96 bits): es lo único que identifica a un jugador ante el servidor. */
export function newKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
