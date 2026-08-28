/**
 * Game.js
 * ----------------------------------------------------------------------------
 * The orchestrator. It owns every subsystem, wires them together, and is the
 * ONLY place that knows about the browser (canvas, window events, the loop).
 *
 * Layering (strict — dependencies point inwards):
 *
 *   Game  ──►  Camera, InputManager, HUD        (presentation + input)
 *         ──►  World, Ship, Particles          (simulation)
 *         ──►  SystemsManager + ShipSystem[]    (the Weight/Heat/Power/
 *                                                Corrosion extension seam)
 *         ──►  Loop                             (time)
 *
 * Frame flow
 *   Loop.update(fixedStep)  ->  Game.update(dt)   (deterministic simulation)
 *   Loop.render(alpha, dt)  ->  Game.render(...)  (interpolated presentation)
 *
 * Adding a new system later is intentionally boring:
 *   game.systems.install(new ReactorSystem({ draw: 0.1 }))
 * ...and it starts affecting thrust through `modifiers` on the next step.
 */
import { CONFIG } from '../config.js';
import { Ship } from '../entities/Ship.js';
import { ParticleSystem } from '../fx/ParticleSystem.js';
import { SystemsManager } from '../systems/SystemsManager.js';
import { WeightSystem } from '../systems/WeightSystem.js';
import { DriveSystem } from '../systems/DriveSystem.js';
import { PowerSystem } from '../systems/PowerSystem.js';
import { HeatSystem } from '../systems/HeatSystem.js';
import { CorrosionSystem } from '../systems/CorrosionSystem.js';
import { HullSystem } from '../systems/HullSystem.js';
import { HUD } from '../ui/HUD.js';
import { VirtualJoystick } from '../ui/VirtualJoystick.js';
import { World } from '../world/World.js';
import { Camera } from './Camera.js';
import { EventBus } from './EventBus.js';
import { InputManager } from './InputManager.js';
import { Loop } from './Loop.js';
import { Viewport } from './Viewport.js';
import { clamp, font, TAU } from './MathUtils.js';

/**
 * Install order == update order for the core systems:
 *   weight     — load factor (read by physics the same step)
 *   drive      — the placeholder consumer: draws power, generates heat
 *   power      — capacitor recharge
 *   heat       — cooling + overheat penalties
 *   corrosion  — the run timer; emits 'ship:meltdown' at 100%
 *   hull       — damage intake; emits 'ship:destroyed' at 0
 */
