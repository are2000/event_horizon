# Soul Core: The Great Decay — Phase 1 (Flight Prototype)

A top-down **roguelite space survival** game for **mobile portrait**, built with
**vanilla JavaScript (ES6 classes) + HTML5 Canvas + CSS**. No frameworks, no
build step, no dependencies. All art is placeholder geometry.

> Repo note: this folder is independent from the Unity project in `/Starship`.
> Nothing here touches it.

---

## 1. Run it

ES modules need an HTTP origin (`file://` is blocked by CORS), so serve the
folder with any static server:

```bash
cd soul-core
python3 -m http.server 8000        # then open http://localhost:8000
# or:  npx serve  |  php -S localhost:8000  |  npm start
```

**On a phone:** serve on `0.0.0.0` and open your machine's LAN IP, or use a
tunnel (`ngrok http 8000`). Add `?debug=1` to see the telemetry overlay.

### URL parameters

| Param     | Example      | Effect                                            |
| --------- | ------------ | ------------------------------------------------- |
| `debug`   | `?debug=1`   | FPS / physics / modifier overlay from the start    |
| `seed`    | `?seed=99`   | Generate a specific sector                        |
| `rocks`   | `?rocks=200` | Asteroid count                                    |
| `heat`    | `?heat=1`    | Install the example `ThrusterHeatSystem`           |

---

## 2. Controls

| Input                        | Action                                        |
| ---------------------------- | --------------------------------------------- |
| **Drag anywhere (bottom 72%)** | Virtual stick — thrust + steer              |
| **WASD / arrows**            | Desktop equivalent                            |
| **Tap** (title)              | Start the run                                 |
| **P**                        | Pause · **R** respawn · **\`** or **F3** debug |
| **1 2 3 4** / **0** (debug)  | Bump heat / weight / corrosion, drain power / reset gauges |

The stick is anchored **bottom-centre** but can be *grabbed* from the whole
lower screen — you never have to hit a small target with your thumb.

---

## 3. Project structure

```
soul-core/
├── index.html                  Mobile meta tags, canvas, boot-failure panel
├── style.css                   Full-bleed gesture-safe stage + safe-area vars
├── package.json               No deps. `npm start` / `npm test` conveniences
├── tools/                      Headless test suites (zero dependencies)
│   ├── sim.test.js             Physics, collisions, camera, systems, determinism
│   └── boot.test.js            Boots the real Game against a stubbed DOM
└── src/
    ├── main.js                 Entry point, URL params, debug handle
    ├── config.js               EVERY tunable number lives here
    ├── core/
    │   ├── Game.js             Orchestrator: owns + wires all subsystems
    │   ├── Loop.js             rAF + fixed-step accumulator + interpolation
    │   ├── Camera.js           Follow, look-ahead, clamp, shake, transforms
    │   ├── Viewport.js         Canvas sizing, DPR cap, safe-area, resize chaos
    │   ├── InputManager.js     Pointer/touch/keys -> one normalised axis
    │   ├── EventBus.js         Pub/sub so systems stay decoupled
    │   └── MathUtils.js        clamp, damp, angles, seeded RNG, canvas helpers
    ├── entities/
    │   ├── Entity.js           Base: transform, prev-transform, interpolation
    │   └── Ship.js             Inertia + drift physics, resources, modifiers
    ├── world/
    │   └── World.js            Seeded sector: grid, parallax stars, asteroids
    ├── fx/
    │   └── ParticleSystem.js   Fixed-size pool (no GC in the loop)
    ├── systems/
    │   ├── ShipSystem.js       Base class — the extension seam
    │   ├── SystemsManager.js   resources -> modifiers pipeline
    │   └── ThrusterHeatSystem.js  Worked example (opt-in via ?heat=1)
    └── ui/
        ├── VirtualJoystick.js  Canvas-drawn stick, multi-touch safe
        └── HUD.js              Resource bars, speed/drift, minimap, debug
```

---

## 4. Architecture

### Layering
Dependencies point **inwards**. `Game` is the only file that knows about the
browser (canvas, window events, the loop). Simulation code never touches the
DOM, which is why it can be unit-tested headlessly (see `tools/`).

```
Game ─► Camera · InputManager · HUD · VirtualJoystick   (presentation)
     ─► World · Ship · ParticleSystem                   (simulation)
     ─► SystemsManager + ShipSystem[]                   (Weight/Heat/Power/Corrosion)
     ─► Loop                                            (time)
