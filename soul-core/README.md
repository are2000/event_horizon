# Soul Core: The Great Decay — Phase 5 (Combat Loop)

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
| **POWER**     | cyan   | `maxPower`    | `powerRegen` recharges it; the drive, guns and installed-weapon load drain it | An empty capacitor browns the drive out to ~70% thrust |
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
│   ├── inventory.test.js       Items, grid, merging, equipping, drag & drop
│   ├── combat-loop.test.js     Raiders, collision, ramming, scrap, new guns
│   ├── boot.test.js            Real Game vs stubbed DOM: input, HUD, combat, game over
│   └── dom-stub.mjs            ~200-line DOM for headless UI tests
└── src/
    ├── main.js                 Entry point, URL params, debug handle
    ├── config.js               EVERY tunable number lives here
    ├── core/
    │   ├── Game.js             Orchestrator + run/game-over states
    │   ├── Loop.js             rAF + fixed-step accumulator + interpolation
    │   ├── Camera.js           Follow, look-ahead, clamp, shake, transforms
    │   ├── Viewport.js         Canvas sizing, DPR cap, safe-area, resize chaos
    │   ├── InputManager.js     Pointer/touch/keys -> one normalised axis
    │   ├── SpatialHash.js      Uniform-grid broad-phase (dynamic entities)
    │   ├── EventBus.js         Pub/sub so systems stay decoupled
    │   └── MathUtils.js        clamp, damp, angles, seeded RNG, canvas helpers
    ├── entities/
    │   ├── Entity.js           Base: transform, prev-transform, interpolation
    │   ├── Ship.js             Flight model + stats + ratio getters + resource API
    │   ├── Enemy.js            Dummy target + seeded field spawner
    │   ├── Scavenger.js        Raider that chases you and tries to ram you
    │   ├── Scrap.js            Loose currency: drifts, then flies to you
    │   └── ItemPickup.js       Salvage crate floating in the world
    ├── inventory/
    │   ├── ItemDefs.js          The equipment catalogue (pure data)
    │   ├── Item.js              defId + tier -> scaled stats, size, merge rules
    │   ├── Inventory.js         5x6 grid, merge, equip slots, totals
    │   └── InventoryUI.js       DOM overlay: drag & drop, slots, tooltips
    ├── combat/
    │   ├── WeaponMount.js       Hardpoint: local offset, arc constraint, rotation
    │   ├── Weapon.js            Base class for anything bolted to a mount
    │   ├── LaserWeapon.js       Continuous beam: power + heat + dps + beam FX
    │   ├── CannonWeapon.js      Base for every gun that throws something
    │   ├── KineticCannon.js     Slow slug, huge damage, RECOIL
    │   ├── PlasmaCannon.js      Splash damage, cooks your own core
    │   ├── TargetingManager.js  Arc/range aware target selection
    │   ├── ProjectilePool.js    Fixed-size shell pool: simulate + render
    │   └── CollisionSystem.js   Broad-phase grid + separation + ramming
    ├── world/
    │   └── World.js            Seeded sector: grid, parallax stars, asteroids
    ├── fx/
    │   ├── ParticleSystem.js   Fixed-size pool (no GC in the loop)
    │   └── BlastFx.js          Expanding shockwave rings (explosions)
    ├── systems/
    │   ├── ShipSystem.js       Base class — the extension seam
    │   ├── SystemsManager.js   modifiers pipeline, gauge clamping, reset
    │   ├── WeightSystem.js     load factor -> acceleration + turn rate, cargo
    │   ├── DriveSystem.js      PLACEHOLDER consumer (power) + generator (heat)
    │   ├── PowerSystem.js      Capacitor recharge
    │   ├── HeatSystem.js       Cooling + overheat movement penalties
    │   ├── CorrosionSystem.js  The run timer; emits 'ship:meltdown'
    │   ├── HullSystem.js       All damage intake; emits 'ship:destroyed'
    │   ├── WeaponSystem.js     Owns the mounts; drives them each fixed step
    │   └── EquipmentSystem.js  Cargo hold -> ship: mass, power load, bonuses, guns
    └── ui/
        ├── VirtualJoystick.js  Canvas-drawn stick, multi-touch safe
        └── HUD.js              Gauges + scrap chip + GUNS row + minimap + debug
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

