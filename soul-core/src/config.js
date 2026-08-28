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

    // Thrust is an acceleration so mass/weight can scale it later.
    baseAccel: 1900, // wu/s² at full stick, no modifiers, at rest

    // TOP SPEED is enforced by thrust falloff, NOT by heavy drag. That is what
    // buys us a long, space-y glide: the ship is limited while accelerating,
    // but nearly frictionless once the stick is released.
    maxSpeed: 560, // wu/s — the cruise speed the tuning aims for
    softMaxSpeed: 620, // wu/s — thrust reaches zero here (falloff curve)
    coastTerminal: 1600, // wu/s — theoretical terminal speed of drag alone
    linearDrag: 0.22, // 1/s — gentle always-on friction
    // Quadratic drag coefficient is derived so that drag alone would only stop
    // accelerating at `coastTerminal`:   dragCoef = baseAccel / coastTerminal²
    get dragCoef() {
      return this.baseAccel / (this.coastTerminal * this.coastTerminal);
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
    margin: 14,
    barHeight: 9,
    barGap: 7,
    labelWidth: 58,
    minBarWidth: 96,
    maxBarWidth: 176,
    barFraction: 0.3, // of viewport width
  },

  /* -------------------------------------------------------------- systems -- */
  // Phase-1 placeholder dynamics for the four planned resource systems.
  // Real numbers will come from the systems themselves (engines draw power,
  // generate heat, corrode the hull...). These just keep the pipeline alive.
  systems: {
    heatCooling: 0.12, // heat units per second, passive radiator
    powerRegen: 0.22, // power units per second back to full
    heatThrottleThreshold: 0.75, // above this, thrust is derated
    heatThrottlePenalty: 0.35, // ...by this fraction at heat == 1
    weightMassFactor: 1.6, // mass multiplier at weight == 1
    corrosionGripPenalty: 0.4, // grip loss at corrosion == 1
    corrosionThrustPenalty: 0.25,
    weightSpeedPenalty: 0.25,
    corrosionSpeedPenalty: 0.15,
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
    hull: '#d7e6ff',
    hullDark: '#7f9dcb',
    accent: '#35e0ff',
    thrust: '#ff7a2f',
    thrustCore: '#ffe6a8',
    asteroid: '#39404d',
    asteroidEdge: '#5d6a7d',
    weight: '#8bd450',
    heat: '#ff7a3c',
    power: '#ffd93d',
    corrosion: '#a86bff',
    text: '#cfe0ff',
    textDim: 'rgba(207, 224, 255, 0.5)',
    barBg: 'rgba(255, 255, 255, 0.08)',
  },
};

export default CONFIG;
