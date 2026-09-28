# Mappaneitor

Editor de mapas y mesa virtual para D&D. El DM arma los mapas y corre la partida desde su PC; los jugadores entran desde el navegador (compu o celular) con un link de invitación.

## Requisitos

- [Node.js](https://nodejs.org) 22 o más nuevo.
- Para jugar por internet: `cloudflared` (una sola vez: `winget install --id Cloudflare.cloudflared`).

## Comandos

```bash
npm install        # la primera vez
npm run dev        # para desarrollar: DM en http://localhost:5173
npm start          # para jugar: compila y abre el DM en http://localhost:3000
npm run tunnel     # dirección pública hacia npm start (jugar por internet)
npm run tunnel:dev # lo mismo, hacia npm run dev
```

`npm run dev` y `npm start` usan la misma campaña: prendé uno solo a la vez.

## Jugar con gente, paso a paso

**1. Prendé Mappaneitor** en una terminal y esperá a que diga "Mappaneitor listo":

```bash
npm start
```

**2. Entrá como DM** en http://localhost:3000. La vista del DM sólo se abre desde esta PC.

**3. Elegí la dirección para los links**:

- **Misma wifi**: en **Invitar → Dirección de esta PC** elegí la dirección de tu red (`http://192.168…`). Si no carga desde otro dispositivo, permití Node.js en el firewall de Windows (redes privadas).
- **Por internet**: en **otra** terminal corré `npm run tunnel` y dejala abierta. La dirección pública se carga sola en **Invitar** (aparece como "internet, automática"); si reiniciás el túnel, se actualiza sola.

**4. Generá las invitaciones**: en **Invitar**, poné cuántos jugadores son y tocá **+ invitaciones**. Después **Copiar todos** y mandá los links (uno por persona).

**5. Que entren**: cada uno abre su link, pone su nombre y crea su personaje con su imagen. En Invitar se les prende el punto verde cuando están conectados.

**6. Traelos al mapa**: abrí el mapa, pasá a **modo Juego** y en el panel **Party** tocá **Traer toda la party** (o marcá a algunos y traé sólo a esos). Después hacé clic en el mapa donde entran.

**Al terminar**: `Ctrl+C` en las terminales. La campaña queda guardada.

**La próxima sesión**: repetí los pasos 1 a 3. El túnel da una dirección nueva cada vez, así que reenviá los links desde Invitar (las claves de cada jugador no cambian).

## Qué hace

- **Árbol de mapas**: carpetas y mapas se anidan sin límite (un mapa puede tener submapas: Patio › Cripta › Sala del jefe). Se reordenan arrastrando. El panel se esconde con **«** para ganar lugar.
- **Modo Edición**: salas automáticas estilo Dungeon Scrawl (las formas que se tocan se funden, con contorno y rayado), piso con los tiles del pack, puertas y puertas secretas sobre los bordes, objetos del pack respetando su tamaño (`bed1x2`, `beddouble2x2`…) y NPCs.
- **Modo Juego**: niebla de guerra, marcas de la sesión, tracker de iniciativa y fichas (HP, CA, estados, notas). Durante un combate la iniciativa queda en su propia columna, al lado del Inspector.
- **Cuatro capas fijas**: Piso, Objetos, NPC y Juego. Las paredes son dibujo: no bloquean tokens.
- **Oculto para jugadores**: cualquier objeto o puerta. `P` muestra el mapa como lo ven ellos; la puerta secreta se ve como pared hasta revelarla.
- **Notas del DM**: clic derecho sobre un objeto → **Agregar notas y datos**; queda marcado con un aura que sólo ve el DM.

## Durante la partida (DM)

- **Mover y borrar**: en modo Juego movés y borrás objetos, NPCs y marcas. Los personajes de los jugadores quedan fijos para no tocarlos sin querer; **Alt + arrastrar** los mueve igual.
- **Congelar jugadores**: el botón de la barra de arriba bloquea el movimiento de todos. El candado de cada personaje en **Party** bloquea sólo a ese. El jugador ve el aviso y el servidor rechaza sus movimientos.
- **Party separada**: cada jugador ve el mapa donde está su personaje; en **Party** se ve dónde está cada uno (General › Patio › Cripta).

## Bestiario (Manual de monstruos)

- **Pestaña Bestiario** (en Edición y en Juego): buscá entre las ~445 criaturas del manual y **Colocar** pone el token ya vinculado.
- **Ver hoja**: abre el PDF en la página de esa criatura, en una ventana que se arrastra y se agranda desde la esquina. En el Inspector de un NPC también está el botón, y ahí se puede vincular cualquier NPC con su criatura.
- **El PDF**: copialo a la carpeta del proyecto con "monstruo" en el nombre (o poné la ruta en `MAPPA_MANUAL`). Sólo lo ve el DM y no se sube al repo.
- **Imágenes de referencia**: **Google** abre la búsqueda (por el nombre, o la que escribas). Copiá la dirección de la imagen o la imagen misma y pegala, o arrastrala a la caja. **Mostrar** se la muestra a los jugadores en un cartel; **Ocultar** o **Dejar de mostrar** la saca. Se apagan todas con la casilla de arriba del Bestiario.

## Dados y chat

- **Panel Dados** (a la izquierda en modo Juego; el DM lo alterna con **Mapas**): clic suma un dado, clic derecho lo saca, más modificador y ventaja/desventaja. En el chat, `/r 1d20+5 Ataque` tira con etiqueta (entiende `2d6+3`, `4d6kh3`, `d%`, `1d20 adv`).
- **Sin trampa**: el servidor tira y los dados 3D caen en ese resultado. Clic en el total repite la tirada.
- **Secretas**: el DM tira en secreto; un jugador puede tirar "sólo al DM". Los demás ven que alguien tiró, no qué salió.
- **Chat y susurros**: mensajes para todos o susurros a un jugador o al DM (el DM ve todos los susurros). El log queda guardado en `data/log.json`; el DM lo vacía desde **Opciones**.

## Jugadores y seguridad

- En **Invitar** el DM genera un link por jugador. Sin link no se entra. **↻** da un link nuevo (el anterior deja de andar y quien lo usaba queda afuera); **🗑** quita la invitación.
- Cada jugador edita sólo su ficha. De los demás personajes y de los NPC ve el token, no los números.
- El servidor filtra lo que manda a cada jugador: nada oculto, nada bajo la niebla, ninguna nota del DM, ninguna clave de invitación.
- La vista del DM sólo se abre desde la PC donde corre el servidor, también cuando se usa un túnel.

La campaña se guarda en `data/campaign.json` y las imágenes subidas en `data/uploads/`. Esa carpeta tiene las claves de las invitaciones: no se sube al repo. El navegador del DM guarda además un respaldo, y **Ctrl+S** exporta la campaña a un archivo.

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

En modo Juego: `N` niebla, `O` marca, `Alt`+arrastrar mueve un personaje de jugador. Para mover el mapa sin zoom: herramienta **Mano**, clic derecho + arrastrar, `Espacio` + arrastrar o la rueda apretada.

## Si algo no anda

- **"cloudflared no se reconoce"**: `npm run tunnel` lo busca solo en su carpeta de instalación; si igual falla, cerrá y abrí VS Code.
- **Arranca en otro puerto (5174…)**: ya hay otro Mappaneitor prendido. Cerralo antes, porque los dos escribirían la misma campaña.
- **Un jugador dice que necesita invitación**: tiene que abrir su link completo (`…/?play&k=…`), no la dirección sola.

## Assets

`assets/` es el pack CC0 de Mark Gosbell (70 px = 1 casilla). Para sumar assets, copiá los PNG a esa carpeta con el tamaño en el nombre (`mesa3x1.png`) y corré `npm run catalog` (el `dev` y el `start` lo hacen solos). Los nombres en castellano van en `src/assets/overrides.ts`.