## 7. Cargo hold — inventory, merging, hardpoints

The hold is a **5 × 6 grid of cells**, drawn as a DOM overlay on top of the
canvas. Guns live here until they are bolted to a hardpoint; modules work
straight out of the crate.

### Why DOM, not canvas

This one screen is a *touch surface*. Hit testing, hit slop, focus and text all
come free, and drag-and-drop — the interaction that has to feel perfect — is a
solved problem with pointer events. The game keeps rendering behind it; the
panel is just a layer (`#ui-layer`), and `touch-action: none` in CSS stops the
browser from ever stealing a drag.

### Touch rules that shaped the UI

| # | Rule | Why |
| - | ---- | --- |
| 1 | Pointer events only | one code path for finger, stylus and mouse |
| 2 | A drag starts after ~7px | a tap still means "show me the details" |
| 3 | The card is lifted 14px above the finger and scaled 1.06 | a fingertip hides a 60px cell |
| 4 | Every landing zone is colour-coded on pick-up | gold = merges, green = fits, red = refused |
| 5 | Nothing is destroyed by accident | illegal drops snap back; a full hold refuses a swap instead of eating the old gun; jettison needs a deliberate drag onto the chute |

Cells are recomputed from the viewport (38–72px), so a 360×640 phone gets a
53px grid and a 390×844 phone gets 67px — always thumb-sized, always fitting.

### Items

| Item | Size | Tier 1 | Role |
| ---- | ---- | ------ | ---- |
| **Laser** | 1×2 | 34 dps · 7 power/s · 13 heat/s · 3 kg | continuous beam |
| **Cannon** | 1×2 | 30 dmg × 2/s · 9 power/shot · 10 heat/shot · 5 kg | burst shells with travel time |
| **Kinetic** | 1×2 | 85 dmg × 0.9/s · 16 power/shot · 12 heat/shot · 6 kg | slow slug, **recoil** (see §8) |
| **Plasma** | 1×2 | 40 + 46 splash × 1.1/s · 20 power/shot · 38 heat/shot · 7 kg | detonation, cooks the core |
| **Capacitor** | 1×1 | +18 max charge, +2 recharge | 2 kg |
| **Radiator** | 1×1 | +4 cooling, +8 redline | 2 kg |
| **Plating** | 1×1 | +18 max hull | 3 kg |

`Item` holds a `defId` + a `tier` and derives everything else in one place, so
the number in the tooltip, the mass on the scales and the gun on the mount can
never disagree. Per-tier growth (`TIER_SCALE`): damage ×1.7, weight ×1.25,
power ×1.32, splash ×1.45, recoil ×1.25 — climbing the ladder is more
efficient per kilogram, but absolutely harder to run.

### Merging

Drop an item onto an **identical item of the same tier** and they become one
item one tier up, in the target's cell:

```
Laser T1  +  Laser T1  ->  Laser T2   (63 dps, 3.8 kg)
Laser T2  +  Laser T2  ->  Laser T3   (116 dps, 4.7 kg)
...up to T4, which is final
```

Different items, different tiers, and max-tier items are all refused — the drop
is simply invalid, so nothing is ever lost to a fumble. Equipped guns can be
merged **in place**: drop a spare Laser T1 onto the Laser T1 in the LEFT slot
and the ship keeps firing with an upgraded gun (EquipmentSystem rebuilds it).

### Equip slots

Three slots above the grid mirror the ship's hardpoints, each labelled with its
traverse arc (`-90°…30°`, `-30°…90°`, `90°…270°`):

* only **weapons** fit — modules light the slot red
* dropping onto an occupied slot **swaps**, pushing the old gun back into the
  grid (refused if there is no room, rather than destroying it)
* unequipping leaves a visible **empty socket** on the hull, and that mount
  stops scanning for targets entirely