```

### The loop (fixed step + interpolated render)
`Loop.js` runs physics at a **fixed 1/120 s** and renders once per animation
frame with an `alpha` interpolation factor:

```js
while (accumulator >= fixedStep) { update(fixedStep); accumulator -= fixedStep; }
render(accumulator / fixedStep, frameDt);
```

* Delta time is clamped (`maxFrameTime`) so a stalled tab can't teleport the
  ship through an asteroid.
* Every entity keeps its **previous** transform and lerps toward the current
  one on render → smooth on 60/90/120/144 Hz panels.
* Verified: the same 2-second burn ends within **0.7 u/s** at 240, 120 and
  60 Hz (`tools/sim.test.js`).

### Coordinate spaces
| Space       | Units        | Notes                                                    |
| ----------- | ------------ | -------------------------------------------------------- |
| Device px   | `canvas.width/height` | backing store = CSS box × DPR (capped at 2 and 2.6 MP) |
| CSS px      | `viewport.width/height` | **all drawing and all input** lives here             |
| World units | wu           | camera always shows **1000 wu vertically**, width follows aspect |

Fixing the *vertical* world extent means a tall 21:9 phone sees **more** world
instead of being zoomed out — every device gets the same readable view.

---

## 5. Flight model (the fun part)

Four forces per fixed step, all framerate-independent:

1. **Steering** — the hull rotates toward the stick at `turnRate` (rad/s) via a
   dt-corrected exponential (`dampAngle`). Thrust follows the **heading**, not
   the stick, so momentum always carries you past corners.
2. **Thrust with falloff** — `accel = baseAccel · throttle · (1 − (v/softMax)²)`.
   Top speed is reached smoothly instead of hitting a wall.
3. **Weak drag** — quadratic + linear, tuned so drag alone would only stop
   accelerating at 1600 u/s. This is what makes the glide long and space-y.
4. **Grip / drift** — velocity is split into *forward* and *lateral* relative to
   the hull; only the lateral part is bled off (`exp(-grip · dt)`). Turning
   therefore produces real sideways drift that resolves over ~0.4 s.

Measured behaviour (`tools/sim.test.js`):

| Situation                          | Result                     |
| ---------------------------------- | -------------------------- |
| Full stick, 0.5 s / 3 s            | 496 → 559 u/s (cap 560)    |
| Release at cruise, +0.25 s         | **559 → 480** (still moving!) |
| Release at cruise, +3 s / +10 s    | 151 → 23 u/s               |
| Stick snapped 90° at cruise        | **390 u/s of lateral drift** |

### Tuning knobs — `src/config.js → ship`

| Knob           | Default | Feel                                              |
| -------------- | ------- | ------------------------------------------------- |
| `baseAccel`    | 1900    | Punch off the line                                 |
| `maxSpeed`     | 560     | Target cruise speed                                |
| `softMaxSpeed` | 620     | Where thrust reaches zero                          |
| `coastTerminal`| 1600    | **Lower = draggier, higher = icier**               |
| `linearDrag`   | 0.22    | How quickly a derelict stops                       |
| `grip`         | 1.8     | **Lower = more drift** (Corrosion will eat this)   |
| `turnRate`     | 7.0     | Agility                                            |

---

## 6. Adding a system (Weight / Heat / Power / Corrosion)

The seam is `resources → modifiers → physics`. Systems never touch Ship
physics directly, so N systems can influence the same stat without knowing
about each other.

```js
// src/systems/CargoSystem.js
import { ShipSystem } from './ShipSystem.js';

export class CargoSystem extends ShipSystem {
  static id = 'cargo';

  update(dt, ship) {                       // 1. move the gauge
    const target = this.mass / this.capacity;
    ship.resources.weight += (target - ship.resources.weight) * dt;
  }

  apply(modifiers, ship) {                 // 2. translate to physics
    modifiers.turnRateMul *= 1 - ship.resources.weight * 0.3;
  }
}

// anywhere: game.systems.install(new CargoSystem());
// (install() returns an uninstaller — great for temporary buffs)
```

`SystemsManager` resets the modifier set every step, applies base rules derived
from `ship.resources`, then lets each system multiply on top. The debug overlay
prints the breakdown, so "why is my ship slow?" is always answerable.

The four gauges already exist on `ship.resources` (`weight`, `heat`, `power`,
`corrosion`), the HUD already draws them, and the base rules already respond to
them — press `` ` `` then `2`/`3`/`4` to watch a corroded, overloaded ship fly.

---

## 7. Tests

No dependencies, no build step — just Node:

```bash
node tools/sim.test.js    # 33 checks: physics, collision, camera, systems, determinism
node tools/boot.test.js   # 26 checks: real Game booted against a stubbed DOM + 2D context
npm test                  # both
```

`boot.test.js` fakes `window`/`document`/canvas and then fires **synthetic
pointer and key events**, so the virtual joystick (dead zone, multi-touch,
release), pause, resize/rotation and 300 rendered frames are all verified in CI.

---

## 8. Phase 1 checklist

| # | Requirement                                       | Status |
| - | ------------------------------------------------- | ------ |
| 1 | `index.html`, `style.css`, modular ES6 structure   | ✅ |
| 2 | Responsive canvas, perfect mobile portrait fit     | ✅ DPR-capped, safe-area aware, rotation/visualViewport safe |
| 3 | `requestAnimationFrame` loop with delta time       | ✅ Fixed 1/120 s step + interpolated render |
| 4 | 2D camera following the ship in a bigger world     | ✅ Smoothing, look-ahead, bounds clamp, shake; 6000×6000 wu sector |
| 5 | On-screen virtual joystick (bottom centre)         | ✅ Canvas-drawn, dead zone, multi-touch safe, keyboard fallback |
| 6 | Modular player ship entity                         | ✅ `Entity` → `Ship`, update/render contract, context injection |
| 7 | Inertia + drifting (no instant stops)              | ✅ Thrust falloff, weak drag, lateral grip |
| 8 | Architecture ready for Weight/Heat/Power/Corrosion | ✅ `ShipSystem` + `SystemsManager` + live gauges + HUD |

### Next up (Phase 2 candidates)
Weapons & auto-fire button (right thumb) · enemy waves · salvage/cargo → Weight
· reactor heat & power budgeting · hull corrosion · run/meta progression ·
audio · real sprite atlas swap-in behind the palette in `config.js`.
