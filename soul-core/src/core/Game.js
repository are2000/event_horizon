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
import { HUD } from '../ui/HUD.js';
import { VirtualJoystick } from '../ui/VirtualJoystick.js';
import { World } from '../world/World.js';
import { Camera } from './Camera.js';
import { EventBus } from './EventBus.js';
import { InputManager } from './InputManager.js';
import { Loop } from './Loop.js';
import { Viewport } from './Viewport.js';
import { clamp, font, TAU } from './MathUtils.js';

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

    /* ----------------------------------------------------------------- ui -- */
    this.hud = new HUD(this.viewport, this.ship);

    /* -------------------------------------------------------------- state -- */
    /** 'title' | 'playing' */
    this.state = 'title';
    // Movement input stays off until the run starts, so a stray thumb on the
    // title screen can't fly the ship around behind the overlay.
    this.input.enabled = false;
    this.paused = false;
    this.time = 0;
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

    // Kick off one simulation frame's worth of state so the title screen
    // renders a fully initialised ship rather than a null modifier set.
    this.systems.update(CONFIG.loop.fixedStep);

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

    // Start the run on the first touch / click / key.
    this.events.on('input:tap', () => {
      if (this.state === 'title') this.startRun();
    });
    this.events.on('input:down', () => {
      if (this.state === 'title') this.startRun();
    });
    this.events.on('input:key', ({ code }) => this._onKey(code));
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
    this.events.emit('run:start', { ship: this.ship, world: this.world });
  }

  togglePause() {
    this.paused = !this.paused;
    if (!this.paused) this.loop.resetTiming();
  }

  respawn() {
    this.ship.teleport(this.world.width * 0.5, this.world.height * 0.5, -Math.PI / 2);
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.camera.snapTo(this.ship.x, this.ship.y);
    this.particles.clear();
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
        this.respawn();
        break;
      case 'Enter':
        if (this.state === 'title') this.startRun();
        break;
      default:
        this._onDebugKey(code);
    }
  }

  /** Debug-only gauges so the systems pipeline can be exercised right now. */
  _onDebugKey(code) {
    if (!this.debug) return;
    const r = this.ship.resources;
    switch (code) {
      case 'Digit1':
        r.heat = clamp(r.heat + 0.25, 0, 1);
        break;
      case 'Digit2':
        r.weight = clamp(r.weight + 0.15, 0, 1);
        break;
      case 'Digit3':
        r.corrosion = clamp(r.corrosion + 0.15, 0, 1);
        break;
      case 'Digit4':
        r.power = clamp(r.power - 0.25, 0, 1);
        break;
      case 'Digit0':
        r.heat = 0;
        r.weight = 0;
        r.corrosion = 0;
        r.power = 1;
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

    // 2. Systems -> modifiers (Weight/Heat/Power/Corrosion live here)
    this.systems.update(dt);

    // 3. Entities
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
    this.ship.render(ctx, alpha);
    if (this.debug) this._renderWorldDebug(ctx, alpha);
    ctx.restore();

    /* --- screen space UI ---------------------------------------------------- */
    this.hud.update(frameDt);
    this.joystick.render(ctx);

    this._renderInfo.debug = this.debug;
    this._renderInfo.frameDt = frameDt;
    this.hud.render(ctx, this._renderInfo);

    if (this.state === 'title') this._renderTitle(ctx, frameDt);
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
    ctx.fillText('PHASE 1 · FLIGHT PROTOTYPE', cx, cy + 58);

    ctx.globalAlpha = pulse;
    ctx.fillStyle = p.accent;
    ctx.font = font(13, 700);
    ctx.fillText('TAP TO BEGIN', cx, h * 0.62);
    ctx.globalAlpha = 1;

    ctx.fillStyle = p.textDim;
    ctx.font = font(10, 500);
    ctx.fillText('virtual stick · WASD on desktop · ` for debug', cx, h * 0.62 + 22);

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

  destroy() {
    this.loop.stop();
    this.input.detach();
  }
}

export default Game;
