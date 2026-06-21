# Zombie Survival FPS

A browser-based first-person zombie survival game built with **Three.js** — a demo project for the **AI Coding Agents Masterclass: From Vibe Coding to Agentic Engineering**.

Survive escalating waves of zombies. Difficulty ramps every 30 seconds with faster spawns, tougher enemies, and higher stakes.

## Features

- First-person movement (WASD + mouse look)
- Shooting with headshot bonus
- Wave-based horde spawning
- Time-based difficulty tiers (every 30 seconds)
- Health bar HUD with damage feedback
- Score, kills, and wave tracking

## Controls

| Input | Action |
|-------|--------|
| `W` `A` `S` `D` | Move |
| Mouse | Look around |
| Left click | Shoot |
| `Shift` | Sprint |

## Run locally

No build step required. Open `index.html` in a browser, or serve the folder with any static server:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .
```

Then visit `http://localhost:8080`.

> **Note:** Pointer lock (mouse look) works best when served over `http://localhost`, not `file://`.

## Project structure

```
├── index.html      # Game shell + HUD
├── css/style.css   # UI styles
├── js/game.js      # Game logic, spawning, waves
└── lib/three.min.js
```

## Course

Part of **AI Coding Agents Masterclass** — learn to go from vibe coding to structured agentic engineering with real projects like this one.

## License

MIT — free to use and modify for learning.
