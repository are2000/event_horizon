/**
 * config.js
 * ----------------------------------------------------------------------------
 * Single source of truth for tunable numbers.
 *
 * Why a config module? Every gameplay system we add later (Weight, Heat,
 * Power, Corrosion, weapons, loot...) needs numbers that designers can tweak
 * without hunting through physics code. Keeping them in one frozen-ish object
 * also makes it trivial to load difficulty presets / balance overrides later.
 *
 * Units convention:
 *  - distance  : "world units" (wu). The camera shows ~1000 wu vertically.
 *  - time      : seconds
 *  - angles    : radians (0 = +X / right, positive = clockwise on screen)
 */

export const CONFIG = {
  /* ---------------------------------------------------------------- loop -- */
  loop: {
    // Fixed physics step. Decoupling simulation from render rate makes the
    // inertia/drift behaviour identical on 60Hz and 120Hz phones.
    fixedStep: 1 / 120,
    // If the tab stalls (GC, backgrounding), never simulate more than this
    // much time in one frame — prevents the "spiral of death".
    maxFrameTime: 0.25,
    // Hard cap on catch-up steps per frame (maxFrameTime * fixedStep is ~30).
    maxSteps: 40,
    timeScale: 1,
  },

  /* ------------------------------------------------------------ viewport -- */
  viewport: {
    maxDpr: 2, // retina is nice, 3x on a 6.7" phone is a space heater
    maxPixels: 2600000, // hard budget on backing-store size (perf guard)
  },

  /* -------------------------------------------------------------- camera -- */
  camera: {
    // Height of the visible slice of the world, in world units.
    // Keeping this FIXED (and letting width follow the aspect ratio) means
    // every phone sees the same vertical amount of gameplay — a 21:9 device
    // simply sees more horizontally instead of being zoomed out.
    viewportHeight: 1000,
    smoothing: 6.5, // exponential follow rate (higher = tighter)
    lookAhead: 0.32, // fraction of ship velocity the camera leads by
    maxLookAhead: 240, // ...clamped, so boosting doesn't fling the camera
    shakeDecay: 6, // how fast screen-shake amplitude falls off
    maxShake: 26, // px
  },

  /* --------------------------------------------------------------- world -- */
  world: {
    width: 6000,
    height: 6000,
    gridSize: 200,
    obstacleCount: 110,
    seed: 20260828, // deterministic world (roguelite runs can be replayed)
    starLayers: [
      { count: 120, parallax: 0.15, size: 1.4, alpha: 0.45, color: '#5f7392', twinkle: 0.6 },
      { count: 90, parallax: 0.35, size: 2.0, alpha: 0.65, color: '#9fb4d8', twinkle: 1.1 },
      { count: 55, parallax: 0.62, size: 2.8, alpha: 0.9, color: '#e8f2ff', twinkle: 1.8 },
    ],
  },

  /* ---------------------------------------------------------------- ship -- */
  ship: {
    radius: 20, // collision radius (wu)
    length: 54, // visual length (wu)

    // ENGINE THRUST (wu/s²) — the "Engine Thrust" term in the load formula:
    //   Actual Acceleration = EngineThrust * (1 - currentWeight / maxWeight)
    // Everything else (power, heat, corrosion) multiplies on top of it.
    engineThrust: 2100,

    // TOP SPEED is enforced by thrust falloff, NOT by heavy drag. That is what
    // buys us a long, space-y glide: the ship is limited while accelerating,
    // but nearly frictionless once the stick is released.
    maxSpeed: 560, // wu/s — the cruise speed the tuning aims for
    softMaxSpeed: 620, // wu/s — thrust reaches zero here (falloff curve)
    coastTerminal: 1600, // wu/s — theoretical terminal speed of drag alone
    linearDrag: 0.22, // 1/s — gentle always-on friction
    // Quadratic drag coefficient is derived so that drag alone would only stop
    // accelerating at `coastTerminal`:  dragCoef = engineThrust / coastTerminal²
    get dragCoef() {
      return this.engineThrust / (this.coastTerminal * this.coastTerminal);
    },
    grip: 1.8, // 1/s — how fast sideways velocity is scrubbed (LOW = drifty)
    turnRate: 7.0, // rad/s — how fast the hull rotates toward the stick
    restitution: 0.45, // bounciness against asteroids / world walls
    driftFxThreshold: 90, // wu/s of lateral speed before we draw drift streaks
  },

  /* ------------------------------------------------------------ joystick -- */
  joystick: {
    anchorX: 0.5, // 0.5 = bottom CENTER (shift left when a fire button lands)
    radiusFraction: 0.16, // of min(viewportW, viewportH)
    minRadius: 52,
    maxRadius: 96,
    bottomMargin: 30, // px above the safe-area inset
    deadzone: 0.12, // fraction of radius ignored (thumb jitter)
    // Where a touch "grabs" the stick, in screen fractions (y from top).
    // Bottom 72% of the screen — leaves the top strip for HUD buttons later.
    activation: { x: 0, y: 0.28, w: 1, h: 0.72 },
    knobReturn: 18, // visual snap-back speed when released
    fadeIn: 10,
  },

  /* ----------------------------------------------------------------- hud -- */
  hud: {
    margin: 14, // px from the screen edge (plus safe-area insets)
    maxPanelWidth: 420, // the four-gauge panel never gets wider than this
    barHeight: 13,
    barGap: 6,
    labelWidth: 66, // "CORROSION" is the longest label
    valueWidth: 54, // "100/100" readout column
    minimapFraction: 0.24, // of viewport width
  },

  /* -------------------------------------------------------------- systems -- */
  // The four core systems: HULL (green) · POWER (cyan) · HEAT (orange) ·
  // CORROSION (purple) — plus WEIGHT, which is the mass the other four
  // have to carry. Every number the systems read lives here.
  systems: {
    /* --- HULL ------------------------------------------------------------ */
    maxHull: 100,
    impactDamage: 42, // hull lost on a full-strength impact
    impactDamageMinSpeed: 110, // wu/s — below this, bumps are harmless
    thermalDamagePerSecond: 3, // hull burned while the core is over maxHeat

    /* --- POWER (capacitor) ----------------------------------------------- */
    maxPower: 100,
    // Raised from 13 when the cargo hold landed: three installed guns plus the
    // drive were out-drawing the reactor at rest, which made the *starting*
    // loadout feel broken rather than merely heavy.
    powerRegen: 16, // units/s recharged
    overheatRegenPenalty: 0.5, // recharge multiplier while overheating
    // Retuned in phase 4 (was 20 against 13/s of recharge) to keep the tuned
    // "hold the stick down and the ship eventually sags" feel once the
    // reactor's output was raised: ~14s of burn to empty, then ~0.78 thrust.
    drivePowerDraw: 23, // units/s at full throttle (placeholder consumer)
    brownoutThrust: 0.25, // thrust multiplier with a completely empty capacitor

    /* --- HEAT ------------------------------------------------------------- */
    maxHeat: 100, // thermal ceiling
    coolingRate: 11, // units/s dissipated — the `coolingRate` stat
    driveHeatGain: 16, // units/s generated at full throttle
    heatCeiling: 2.0, // heat may overshoot to 2x maxHeat (the redline band)
    overheatThrustPenalty: 0.55, // at the top of the redline band
    overheatTurnPenalty: 0.35,
    overheatSpeedPenalty: 0.3,

    /* --- WEIGHT ----------------------------------------------------------- */
    maxWeight: 100,
    // The spec formula is `accel = engineThrust * (1 - weight / maxWeight)`.
    // At 100% load that is ZERO thrust — brutal but intentional: cargo
    // management is supposed to matter. Raise these floors to soften it
    // (e.g. 0.15 => an overloaded ship always keeps 15% thrust).
    minThrustFactor: 0,
    minTurnFactor: 0,

    /* --- CORROSION --------------------------------------------------------- */
    corrosionRate: 0.35, // % per second (~4m45s from fresh to meltdown)
    corrosionHeatMultiplier: 3, // corrosion accelerates while overheating
    corrosionGripPenalty: 0.45, // a decayed hull slides more
    corrosionSpeedPenalty: 0.2,
    meltdownWarning: 0.8, // HUD starts screaming at 80%
    corrosionFxThreshold: 0.45, // the hull starts throwing purple sparks at 45%
  },

  /* -------------------------------------------------------------- combat -- */
  // Modular weapons: mounts own WHERE a gun points, weapons own WHAT it costs.
  combat: {
    /* --- dummy targets ----------------------------------------------------- */
    enemies: {
      count: 22,
      radius: 26,
      hull: 60,
      minDistanceFromSpawn: 700, // no target on top of the player at spawn
      respawnDelay: 6, // seconds; 0 = stays dead
    },

    /* --- scavenger fighters ------------------------------------------------ */
    // The first thing that fights back. Slow enough that a light ship can
    // always run, fast enough that an overloaded one cannot — which is the
    // whole point: cargo mass is what makes them dangerous.
    scavengers: {
      count: 12,
      radius: 22,
      hull: 42,
      // Slow enough to be called "slow" (the ship cruises at 560 wu/s), quick
      // enough to catch you while you are turning, braking or hauling cargo.
      speed: 250, // wu/s top speed
      accel: 400, // wu/s^2
      turnRate: 2.0, // rad/s — they carve, they don't pivot
      drag: 0.6, // 1/s
      aggroRange: 1500, // beyond this they just drift
      weave: 0.55, // radians of sine wobble on the approach
      weaveRate: 1.6, // Hz
      respawnDelay: 9, // they come back, but further out
      respawnMinDistance: 1300, // ...never on top of you
      obstacleAvoid: 260, // start steering around rocks this far out

      /* Ramming: hull AND corrosion, then both ships get shoved apart. */
      contactDamage: 12, // hull
      corrosionDamage: 4, // % of the Great Decay, instantly
      knockback: 240, // wu/s impulse shoving the two hulls apart
      ramCooldown: 1.1, // seconds before the same raider can bite again

      /* Separation so a pack doesn't fuse into one blob. */
      separation: 0.6, // strength of the mutual push-apart
    },

    /* --- auto targeting ---------------------------------------------------- */
    targeting: {
      range: 620, // default scan radius when a weapon doesn't say
      mode: 'nearest', // 'nearest' | 'weakest' | 'strongest'
      retargetDelay: 0.25, // seconds between re-scans (stops target flicker)
      shareTargets: false, // false = each mount prefers its own target
    },

    /* --- hardpoints --------------------------------------------------------- */
    // offsets are in the ship's LOCAL frame: +x = nose, +y = starboard.
    // arcs are DEGREES relative to the hull: 0 = straight ahead.
    mounts: [
      // Forward-LEFT: from the port beam (-90°) round to 30° starboard.
      { id: 'left', label: 'L', offset: { x: 6, y: -15 }, arc: { center: -30, half: 60 }, turnRate: 3.6, weaponType: 'laser' },
      // Forward-RIGHT: from 30° port round to the starboard beam (+90°).
      { id: 'right', label: 'R', offset: { x: 6, y: 15 }, arc: { center: 30, half: 60 }, turnRate: 3.6, weaponType: 'laser' },
      // REAR: 180° ± 90° — the whole back hemisphere, complementing the pair
      // up front. Centre/half-width form handles the ±180° seam for free.
      { id: 'rear', label: 'B', offset: { x: -20, y: 0 }, arc: { center: 180, half: 90 }, turnRate: 3.0, weaponType: 'laser' },
    ],

    /* --- weapons ------------------------------------------------------------ */
    laser: {
      name: 'Laser',
      range: 520, // wu
      dps: 34, // hull damage per second at full power
      powerDraw: 7, // capacitor units/s while the beam is up
      // One beam (13/s) barely out-paces the radiators (11/s); a full
      // three-mount broadside (39/s) redlines the core in a few seconds.
      heatGain: 13, // heat units/s while the beam is up
      spinUpTime: 0.15, // seconds to reach full brightness
      fireTolerance: 0.09, // rad (~5°) — must be aimed this well to fire
      minDuty: 0.12, // below this fraction of requested power the beam drops
      width: 3.2, // wu
      color: '#7cf9ff',
      coreColor: '#ffffff',
    },

    /* --- cannon (burst-fire projectiles) ------------------------------------ */
    cannon: {
      name: 'Cannon',
      range: 470, // wu
      damage: 30, // per shell
      shotsPerSecond: 2.0,
      powerPerShot: 9, // capacitor units, per shell
      heatPerShot: 10,
      speed: 900, // wu/s muzzle velocity
      spread: 0.045, // radians of inaccuracy
      projectileRadius: 7,
      projectileLife: 1.4, // seconds
      fireTolerance: 0.12, // rad — chunkier gun, sloppier aim allowed
      color: '#ffd166',
      coreColor: '#fff3c4',
      minDuty: 0.5, // a shell that isn't at least half powered doesn't fire
    },

    /* --- kinetic cannon (slow slug, huge hit, kicks the hull) ---------------- */
    kinetic: {
      name: 'Kinetic',
      range: 520,
      damage: 85, // per slug — the biggest single hit in the game
      shotsPerSecond: 0.9,
      powerPerShot: 16,
      heatPerShot: 12,
      speed: 420, // wu/s — slow enough that leading the target matters
      spread: 0.02,
      projectileRadius: 9,
      projectileLife: 1.5,
      // Recoil, in wu/s of impulse applied opposite the muzzle. Scaled DOWN by
      // how loaded the ship is: a heavy hauler shrugs it off, a stripped racer
      // gets thrown around.
      //
      // Careful: the hull is nearly frictionless by design (that's the drift
      // feel), so an impulse here is measured in DISTANCE, not just velocity —
      // v/0.22 wu of coasting. At 300 a two-shot burst threw the ship 1250 wu
      // backwards, out of its own firing range. 110 shoves you about 300 wu
      // per shot: obvious, correctable with the stick, and it no longer takes
      // the gun out of the fight. The camera kick below sells the weight.
      recoil: 110,
      recoilWeightRelief: 0.5, // 0.5 => a full hold halves the kick
      recoilShake: 2.2, // screen shake on firing (the felt half of the recoil)
      fireTolerance: 0.14, // rad — the fat slug forgives sloppy aim
      color: '#ffb37a',
      coreColor: '#ffe6c4',
      minDuty: 0.6, // a half-charged slug does not fire
    },

    /* --- plasma cannon (splash damage, cooks the core) ----------------------- */
    plasma: {
      name: 'Plasma',
      range: 480,
      damage: 40, // direct hit
      shotsPerSecond: 1.1,
      powerPerShot: 20,
      heatPerShot: 38, // "massive heat": ~42/s sustained, vs 11/s of cooling
      speed: 560,
      spread: 0.03,
      projectileRadius: 10,
      projectileLife: 1.3,
      splashRadius: 130, // wu
      splashDamage: 46, // at the centre, falling off to `splashFalloff`
      splashFalloff: 0.35, // fraction of damage at the very edge
      splashKnockback: 210, // wu/s shove on everything caught in it
      fireTolerance: 0.12,
      color: '#c56bff',
      coreColor: '#f0d4ff',
      minDuty: 0.6,
    },

    /* --- projectiles --------------------------------------------------------- */
    projectiles: {
      capacity: 220,
    },

    /* --- collision broad-phase ---------------------------------------------- */
    // Enemies live in a uniform grid so "what is near this shell / near the
    // ship" is a handful of bucket reads instead of a scan of every entity.
    collision: {
      // Swept against the real loop: 120-180 wu measured fastest for the
      // sector sizes we ship (a 260 wu cell lets a whole raider pack pile into
      // one bucket, which defeats the point).
      cellSize: 140, // wu
    },
  },

  /* -------------------------------------------------------------- economy -- */
  // Scrap is the run currency: enemies drop it, you fly over it, it banks when
  // the run ends. (A place to SPEND it is the next phase.)
  economy: {
    scrap: {
      min: 3, // per scavenger kill
      max: 7,
      dummyBonus: 1, // dummies are worth a token amount
      magnetRange: 240, // wu — inside this it flies to you
      magnetAccel: 1500, // wu/s^2
      pickupRange: 46, // wu — collection happens inside this
      lifetime: 60, // seconds before it decays into the void
      maxEntities: 60, // hard cap on live scrap
      driftSpeed: 40, // wu/s of initial scatter
    },
  },

  /* ------------------------------------------------------------ inventory -- */
  // The cargo hold: a grid of cells, a merge ladder, and three hardpoint slots.
  inventory: {
    cols: 5,
    rows: 6,

    /**
     * Standby draw of an INSTALLED weapon, as a fraction of its firing draw.
     * Bolt three guns on and the reactor has less left over for the capacitor:
     *   3 x Laser T1 (7/s each) => 21 * 0.2 = 4.2/s of lost recharge.
     * Small enough that the starting loadout still flies, big enough that a
     * hold full of T4 guns (100/s of draw) genuinely strands you.
     */
    idleLoadFactor: 0.2,

    /** What the hauler leaves drydock with (two same-tier guns = a free merge). */
    startLoadout: [
      { defId: 'laser', mount: 'left' },
      { defId: 'laser', mount: 'right' },
      { defId: 'cannon', mount: 'rear' },
      { defId: 'laser' },
      { defId: 'cannon' },
      { defId: 'capacitor' },
      { defId: 'radiator' },
      { defId: 'plating' },
    ],

    /* --- salvage drops ------------------------------------------------------- */
    dropChance: 0.55, // chance a destroyed dummy leaves something behind
    maxPickups: 14, // world cap (keeps the sector readable)
    pickupRadius: 46, // wu — collection range from the ship's centre
    pickupLifetime: 75, // seconds before salvage decays into the void
  },

  /* --------------------------------------------------------------- debug -- */
  // Enable via `?debug=1` in the URL or by pressing D at runtime.
  debug: false,

  /* ------------------------------------------------------------- palette -- */
  // Placeholder art palette — swap for real assets later without touching
  // any gameplay code.
  palette: {
    background: '#05060a',
    grid: 'rgba(96, 132, 200, 0.07)',
    gridMajor: 'rgba(96, 140, 220, 0.15)',
    bounds: '#ff4d6d',
    hull: '#d7e6ff', // ship plating (not the hull GAUGE)
    hullDark: '#7f9dcb',
    accent: '#35e0ff',
    thrust: '#ff7a2f',
    thrustCore: '#ffe6a8',
    asteroid: '#39404d',
    asteroidEdge: '#5d6a7d',

    // The four HUD gauges (requested colours).
    gaugeHull: '#4ade80', // green
    gaugePower: '#22d3ee', // cyan
    gaugeHeat: '#ff8a3c', // orange
    gaugeCorrosion: '#a855f7', // purple
    gaugeCritical: '#ff3b5c', // redline / danger

    weight: '#8bd450', // mass readout
    scrap: '#ffc857', // scrap shards + the counter
    blast: '#ffb37a', // explosion rings
    text: '#cfe0ff',
    textDim: 'rgba(207, 224, 255, 0.5)',
    barBg: 'rgba(255, 255, 255, 0.08)',
  },
};

export default CONFIG;
