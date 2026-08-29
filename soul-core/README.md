# Soul Core: The Great Decay — Phase 3 (Modular Weapons & Auto-Targeting)

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
tunnel (`ngrok http 8000`). Add `?debug=1` for the telemetry overlay.

### URL parameters

| Param        | Example       | Effect                                                   |
| ------------ | ------------- | -------------------------------------------------------- |
| `debug`      | `?debug=1`    | FPS / physics / modifier overlay from the start           |
| `seed`       | `?seed=99`    | Generate a specific sector                                |
| `rocks`      | `?rocks=200`  | Asteroid count                                            |
| `corrosion`  | `?corrosion=0`| Override the decay rate (%/s); `0` = sandbox, no meltdown |

---

## 2. The four core systems

| Gauge         | Colour | Capacity stat | What moves it                                                    | What it costs you                                   |
| ------------- | ------ | ------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| **HULL**      | green  | `maxHull`     | Asteroid impacts, thermal damage while redlined                  | 0 = **HULL BREACH** (run over)                      |
| **POWER**     | cyan   | `maxPower`    | `powerRegen` recharges it; the drive (and later weapons) drain it | An empty capacitor browns the drive out to ~74% thrust |
| **HEAT**      | orange | `maxHeat`     | `coolingRate` dissipates it; burning the drive generates it       | Past `maxHeat`: thrust/turn/top-speed penalties + hull damage |
| **CORROSION** | purple | — (0…100%)    | `corrosionRate` per second, ×3 while overheating                 | 100% = **CORE MELTDOWN** (run over)                 |

Plus **WEIGHT**, the mass the other four have to carry (shown as a `MASS`
readout under the bars, not as a fifth bar).

### Ship stats — `Ship.createStats()`

```js
ship.stats = {
  /* capacities / ratings (upgradable, survive a restart) */
  maxWeight: 100,      // cargo capacity
  maxPower: 100,       // capacitor size
  maxHeat: 100,        // thermal ceiling
  maxHull: 100,        // structural integrity
  coolingRate: 11,     // heat units dissipated per second
  corrosionRate: 0.35, // corrosion % per second
  engineThrust: 2100,  // wu/s² — the raw pull of the drive

  /* live values */
  weight: 0, power: 100, heat: 0, hull: 100, coreCorrosion: 0,
};
```

Ratios (`weightRatio`, `heatRatio`, `powerRatio`, `hullRatio`,
`corrosionRatio`, `overheatSeverity`) are what systems, HUD and modifiers all
speak in. `heatRatio` is the only one allowed past 1 — that's the redline.

### Ship resource API (the seam for weapons/boosters/shields)

```js
ship.consumePower(amount)  // -> units actually delivered (partial = brownout)
ship.generateHeat(amount)  // -> units added (clamped to maxHeat * heatCeiling)
ship.restorePower(amount)
ship.addWeight(amount)     // -> amount that actually fit
ship.jettisonCargo(amount) // -> amount dumped
ship.damage(amount)        // hull; sets alive = false at 0
ship.repair(amount)
ship.cleanCorrosion(amount)
```

### Weight physics (per spec)

```
Actual Acceleration = EngineThrust * (1 - currentWeight / maxWeight)
```

