# SHIBITO — a SIREN-like horror game

A browser-based, [SIREN](https://en.wikipedia.org/wiki/Siren_(video_game))-inspired
top-down **stealth horror** game. You are trapped in the dark with a *Shibito* that
hunts by sight. Find the key, reach the exit, and stay out of its gaze.

Built with **TypeScript + HTML5 Canvas** and bundled with **Vite** — no game engine,
no runtime dependencies.

## Gameplay

- Only a small area around you and your **flashlight cone** is lit; everything else is darkness.
- The Shibito patrols the halls. Its **red gaze cone** glows through the dark — if it
  sweeps over you with a clear line of sight, it gives chase.
- Break its **line of sight** behind walls to lose it.
- Collect the **key** (yellow), then reach the **exit** (blue) to escape.

### Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move |
| `Shift` | Sneak — quieter and harder to spot, but slower |
| `R` | Restart |

## Development

Requires **Node.js 22+**.

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server at http://localhost:5173
npm run build    # type-check and produce a production build in dist/
npm run preview  # preview the production build
npm run typecheck
```

## Project structure

```
index.html            # canvas host + HUD
src/main.ts           # bootstrap
src/style.css         # UI styling
src/game/
  game.ts             # main loop and state machine
  level.ts            # tile map, collision, line-of-sight
  player.ts           # player movement and stealth
  enemy.ts            # Shibito AI: patrol, vision cone, chase
  pathfind.ts         # grid BFS pathfinding
  renderer.ts         # darkness, flashlight, enemy gaze rendering
  input.ts            # keyboard input
  types.ts            # shared vector math and constants
```

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm install` and runs the Vite
dev server (`npm run dev`) on port `5173` in a persistent terminal.