const CORE_SYSTEM_ORDER = ['weight', 'drive', 'power', 'heat', 'corrosion', 'hull'];

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   */
  constructor(canvas, opts = {}) {
    /* ------------------------------------------------------- presentation -- */
    this.viewport = new Viewport(canvas, opts.viewport);
    this.camera = new Camera(this.viewport, opts.camera);

    /* ---------------------------------------------------------- messaging -- */
    this.events = new EventBus();

    /* -------------------------------------------------------------- input -- */
    this.joystick = new VirtualJoystick(this.viewport, opts.joystick);
    this.input = new InputManager(this.viewport, this.events, { joystick: this.joystick });

    /* --------------------------------------------------------- simulation -- */
    this.world = opts.world ?? new World(opts.worldOpts);
    this.ship = opts.ship ?? new Ship({ x: this.world.width * 0.5, y: this.world.height * 0.5 });
    this.particles = new ParticleSystem(opts.particleCapacity ?? 512);
    this.systems = new SystemsManager(this.ship, this.events);

    /* The five core systems (Weight / Power / Heat / Corrosion / Hull) plus
       the drive that consumes power and generates heat. Handy from devtools:
       SoulCore.core.weight.addCargo(40) */
    this.core = {
      weight: new WeightSystem(),
      drive: new DriveSystem(),
      power: new PowerSystem(),
      heat: new HeatSystem(),
      corrosion: new CorrosionSystem(),
      hull: new HullSystem(),
    };
    // Install order == update order: consumers run before the gauges they
    // feed (drive draws power, then the capacitor recharges...).
    for (const key of CORE_SYSTEM_ORDER) this.systems.install(this.core[key]);

    /* ----------------------------------------------------------------- ui -- */
    this.hud = new HUD(this.viewport, this.ship);

    /* -------------------------------------------------------------- state -- */
    /** 'title' | 'playing' | 'gameover' */
    this.state = 'title';
    // Movement input stays off until the run starts, so a stray thumb on the
    // title screen can't fly the ship around behind the overlay.
    this.input.enabled = false;
    this.paused = false;
    this.time = 0; // total time since boot (drives UI animation)
    this.runTime = 0; // time survived in the current run
    this.endReason = null; // 'meltdown' | 'destroyed'
    this.runsCompleted = 0;
    this.debug = opts.debug ?? CONFIG.debug;

    /* --------------------------------------------------------------- loop -- */
    this.loop = new Loop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
      fixedStep: opts.fixedStep ?? CONFIG.loop.fixedStep,
    });

    /* Reused objects — the loop must not allocate. */
    this.updateContext = {
      input: this.input,
      world: this.world,
      particles: this.particles,
      camera: this.camera,
      events: this.events,
      systems: this.systems,
      time: 0,
      dt: 0,
    };
    this._renderInfo = {
      loop: this.loop,
      input: this.input,
      world: this.world,
      systems: this.systems,
      particles: this.particles,
      camera: this.camera,
      debug: this.debug,
      state: this.state,
      frameDt: 0,
    };
    this._camTarget = { x: 0, y: 0, vx: 0, vy: 0 };
  }

  /* ================================================================ setup == */

  init() {
    // Size the canvas before anything reads the viewport.
    this.viewport.resize();

    const b = this.world.bounds;
    this.camera.setBounds(b.x, b.y, b.width, b.height);
    this.camera.snapTo(this.ship.x, this.ship.y);

    this.joystick.layout();
    this.hud.layout();

    this._bindEvents();
    this.input.attach();

    this.loop.start();
    return this;
  }

  _bindEvents() {
    const onResize = () => this.onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // iOS: the visual viewport changes when the URL bar collapses or the
    // keyboard shows up — a plain 'resize' doesn't always fire.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
    }
    // Some browsers settle the layout a frame or two after rotating.
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

    this.viewport.onResize(() => {
      this.joystick.layout();
      this.hud.layout();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.paused = true;
        document.body.classList.add('is-hidden');
      } else {
        this.paused = false;
        document.body.classList.remove('is-hidden');
        // Drop the "time away" so the ship doesn't jump on resume.
        this.loop.resetTiming();
      }
    });

    // Start (or restart) the run on the first touch / click / key.
    this.events.on('input:tap', () => this._onConfirm());
    this.events.on('input:down', () => this._onConfirm());
    this.events.on('input:key', ({ code }) => this._onKey(code));

    /* --- the run ends when the core systems say so ------------------------ */
    this.events.on('ship:meltdown', () => this._endRun('meltdown'));
    this.events.on('ship:destroyed', () => this._endRun('destroyed'));
    this.events.on('ship:damaged', ({ amount }) => {
      // Screen flash scaled by how hard we were hit.
      this.hud.flash = Math.min(1, this.hud.flash + amount / 55);
    });
  }

  /** Tap / click: start the run, or restart after a game over. */
  _onConfirm() {
    if (this.state === 'title') this.startRun();
    else if (this.state === 'gameover') this.restart();
  }

  onResize() {
    this.viewport.resize();
    // Bounds depend on the zoom (which depends on viewport height).
    const b = this.world.bounds;
    this.camera.setBounds(b.x, b.y, b.width, b.height);
    this.camera.clampToBounds();
  }

  /* ============================================================== control == */

  startRun() {
    if (this.state === 'playing') return;
    this.state = 'playing';
    this.input.enabled = true;
    this.runTime = 0;
    this.events.emit('run:start', { ship: this.ship, world: this.world });
  }

  /**
   * End the run. Called by the 'ship:meltdown' (corrosion hit 100%) and
   * 'ship:destroyed' (hull hit 0) events, so the Game never has to poll the
   * gauges — the systems decide when you die.
   * @param {'meltdown'|'destroyed'} reason
   */
  _endRun(reason) {
    if (this.state !== 'playing') return;
    this.state = 'gameover';
    this.endReason = reason;
    this.input.enabled = false;
    this.ship.alive = false;
    this.ship.visible = false; // the wreck is now debris + particles
    this.hud.flash = 1;
    this._explode();
    this.runsCompleted++;
    this.events.emit('run:end', { reason, time: this.runTime, ship: this.ship });
  }

  /** Big, cheap, satisfying explosion: three debris shells + full shake. */
  _explode() {
    const { x, y } = this.ship;
    this.particles.burst(150, {
      x, y, speed: 520, life: 1.1, size: 6, color: '#ffb347', drag: 1.6, jitter: 24,
    });
    this.particles.burst(70, {
      x, y, speed: 240, life: 1.9, size: 10, color: '#ff4d6d', drag: 1.1, jitter: 36,
    });
    this.particles.burst(45, {
      x, y, speed: 760, life: 0.45, size: 3, color: '#ffffff', drag: 3.2, jitter: 10,
    });
    this.camera.addShake(this.camera.maxShake);
  }

  /**
   * Fresh run: new sector, factory-fresh ship, every system reset. Ratings
   * bought in the meta layer survive (Ship.reset keeps the max* stats).
   * @param {number} [seed] defaults to the next seed in sequence
   */
  restart(seed) {
    const nextSeed = seed ?? (this.world.seed + 1) >>> 0;
    this.world = new World({
      seed: nextSeed,
      width: this.world.width,
      height: this.world.height,
      obstacleCount: this.world.obstacleCount,
      gridSize: this.world.gridSize,
    });
    this.updateContext.world = this.world;
    this._renderInfo.world = this.world; // the HUD minimap reads this

    this.camera.setBounds(this.world.bounds.x, this.world.bounds.y, this.world.bounds.width, this.world.bounds.height);
    this.ship.reset(this.world.width * 0.5, this.world.height * 0.5, -Math.PI / 2);
    this.systems.reset();
    this.particles.clear();
    this.camera.snapTo(this.ship.x, this.ship.y);

    this.hud.resetRun();
    this.runTime = 0;
    this.endReason = null;
    this.state = 'playing';
    this.input.enabled = true;
    this.events.emit('run:start', { ship: this.ship, world: this.world, restart: true });
    return this;
  }

  togglePause() {
    this.paused = !this.paused;
    if (!this.paused) this.loop.resetTiming();
  }

  /** Dump a quarter of the hold overboard (J) — the answer to being overloaded. */
  jettisonCargo() {
    const dropped = this.core.weight.jettison(this.ship.stats.maxWeight * 0.25);
    if (dropped > 0) {
      this.particles.burst(24, {
        x: this.ship.x, y: this.ship.y, speed: 160, life: 0.9,
        size: 4, color: '#8bd450', drag: 1.4, jitter: 14,
      });
    }
    return dropped;
  }

  _onKey(code) {
    switch (code) {
      case 'Backquote':
      case 'F3':
        this.debug = !this.debug;
        break;
      case 'KeyP':
        this.togglePause();
        break;
      case 'KeyR':
        this.restart();
        break;
      case 'KeyJ':
        this.jettisonCargo();
        break;
      case 'Enter':
      case 'Space':
        this._onConfirm();
        break;
      default:
        this._onDebugKey(code);
    }
  }

  /**
   * Debug-only gauge pokes (with ` on) so each system can be exercised
   * without playing for four minutes first.
   */
  _onDebugKey(code) {
    if (!this.debug) return;
    const s = this.ship.stats;
    switch (code) {
      case 'Digit1': // +25% heat  -> watch the overheat penalty kick in
        this.ship.generateHeat(s.maxHeat * 0.25);
        break;
      case 'Digit2': // +20% cargo mass -> watch acceleration die
        this.core.weight.addCargo(s.maxWeight * 0.2);
        break;
      case 'Digit3': // +10% corrosion -> creep toward meltdown
        s.coreCorrosion = clamp(s.coreCorrosion + 10, 0, 100);
        break;
      case 'Digit4': // drain 30% of the capacitor -> brownout
        this.ship.consumePower(s.maxPower * 0.3);
        break;
      case 'Digit5': // -25 hull
        this.ship.damage(s.maxHull * 0.25);
        this.systems.get('hull')?.events?.emit('ship:damaged', { amount: s.maxHull * 0.25, source: 'debug' });
        break;
      case 'Digit0': // full service
        s.heat = 0;
        s.power = s.maxPower;
        s.coreCorrosion = 0;
        s.hull = s.maxHull;
        s.weight = 0;
        this.ship.alive = true;
        break;
      default:
        break;
    }
  }

  /* ============================================================== simulate == */

  /**
   * Fixed-step simulation. `dt` is ALWAYS CONFIG.loop.fixedStep — never do
   * per-frame (variable dt) work in here.
   * @param {number} dt
   */
  update(dt) {
    if (this.paused) return;

    this.time += dt;
    this.updateContext.time = this.time;
    this.updateContext.dt = dt;

    // 1. Input (joystick + keyboard -> normalised axis)
    this.input.update(dt);
    if (this.input.magnitude > 0.15) this.hud.notifyInput();

    // 2. Systems -> modifiers. Only while a run is live: the Great Decay
    //    must not eat the hull while we're sitting on the title screen, and
    //    frozen gauges on the game-over screen make the wreck readable.
    if (this.state === 'playing') {
      this.runTime += dt;
      this.systems.update(dt);
    }

    // 3. Entities (on game over the hulk keeps drifting with its last modifiers)
    this.ship.update(dt, this.updateContext);

    // 4. World + FX
    this.world.update(dt);
    this.particles.update(dt);

    // 5. Camera last: it follows the ship's freshly integrated position.
    const t = this._camTarget;
    t.x = this.ship.x;
    t.y = this.ship.y;
    t.vx = this.ship.vx;
    t.vy = this.ship.vy;
    this.camera.update(dt, t);

    // Zoom out a touch at speed: cheap "sense of velocity" trick.
    const speedT = clamp((this.ship.speedValue ?? 0) / this.ship.maxSpeed, 0, 1);
    this.camera.targetZoomBias = 1 - speedT * 0.06;
  }

  /* ================================================================ render == */

  /**
   * @param {number} alpha interpolation factor in [0,1) between the last two
   *                        fixed steps
   * @param {number} frameDt real (variable) frame delta — UI animation only
   */
  render(alpha, frameDt) {
    const vp = this.viewport;
    const ctx = vp.beginFrame();

    /* --- background -------------------------------------------------------- */
    vp.clear(CONFIG.palette.background);
    // Parallax stars are screen-space: they must NOT be camera transformed.
    this.world.renderBackground(ctx, this.camera, vp, alpha);

    /* --- world -------------------------------------------------------------- */
    ctx.save();
    this.camera.applyTransform(ctx, alpha);
    this.world.renderGround(ctx, this.camera, vp);
    this.world.renderObstacles(ctx, this.camera);
    this.particles.render(ctx);
    if (this.ship.visible) this.ship.render(ctx, alpha);
    if (this.debug) this._renderWorldDebug(ctx, alpha);
    ctx.restore();

    /* --- screen space UI ---------------------------------------------------- */
    this.hud.update(frameDt);
    this.hud.renderFlash(ctx);
    this.joystick.render(ctx);

    this._renderInfo.debug = this.debug;
    this._renderInfo.state = this.state;
    this._renderInfo.frameDt = frameDt;
    this.hud.render(ctx, this._renderInfo);

    if (this.state === 'title') this._renderTitle(ctx, frameDt);
    else if (this.state === 'gameover') this._renderGameOver(ctx);
    if (this.paused) this._renderPaused(ctx);
  }

  /** Collision circles, heading vs velocity vectors (drift visualiser). */
  _renderWorldDebug(ctx, alpha) {
    const s = this.ship;
    const x = s.getRenderX(alpha);
    const y = s.getRenderY(alpha);

    // Collision radius
    ctx.strokeStyle = 'rgba(255, 80, 120, 0.8)';
    ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.beginPath();
    ctx.arc(x, y, s.radius, 0, TAU);
    ctx.stroke();

    // Heading (white) vs velocity (cyan): the angle between them IS the drift.
    const hx = Math.cos(s.getRenderAngle(alpha));
    const hy = Math.sin(s.getRenderAngle(alpha));
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + hx * 120, y + hy * 120);
    ctx.stroke();

    const sp = s.speedValue ?? 0;
    if (sp > 1) {
      ctx.strokeStyle = 'rgba(53,224,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (s.vx / sp) * sp * 0.35, y + (s.vy / sp) * sp * 0.35);
      ctx.stroke();
    }
  }

  _renderTitle(ctx) {
    const vp = this.viewport;
    const p = CONFIG.palette;
    const w = vp.width;
    const h = vp.height;

    ctx.save();
    ctx.fillStyle = 'rgba(3, 5, 12, 0.72)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = w * 0.5;
    const cy = h * 0.36;
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 2.2);

    ctx.fillStyle = p.text;
    ctx.font = font(Math.min(34, w * 0.098), 800);
    ctx.fillText('SOUL CORE', cx, cy);

    ctx.fillStyle = p.accent;
    ctx.font = font(Math.min(15, w * 0.042), 600);
    ctx.fillText('T H E   G R E A T   D E C A Y', cx, cy + 30);

    ctx.fillStyle = p.textDim;
    ctx.font = font(11, 500);
    ctx.fillText('PHASE 2 · CORE SYSTEMS', cx, cy + 58);

    ctx.globalAlpha = pulse;
    ctx.fillStyle = p.accent;
    ctx.font = font(13, 700);
    ctx.fillText('TAP TO BEGIN', cx, h * 0.62);
    ctx.globalAlpha = 1;

    ctx.fillStyle = p.textDim;
    ctx.font = font(10, 500);
    ctx.fillText('the core is already decaying — watch the purple', cx, h * 0.62 + 22);
    ctx.fillText('virtual stick · WASD on desktop · ` for debug', cx, h * 0.62 + 38);

    ctx.restore();
  }

  /** Meltdown / destroyed end screen. */
  _renderGameOver(ctx) {
    const vp = this.viewport;
    const p = CONFIG.palette;
    const w = vp.width;
    const h = vp.height;
    const meltdown = this.endReason === 'meltdown';

    ctx.save();
    ctx.fillStyle = meltdown ? 'rgba(24, 6, 34, 0.78)' : 'rgba(28, 6, 10, 0.78)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = w * 0.5;
    const cy = h * 0.38;
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 2.4);

    ctx.fillStyle = meltdown ? p.gaugeCorrosion : p.gaugeCritical;
    ctx.font = font(Math.min(30, w * 0.088), 800);
    ctx.fillText(meltdown ? 'CORE MELTDOWN' : 'HULL BREACH', cx, cy);

    ctx.fillStyle = p.text;
    ctx.font = font(12, 600);
    ctx.fillText(
      meltdown ? 'The Great Decay finished what the void started.'
        : 'The plating gave out before the core did.',
      cx, cy + 28,
    );

    const t = this.runTime;
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    ctx.fillStyle = p.textDim;
    ctx.font = font(11, 500);
    ctx.fillText(`SURVIVED ${mm}:${ss}`, cx, cy + 56);
    const stats = this.ship.stats;
    ctx.fillText(
      `CORROSION ${stats.coreCorrosion.toFixed(0)}%   ·   HULL ${Math.max(0, stats.hull).toFixed(0)}   ·   RUN #${this.runsCompleted + 1}`,
      cx, cy + 74,
    );

    ctx.globalAlpha = pulse;
    ctx.fillStyle = p.accent;
    ctx.font = font(13, 700);
    ctx.fillText('TAP TO RESTART', cx, h * 0.66);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  _renderPaused(ctx) {
    const vp = this.viewport;
    ctx.save();
    ctx.fillStyle = 'rgba(3, 5, 12, 0.55)';
    ctx.fillRect(0, 0, vp.width, vp.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CONFIG.palette.text;
    ctx.font = font(20, 800);
    ctx.fillText('PAUSED', vp.width * 0.5, vp.height * 0.5);
    ctx.font = font(11, 500);
    ctx.fillStyle = CONFIG.palette.textDim;
    ctx.fillText('press P to resume', vp.width * 0.5, vp.height * 0.5 + 22);
    ctx.restore();
  }

  /* ================================================================== misc == */

  /** Human-readable state for the console / devtools. */
  status() {
    const s = this.ship.stats;
    return {
      state: this.state,
      runTime: this.runTime.toFixed(1),
      hull: `${s.hull.toFixed(0)}/${s.maxHull}`,
      power: `${s.power.toFixed(0)}/${s.maxPower}`,
      heat: `${s.heat.toFixed(0)}/${s.maxHeat}`,
      corrosion: `${s.coreCorrosion.toFixed(1)}%`,
      weight: `${s.weight.toFixed(1)}/${s.maxWeight}`,
      thrustMul: this.systems.modifiers.thrustMul.toFixed(2),
    };
  }

  destroy() {
    this.loop.stop();
    this.input.detach();
  }
}

export default Game;
