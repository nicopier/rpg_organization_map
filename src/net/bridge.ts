import type { ClientMsg } from './protocol'

/** Punto único de salida hacia el servidor. Sin conexión, los mensajes se descartan. */
let sender: ((msg: ClientMsg) => void) | null = null

export const net = {
  send(msg: ClientMsg) {
    sender?.(msg)
  },
  setSender(fn: ((msg: ClientMsg) => void) | null) {
    sender = fn
  },
}