* the mount's art comes from the weapon (`barrel.length / width / color`), so
  swapping a laser for a cannon visibly changes the ship on the canvas

### What gear does to the ship (`EquipmentSystem`)

| Effect | Mechanism |
| ------ | --------- |
| **Mass** | every carried item adds to `stats.weight` → the existing `1 - weight/maxWeight` thrust and turn factor. A full hold is a slow ship. |
| **Power load** | every *installed* weapon bleeds `draw × idleLoadFactor` (0.2) units/s, subtracted from recharge by `PowerSystem`. Guns are not free. |
| **Bonuses** | modules in the grid raise `maxPower`, `powerRegen`, `coolingRate`, `maxHeat`, `maxHull`. |

Everything is applied as a **delta** against what the system last applied, so
it composes with debug cargo and future meta upgrades instead of stomping on
them. The panel shows the three numbers that matter — MASS, LOAD, RECHARGE —
and the HUD status line carries the load next to the mass readout.

Measured with the stock loadout (2 lasers + 1 cannon + 3 modules):

| Situation | Mass | Load | Capacitor empty after | Sustained thrust |
| --------- | ---- | ---- | --------------------- | ---------------- |
| Stock, coasting | 26/100 | 6.4/s | — | 0.74 |
| Stock, full stick | 26/100 | 6.4/s | ~11 s | 0.46 (brownout) |
| Guns removed, full stick | 26/100 | 0 | ~24 s | 0.62 |
| Three T4 lasers, full stick | 18/100 | 9.6/s | ~7 s | 0.40 |
| Hold full of junk | 90/100 | 0 | ~15 s | 0.04 |

### The salvage loop

Dummies drop crates (**55% chance**, capped at 14 in the sector, decaying after
75 s). Fly over one to collect it; a full hold refuses it and says so. Crates
are what turn merging from a one-off puzzle into a loop — and they are also why
the hold fills up and forces decisions.

```js
SoulCore.inventory.addDef('laser', 2)   // spawn an item
SoulCore.inventory.debugString()        // "hold 8 items  26kg  load 6.4/s  left:Laser T1 ..."
SoulCore.pickups.length                 // crates waiting in the sector
```

### Adding an item

One entry in `src/inventory/ItemDefs.js` plus a glyph in `InventoryUI.ICONS`.
A `kind: 'weapon'` item needs a `weaponType` registered in `WeaponSystem`'s
`WEAPON_TYPES`; a `kind: 'module'` item just needs `bonus` keys from
`EquipmentSystem`'s `BONUS_STATS`.

---

## 8. The combat loop — raiders, collision, scrap

Four things had to land together to make the sector feel like a fight instead
of a shooting range: something that moves toward you, a way to decide what
touched what, a reason to close the distance, and guns that behave differently
enough that choosing between them is a decision.

### Scavenger fighters (`src/entities/Scavenger.js`)

An `Enemy` subclass that overrides exactly one method — `_behave()`. Targeting,
arc limits, lasers, shells, hit flashes and the hull ring are all inherited, so
the whole existing combat pipeline works on it unchanged.

They steer rather than slide:

```
desired = bearing to the ship + sine wobble   (a pack drifts in as a cloud)
angle   = rotateToward(angle, desired, turnRate * dt)   // carves, never snaps
```

**The orbit trap.** A pursuer flying at constant speed has a fixed minimum turn
radius `r = speed / turnRate = 250 / 2.0 = 125 wu`. Pointed the wrong way, the
closest its circle ever comes to a stationary ship is `sqrt(d² + r²) - r` — at
200 wu out that is **116 wu**. It orbits forever and never lands a ram, which
makes standing still completely safe. Wrong.

The fix is the classic *arrival* throttle: two speed limits, whichever is
lower.

```
turnCap  = distance * turnRate * 0.6      // never out-fly your own turning circle
alignCap = maxSpeed * (0.35 + 0.65 * cos(bearing error))
speedCap = clamp(min(turnCap, alignCap), 0.3 * maxSpeed, maxSpeed)
```

