# Mappaneitor

Editor de mapas y mesa virtual para D&D. El DM arma los mapas y corre la partida desde su PC; los jugadores entran desde el navegador (compu o celular) con un link de invitación.

```bash
npm install
npm run dev        # DM en http://localhost:5173
npm start          # versión compilada en http://localhost:3000
npm run tunnel     # dirección pública para jugar por internet (necesita cloudflared)
```

## Qué hace

- **Campaña con zonas y mapas**: el panel izquierdo agrupa los mapas por zona. La party es de la campaña y viaja entre mapas ("Llevar la party").
- **Modo Edición**: salas automáticas estilo Dungeon Scrawl (las formas que se tocan se funden, con contorno y rayado), piso con los tiles del pack, puertas y puertas secretas sobre los bordes, objetos del pack respetando su tamaño (`bed1x2`, `beddouble2x2`…) y NPCs.
- **Modo Juego**: niebla de guerra, marcas de la sesión, tracker de iniciativa y fichas (HP, CA, estados, notas).
- **Cuatro capas fijas**: Piso, Objetos, NPC y Juego. Las paredes son dibujo: no bloquean tokens.
- **Oculto para jugadores**: cualquier objeto o puerta. `P` muestra el mapa como lo ven ellos; la puerta secreta se ve como pared hasta revelarla.
- **Notas del DM**: clic derecho sobre un objeto para cargarle notas y datos; queda marcado con un aura que sólo ve el DM.

## Jugadores

- En **Invitar** el DM genera un link por jugador. Sin link no se entra; un link nuevo invalida el anterior y deja afuera a quien lo usaba.
- Cada jugador pone su nombre, crea su personaje con su imagen y edita sólo su ficha. De los demás personajes y de los NPC ve el token, no los números.
- El servidor filtra lo que manda a cada jugador: nada oculto, nada bajo la niebla, ninguna nota del DM.
- La vista del DM sólo se abre desde la PC donde corre el servidor, también cuando se usa un túnel.

La campaña se guarda en `data/campaign.json` y las imágenes subidas en `data/uploads/` (fuera del repo). El navegador del DM guarda además un respaldo.

## Atajos

| Tecla | Edición | Tecla | |
|---|---|---|---|
| `V` | Seleccionar | `R` / `F` | Rotar / espejar |
| `D` | Sala | `H` | Ocultar / revelar |
| `B` | Piso | `P` | Vista de jugador |
| `W` | Puerta | `Ctrl+D` | Duplicar |
| `O` | Objeto | `Supr` | Borrar |
| `T` | NPC | `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `E` | Goma | `Ctrl+S` | Exportar la campaña |
| `M` | Regla | `Espacio`+arrastrar | Mover la vista |

En modo Juego: `N` niebla, `O` marca. Para mover el mapa sin zoom: herramienta **Mano**, clic derecho + arrastrar, `Espacio` + arrastrar o la rueda apretada.

## Assets

`assets/` es el pack CC0 de Mark Gosbell (70 px = 1 casilla). Para sumar assets, copiá los PNG a esa carpeta con el tamaño en el nombre (`mesa3x1.png`) y corré `npm run catalog` (el `dev` lo hace solo). Los nombres en castellano van en `src/assets/overrides.ts`.