Turn rate uses the same load factor. Measured: empty hold → 2100 wu/s², 50%
load → 1050 wu/s², 100% load → **0** (a full hold cannot accelerate at all —
that is the spec formula; raise `CONFIG.systems.minThrustFactor` /
`minTurnFactor` if you'd rather keep a floor, e.g. `0.15`).

---

## 3. Controls

| Input                        | Action                                          |
| ---------------------------- | ----------------------------------------------- |
| **Drag anywhere (bottom 72%)** | Virtual stick — thrust + steer                 |
| **WASD / arrows**            | Desktop equivalent                              |
| **Tap**                      | Start the run / restart after a game over        |
| **P** / **R**                | Pause / restart run                              |
| **J**                        | Jettison 25% of the hold (get your thrust back)  |
| **` `** / **F3**             | Debug overlay                                    |
| **1 2 3 4 5** / **0** (debug)| +heat · +cargo · +corrosion · −power · −hull · full service |

The stick is anchored **bottom-centre** but can be *grabbed* from the whole
lower screen — you never have to hit a small target with your thumb.

---

## 4. Project structure

```
soul-core/
├── index.html                  Mobile meta tags, canvas, boot-failure panel
├── style.css                   Full-bleed gesture-safe stage + safe-area vars
├── package.json                No deps. `npm start` / `npm test` conveniences
├── tools/                      Headless test suites (zero dependencies)
│   ├── sim.test.js             Physics, weight, power, heat, corrosion, hull
│   ├── combat.test.js          Mounts, arc maths, targeting, lasers, dummies
│   ├── boot.test.js            Real Game vs stubbed DOM: input, HUD, combat, game over
│   └── (see §8)
└── src/
    ├── main.js                 Entry point, URL params, debug handle
    ├── config.js               EVERY tunable number lives here
    ├── core/
    │   ├── Game.js             Orchestrator + run/game-over states
    │   ├── Loop.js             rAF + fixed-step accumulator + interpolation
    │   ├── Camera.js           Follow, look-ahead, clamp, shake, transforms
    │   ├── Viewport.js         Canvas sizing, DPR cap, safe-area, resize chaos
    │   ├── InputManager.js     Pointer/touch/keys -> one normalised axis
    │   ├── EventBus.js         Pub/sub so systems stay decoupled
    │   └── MathUtils.js        clamp, damp, angles, seeded RNG, canvas helpers
    ├── entities/
    │   ├── Entity.js           Base: transform, prev-transform, interpolation
    │   ├── Ship.js             Flight model + stats + ratio getters + resource API
    │   └── Enemy.js            Dummy target + seeded field spawner
    ├── combat/
    │   ├── WeaponMount.js      Hardpoint: local offset, arc constraint, rotation
    │   ├── Weapon.js           Base class for anything bolted to a mount
    │   ├── LaserWeapon.js      Continuous beam: power + heat + dps + beam FX
    │   └── TargetingManager.js Arc/range aware target selection
    ├── world/
    │   └── World.js            Seeded sector: grid, parallax stars, asteroids
    ├── fx/
    │   └── ParticleSystem.js   Fixed-size pool (no GC in the loop)
    ├── systems/
    │   ├── ShipSystem.js       Base class — the extension seam
    │   ├── SystemsManager.js   modifiers pipeline, gauge clamping, reset
    │   ├── WeightSystem.js     load factor -> acceleration + turn rate, cargo
    │   ├── DriveSystem.js      PLACEHOLDER consumer (power) + generator (heat)
    │   ├── PowerSystem.js      Capacitor recharge
    │   ├── HeatSystem.js       Cooling + overheat movement penalties
    │   ├── CorrosionSystem.js  The run timer; emits 'ship:meltdown'
    │   ├── HullSystem.js       All damage intake; emits 'ship:destroyed'
    │   └── WeaponSystem.js     Owns the mounts; drives them each fixed step
    └── ui/
        ├── VirtualJoystick.js  Canvas-drawn stick, multi-touch safe
        └── HUD.js              The four gauge bars + GUNS row + minimap + debug
```

---

## 5. Architecture

### The modifier pipeline

```
        ┌──────────────── SystemsManager (every fixed step) ────────────────┐
stats ─►│ 1. modifiers = all 1                                              │
        │ 2. for each system: update(dt, ship)   — move the gauges           │
        │ 3. for each system: apply(modifiers)   — multiply in its factor    │
        │ 4. clamp every gauge                                              │
        │ 5. ship.modifiers = modifiers                                     │
        └──────────────────────────────┬────────────────────────────────────┘
                                       ▼
                    Ship physics reads ONLY ship.modifiers
```

Systems never touch physics, and physics never asks *why* it's slow. N systems
can influence the same stat, and `systems.explain('thrustMul')` prints the
receipt (also shown live in the debug overlay):

```
thrustMul 0.17 = weight 0.60 x drive 0.50 x heat 0.59
```

### Event-driven damage

`Ship` knows only *"I hit something at speed X"* and emits `ship:impact`.
`HullSystem` subscribes and decides what that costs. Adding shields, armour or
a "cargo bay destroyed" mod later means adding a listener, not editing Ship.

---

## 6. Weapons & auto-targeting

The hull and its guns are independent entities: a mount is bolted to the ship
and owns *where it can point*; a weapon is bolted to a mount and owns *what it
costs*. Neither knows about the other's internals.

```
TargetingManager ──► WeaponMount (traverse arc + rate-limited rotation)
                          └──► Weapon (power draw, heat, damage, beam FX)
```

### Hardpoints (`CONFIG.combat.mounts`)

| Mount  | Offset (local wu) | Arc (degrees, hull-relative) | Coverage |
| ------ | ----------------- | ---------------------------- | -------- |
| **Left**  | `(6, -15)`  | `-90 … +30`  | port beam round to 30° starboard |
| **Right** | `(6, +15)`  | `-30 … +90`  | 30° port round to the starboard beam |
| **Rear**  | `(-20, 0)`  | `180 ± 90`   | the whole back hemisphere |

Local frame: `+x` = nose, `+y` = starboard. The two front arcs overlap ahead
(`-30…+30`) so both can converge on a target in front; the rear arc completes
the circle.

### The arc maths

Arcs are stored as **centre ± half-width**, not min/max, which is what makes
the rear arc — centred on 180°, straddling the ±180° seam — work with the exact
same four lines of code as the side mounts:

```js
// where the mount WANTS to point, in the hull's frame
desiredLocal = wrap(atan2(target - muzzle) - shipAngle);

// nearest legal angle: clamp the offset from the arc centre, the short way round
clamped = centre + clamp(wrap(desiredLocal - centre), -half, +half);

// rate-limited approach (never instant), then a numerical safety clamp
localAngle = rotateToward(localAngle, clamped, turnRate * dt);
localAngle = centre + clamp(wrap(localAngle - centre), -half, +half);
```

Two details that matter:

* **Aiming error is measured against the *unsaturated* desire.** The turret
  parks on the arc limit, but the beam may not bend — so a target outside the
  arc leaves a permanent `aimError` and the weapon stays cold. Verified over a
  full circle sweep: `clampToArc` never returns an out-of-arc angle.
* **Out-of-arc enemies are never locked at all.** Targeting only ever offers a
  mount enemies it can legally face, so with nothing in arc the turret simply
  rests at its arc centre instead of straining at the limit.

### Auto-targeting (`TargetingManager`)

Per mount, per scan: nearest **legal** enemy — alive, inside weapon range, and
inside the mount's world-space arc. Dead enemies are skipped; a lock is dropped
the instant it becomes illegal (killed, out of range, or swung out of arc as
the hull turns).

* `shareTargets: false` — each mount claims its own target, so three guns cover
  three threats instead of lasering the same dummy. Falls back to sharing when
  there aren't enough to go round.
* `retargetDelay` (0.25 s) — re-scanning every step makes mounts flicker
  between equidistant targets.
* `mode` — `'nearest'` (default), `'weakest'`, `'strongest'`.

### Laser (`LaserWeapon`)

A continuous beam: while it is up it drains the capacitor and heats the core
*every step*, and applies `dps * dt` to the target.

| Stat | Value | Note |
| ---- | ----- | ---- |
| `range` | 520 wu | |
| `dps` | 34 | ~1.8 s to cut a 60-hull dummy |
| `powerDraw` | 7 /s | one beam is cheaper than the 13/s recharge… |
| `heatGain` | 13 /s | …but hotter than the 11/s radiators |
| `fireTolerance` | 0.09 rad (~5°) | must be aimed this well to fire |
| `spinUpTime` | 0.15 s | beam fades in/out instead of snapping |

So: **one beam is sustainable, two are break-even, three redline the core in
about four seconds.** When the capacitor can't keep up the beam doesn't cut
out — it weakens (damage scales with the fraction of power actually
delivered), which reads as the laser stuttering under load.

### Dummy enemies

`Enemy` is a full Entity (transform, radius, hull, damage events) that happens
to sit still — hunters and drones of Phase 4 subclass it rather than replace
the combat pipeline. `Enemy.spawnField()` scatters 26 of them: 45% in a ring
around the drop point (instant target practice), the rest across the sector,
never inside an asteroid or on the spawn point. They respawn 6 s after dying so
the range never runs dry.

### Adding a weapon

```js
// src/combat/PlasmaCannon.js
export class PlasmaCannon extends Weapon {
  static id = 'plasma';
  update(dt, ctx) {
    if (this.cooldown > 0) { this.cooldown -= dt; return; }
    const got = ctx.ship.consumePower(18);          // capacitor pays
    ctx.ship.generateHeat(24);                       // core pays
    ctx.particles.burst(6, { x: ctx.mount.muzzleX, ... });
    this.cooldown = 0.6;
  }
}
// register it in WeaponSystem's WEAPON_TYPES, then set
// weaponType: 'plasma' on any mount in CONFIG.combat.mounts.
```

New hardpoints are pure config: add an entry to `CONFIG.combat.mounts` with an
offset, an arc and a `weaponType`.

### Layering
```
Game ─► Camera · InputManager · HUD · VirtualJoystick   (presentation)
     ─► World · Ship · ParticleSystem                   (simulation)
     ─► SystemsManager + the six systems                (the four gauges)
     ─► Loop                                            (time)
```

### Loop & coordinate spaces (unchanged from Phase 1)
Fixed **1/120 s** physics, interpolated render, clamped delta. Verified: the
same 2-second burn lands within **0.8 u/s**, 0.03 heat and 0.000% corrosion at
240 / 120 / 60 Hz. The camera always shows **1000 world units** vertically, so
a tall phone sees more world instead of being zoomed out.

---

## 6. Balance knobs — `src/config.js → systems`

```js
systems: {
  maxHull: 100, impactDamage: 42, impactDamageMinSpeed: 110, thermalDamagePerSecond: 3,
  maxPower: 100, powerRegen: 13, drivePowerDraw: 20, brownoutThrust: 0.25,
  maxHeat: 100, coolingRate: 11, driveHeatGain: 16, heatCeiling: 2.0,
  overheatThrustPenalty: 0.55, overheatTurnPenalty: 0.35, overheatSpeedPenalty: 0.3,
  maxWeight: 100, minThrustFactor: 0, minTurnFactor: 0,
  corrosionRate: 0.35, corrosionHeatMultiplier: 3, meltdownWarning: 0.8,
}
```

Default rhythm: a continuous full-stick burn drains the capacitor in ~14 s
(then the drive runs on reactor output alone at ~74% thrust) and redlines the
core in ~25 s, after which the hull starts cooking at 3/s. Corrosion alone
ends the run in **~4m45s**, roughly three times faster if you live in the red.

Adding a weapon later is two lines, and the balance already accounts for it:

```js
update(dt, ship) {
  if (!ship.firing) return;
  const got = ship.consumePower(WEAPON_DRAW * dt);   // capacitor pays
  ship.generateHeat(WEAPON_HEAT * dt);               // core pays
}
```

---

## 7. Tests

No dependencies, no build step — just Node:

```bash
node tools/sim.test.js     # 58 checks: physics, weight, power, heat, corrosion, hull
node tools/combat.test.js  # 56 checks: mounts, arc maths, targeting, lasers, dummies
node tools/boot.test.js    # 71 checks: real Game booted vs stubbed DOM + 2D context
npm test                   # all three (185+ checks)
```

`boot.test.js` fakes `window`/`document`/canvas, then fires **synthetic pointer
and key events** and inspects **recorded canvas draw calls** — so the virtual
joystick, the HUD's four coloured bars (labels, order, colours, warning text),
pause, rotation, meltdown, explosion and restart are all verified headlessly.

Coverage highlights:
* `accel = engineThrust * (1 - w/max)` verified at 0 / 50 / 100% load
* capacitor drain → brownout → recovery; `consumePower` never overdrafts
* cooling measured against `coolingRate`; overheat penalties stack with weight
* corrosion rate, heat multiplier, single-shot meltdown, warning threshold
* impacts damage the hull, gentle bumps don't, redlining burns it, 0 = destroyed
* restart regenerates the sector and restores every gauge
* arc clamping at every bearing — including the rear mount's ±180° seam
* rate-limited rotation (one step moves at most `turnRate × dt`)
* out-of-arc enemies are never locked and never fired at; locks drop when the
  hull turns them out of arc
* one mount per target, convergence on a lone target, range and dead-enemy rules
* laser DPS, power draw, heat, starvation, and damage/draw/heat being
  identical at 240/120/60 Hz
* in the real Game: dummies spawn, mounts auto-fire, kills are counted, and the
  beam is drawn as an additive stroke in the laser colour

---

## 8. Status

| Requirement                                                       | Status |
| ----------------------------------------------------------------- | ------ |
| Ship stats: `maxWeight`, `maxPower`, `maxHeat`, `coolingRate`, `hull`, `coreCorrosion` | ✅ `Ship.createStats()` |
| Weight physics: acceleration + turn from the weight ratio          | ✅ `WeightSystem` |
| Power/heat placeholder consumer + generator, overheat penalty, cooling | ✅ `DriveSystem` · `PowerSystem` · `HeatSystem` |
| Corrosion grows over time, meltdown at 100% → game over            | ✅ `CorrosionSystem` + game-over state |
| Top HUD: 4 horizontal bars — Hull green, Power cyan, Heat orange, Corrosion purple | ✅ canvas `HUD` |
| Ship + game loop integration                                       | ✅ `SystemsManager` runs every fixed step |
| 3 hardpoints (left / right / rear)                                  | ✅ `WeaponMount` + `CONFIG.combat.mounts` |
| Left `-90…+30`, right `-30…+90` arc restrictions                    | ✅ verified at every bearing |
| Weapons rotate gradually, never instantly                           | ✅ `rotateToward` at `turnRate` rad/s |
| Auto-targeting manager picks the closest valid enemy                | ✅ `TargetingManager` |
| Stationary dummy enemies                                            | ✅ `Enemy` + seeded `spawnField()` |
| Continuous laser beam that consumes power and generates heat        | ✅ `LaserWeapon` |

### Next up (Phase 4 candidates)
Mobile enemies (chase/strafe AI by subclassing `Enemy`) · projectile weapons
through the same `Weapon` base · salvage drops → Weight · repair/coolant
pickups · shield module · meta upgrades that raise the `max*` ratings and swap
`weaponType` on a mount · audio · real sprite atlas behind the palette.