A raider that is pointed the wrong way slows to a third, pivots tightly, then
drives straight in. Measured from every starting heading at 120–900 wu:
**24/24 raiders now connect**. The weave also fades below 400 wu so the final
approach is a straight line.

They are deliberately slower than the ship (250 vs 560 wu/s). You can always
run from a fight — you cannot run from the corrosion clock, and a loaded
hauler cannot out-turn them. Being heavy is what makes you prey.

### Collision (`src/combat/CollisionSystem.js`)

Every "two things touched" question, in one place, with a uniform-grid
broad-phase in front of it (`src/core/SpatialHash.js`):

* enemies are indexed once per step; the **same grid** is then used by shells,
  by splash queries and by the ship — one index, three consumers
* an entity lives in the single cell containing its centre, so a multi-cell
  query can never return duplicates: no dedupe stamps, no allocation
* buckets are emptied with `length = 0` rather than freed, so a steady-state
  step allocates nothing

Measured on the real loop (best of 2, both sides warmed, 300 shells in flight):

| Raiders in the sector | flat scan | spatial grid | |
| --- | --- | --- | --- |
| 50 | 0.139 ms/step | 0.141 ms/step | parity |
| 120 | 0.260 ms/step | 0.205 ms/step | **1.27x** |
| 240 | 0.492 ms/step | 0.355 ms/step | **1.39x** |

Honest reading: at the sector sizes we ship today (~34 enemies) the two are
within noise — a tight linear scan over 34 entities is genuinely fast. The grid
is what keeps the cost flat as the sector grows, and it is the structure that
lets splash queries ask "what is inside 130 wu" without walking every enemy.
Cell size was swept (48/80/120/180/260) and 140 chosen.

**Ramming** is detected here but *applied* elsewhere: the system emits
`ship:rammed`, and the two gauges that care pick it up —
`HullSystem` takes the hull, `CorrosionSystem` banks the decay chunk. Delete
either system and the other keeps working.

```
contact -> 12 hull + 4% corrosion, once, then a 1.1s cooldown per raider
        -> both hulls shoved apart (240 wu/s) + a positional de-overlap
```

Pack **separation** runs in the same pass: stacked raiders push each other
apart, so a pack arrives as a cloud instead of fusing into one sprite.

### Scrap (`src/entities/Scrap.js`, `CONFIG.economy`)

Salvage crates are *gear*; scrap is a *number*. Different entities, different
systems — scrap can gain a vacuum beam or a shop value later without ever
touching the inventory grid.

```
wreck -> 3-7 scrap per raider -> shards scatter -> drift
      -> inside 240 wu they fly to you -> inside 46 wu they bank
```

The magnet exists for the same reason the drag threshold on the inventory
does: pixel-hunting with a thumb is not a game mechanic. Scrap decays after
60 s (blinking for the last 6), caps at 60 entities, and banks into a lifetime
total that survives death and is shown on the title and game-over screens.

### Two more guns

| | Kinetic Cannon | Plasma Cannon |
| --- | --- | --- |
| Shell | 420 wu/s **slug** — you must lead the target | 560 wu/s bolt |
| Damage | 85 direct, single target | 40 direct **+ 46 splash** in 130 wu |
| Rate | 0.9/s | 1.1/s |
| Cost | 16 power, 12 heat per shot | 20 power, **38 heat** per shot |
| Special | **recoil**: 110 wu/s shove + a camera kick | AoE knockback + shockwave ring |
| Fantasy | a cannon you can steer with | clears a crowd, then redlines you |

Both are `CannonWeapon` subclasses — cooldown, power gating, arc discipline and
muzzle placement are all inherited; only the numbers and one recoil line are
new. Adding a fifth gun is a `CONFIG.combat` block plus a registry entry.

**Recoil is physics, not punishment.** The kick is scaled by how loaded the
ship is: `kick = recoil * duty * (1 - 0.5 * weight/maxWeight)`. A stripped racer
gets thrown around; a heavy hauler shrugs it off. Same inertia that makes cargo
slow to accelerate also makes it steady under fire — being heavy pays you back
for once.

