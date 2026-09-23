import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGameServer, lanUrls } from './server/core'

// En dev Vite ya sirve /assets/* porque la carpeta está dentro del root.
// En build la copiamos tal cual a dist/assets, sin mover el original.
function copyAssetPack(): Plugin {
  return {
    name: 'copy-asset-pack',
    apply: 'build',
    closeBundle() {
      cpSync(resolve(import.meta.dirname, 'assets'), resolve(import.meta.dirname, 'dist/assets'), { recursive: true })
    },
  }
}

// En dev el servidor de la partida corre adentro del de Vite: un solo comando, un solo puerto.
function gameServer(): Plugin {
  return {
    name: 'mappaneitor-game-server',
    apply: 'serve',
    configureServer(server) {
      // MAPPA_DATA permite levantar otra instancia (pruebas) sin tocar la campaña de data/.
      const game = createGameServer(process.env.MAPPA_DATA ?? resolve(import.meta.dirname, 'data'))
      server.middlewares.use(game.http)
      server.httpServer?.on('upgrade', (req, socket, head) => {
        game.upgrade(req, socket, head)
      })
      server.httpServer?.once('listening', () => {
        const port = server.config.server.port ?? 5173
        setTimeout(() => {
          console.log('  Jugadores (misma wifi):')
          for (const u of lanUrls(port)) console.log(`    ${u}`)
        }, 50)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), copyAssetPack(), gameServer()],
  // Escucha en la red local para que los jugadores entren desde su compu o celular,
  // y acepta la dirección que da el túnel (npm run tunnel) para jugar por internet.
  server: { host: true, allowedHosts: ['.trycloudflare.com'] },
  // 'assets' queda reservado para el pack; los bundles de Vite van a otra carpeta.
  // Pixi pesa ~600 kB; para una app local no vale la pena partirlo.
  build: { assetsDir: '_app', chunkSizeWarningLimit: 900 },
})