Two notes from tuning it. First, the hull is nearly frictionless by design
(that's the drift feel), so an impulse here is really measured in *distance*:
`v / 0.22` wu of coasting. At the original 300 a two-shot burst threw the ship
1250 wu backwards — out of its own firing range, so the gun went quiet. It is
110 now (about 300 wu per shot): obvious, correctable with the stick, and it no
longer takes the gun out of the fight. Half of what you *feel* is the camera
kick instead. Second, the base value lives in `CONFIG.combat.kinetic.recoil` and
`ITEM_DEFS.kinetic` reads it from there — a copy once drifted, and a T4 gun
quietly kicked 586 wu/s while the config still said 300.

**Plasma is a burst weapon by construction.** ~42 heat/s against 11/s of
cooling redlines the core in about three seconds. You get two or three shots,
then you have to survive the cooldown.

### The ship wears its corrosion

Past `corrosionFxThreshold` (45%) the hull starts throwing purple sparks — 3/s
at the threshold, ~26/s at meltdown — and the plating itself lerps toward the
corrosion purple, with the cockpit flickering. It is the only warning attached
to the *ship* rather than a bar at the top of the screen, so you catch it in
peripheral vision while you are busy shooting.

### New controls

| Input | Action |
| --- | --- |
| `6` (debug) | spawn a raider 260 wu off the nose |
| `7` (debug) | drop 10 scrap next to the ship |
| `8` (debug) | ring the ship with one T2 crate per gun (laser / cannon / kinetic / plasma) |

---

## 9. Balance knobs — `src/config.js → systems`

```js
systems: {
  maxHull: 100, impactDamage: 42, impactDamageMinSpeed: 110, thermalDamagePerSecond: 3,
  maxPower: 100, powerRegen: 16, drivePowerDraw: 23, brownoutThrust: 0.25,
  maxHeat: 100, coolingRate: 11, driveHeatGain: 16, heatCeiling: 2.0,
  overheatThrustPenalty: 0.55, overheatTurnPenalty: 0.35, overheatSpeedPenalty: 0.3,
  maxWeight: 100, minThrustFactor: 0, minTurnFactor: 0,
  corrosionRate: 0.35, corrosionHeatMultiplier: 3, meltdownWarning: 0.8,
}
```

Default rhythm: with nothing installed, a continuous full-stick burn drains the
capacitor in ~24 s (then the drive runs on reactor output alone at ~62% thrust
once the 26 kg starting loadout is aboard) and redlines the core in ~25 s,
after which the hull starts cooking at 3/s. Installing guns shortens that
sharply — see the table in §7. Corrosion alone ends the run in **~4m45s**,
roughly three times faster if you live in the red.

Adding a weapon later is two lines, and the balance already accounts for it:

```js
update(dt, ship) {
  if (!ship.firing) return;
  const got = ship.consumePower(WEAPON_DRAW * dt);   // capacitor pays
  ship.generateHeat(WEAPON_HEAT * dt);               // core pays
}
```

---

## 10. Tests

No dependencies, no build step — just Node:

```bash
node tools/sim.test.js        # 58 checks: physics, weight, power, heat, corrosion, hull
node tools/combat.test.js     # 73 checks: mounts, arc maths, targeting, lasers, dummies
node tools/inventory.test.js  # 114 checks: items, grid, merging, equipping, drag & drop
node tools/combat-loop.test.js# 90 checks: raiders, collision, ramming, scrap, new guns
node tools/boot.test.js       # 81 checks: real Game booted vs stubbed DOM + 2D context
npm test                      # all five (416 checks)
```

`tools/dom-stub.mjs` is a ~200-line DOM (elements, classList, querySelector,
event dispatch, overridable `getBoundingClientRect`) — enough to run the real
inventory UI headlessly, with no jsdom and no dependencies.

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
* grid placement: footprints, overlap, bounds, rotation, "hold is full"
* the merge ladder: same def + same tier climbs one step; different defs,
  different tiers and max tier are all refused; merges keep the target's cell
  and work on equipped guns
* equipping: weapons only, swaps push the old gun back (and refuse when there
  is no room), empty hardpoints stop scanning
* ship integration: mass → thrust factor, installed guns → power load → slower
  recharge, modules → raised ratings, applied exactly once across a restart
* drag & drop driven through real pointer events: move, merge, equip, swap,
  jettison, illegal-drop snap-back, live green/gold/red highlighting, and the
  tap-to-open details card
* the spatial hash: no missed hits, no duplicates, candidates stay local, and a
  query touches a fraction of the sector
* raider AI: closes on the ship, never exceeds its rated speed, steers at most
  `turnRate * dt` per step, ignores you outside aggro range, coasts when you are
  dead, steers around asteroids, and respawns somewhere else
* the orbit trap: raiders connect from every starting heading (the bug this
  test caught was a pursuer circling a stationary ship forever)
* ramming: hull + corrosion + knockback, one bite per cooldown, dummies are not
  a threat, nothing bites outside a live run, and the broad-phase candidate list
  is verified to be a superset of brute force
* scrap: full bounty spilled, magnet vs drift, collection, decay, and banking
* kinetic: slow shell, single target, recoil direction and magnitude, and a
  loaded ship kicking less
* plasma: everything in the blast takes damage with falloff, direct hits hurt
  more, survivors get shoved, a ring is drawn, and sustained fire redlines the
  core
* decay visuals: no sparks when healthy, purple sparks when corroding, more of
  them the worse it gets

---

## 11. Status

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
| 5x6 inventory grid (DOM overlay)                                     | ✅ `InventoryUI` + `style.css` |
| Items with cell sizes (1x1 modules, 1x2 weapons)                     | ✅ `ItemDefs` + `Item` |
| Drag & drop around the grid                                          | ✅ pointer events, 7px threshold |
| Merge: identical item + identical tier -> next tier                  | ✅ `Inventory.merge()` |
| Three equip slots (Left / Right / Rear)                              | ✅ `Inventory.equipped` |
| Equipping updates the ship on canvas + Weight and Power stats        | ✅ `EquipmentSystem` |
| Clear valid / invalid / merge highlighting                           | ✅ gold / green / red cell states |
| Salvage drops so the hold keeps growing                              | ✅ `ItemPickup` + `_maybeDropSalvage()` |
| Enemy that moves toward the player                                    | ✅ `Scavenger` (seek + arrival throttle) |
| Weapon hits reduce enemy HP                                           | ✅ lasers (beam) + shells (`ProjectilePool`) |
| Ramming deals hull damage AND an instant corrosion chunk              | ✅ `CollisionSystem` -> `HullSystem` + `CorrosionSystem` |
| Ram applies knockback                                                 | ✅ 240 wu/s impulse + de-overlap, 1.1s bite cooldown |
| Enemies drop Scrap the player collects by flying over it              | ✅ `Scrap` + magnet + `CONFIG.economy` |
| Kinetic Cannon: slow, high damage, recoil                             | ✅ `KineticCannon` (420 wu/s, 85 dmg, 110 kick + shake) |
| Plasma Cannon: AoE explosion, massive heat                            | ✅ `PlasmaCannon` (130 wu blast, 38 heat/shot) |
| HUD scrap counter                                                     | ✅ chip under the gauges, pulses on pickup |
| Ship visual state at high corrosion                                   | ✅ purple sparks + decay aura + hull tint |
| Optimised collision (broad-phase)                                     | ✅ `SpatialHash`, shared by shells/splash/ship |

### Next up (Phase 6 candidates)
A place to SPEND scrap (a shop between runs, or a meta upgrade tree — the
economy currently has no sink) · raider variants (a fast skirmisher, a tanky
bruiser) that subclass `Scavenger` · enemies that shoot back · consumables
(repair, coolant flush) as inventory items · item rarity/affixes · enemy
projectiles through the same `ProjectilePool` · audio · real sprite atlas
behind the palette.
