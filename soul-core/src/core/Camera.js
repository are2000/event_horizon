/**
 * Camera.js
 * ----------------------------------------------------------------------------
 * A 2D "look at" camera for a world much larger than the screen.
 *
 * Key ideas
 *  - ZOOM IS DERIVED, NOT STORED: we fix how many *world units* are visible
 *    vertically (`viewportHeight`, e.g. 1000 wu) and derive px-per-world-unit
 *    from the canvas height. A tall 21:9 phone then simply sees MORE world
 *    horizontally instead of being zoomed out — every device gets a fair,
 *    readable view. Change `CONFIG.camera.viewportHeight` to zoom the game.
 *
 *  - SMOOTHING IS EXPONENTIAL AND DT-CORRECTED: identical feel at any framerate.
 *
 *  - LOOK-AHEAD: the camera leads the ship along its velocity, so drifting at
 *    speed shows you where you are going, not where you have been.
 *
 *  - INTERPOLATION: prevX/prevY let the renderer draw the camera between two
 *    fixed physics steps (see Loop.js) — no stutter on 60Hz panels.
 *
 *  - SHAKE: screen-space offset added after scaling, decaying exponentially.
 */
import { CONFIG } from '../config.js';
import { clamp, damp, lerp } from './MathUtils.js';

export class Camera {
  /**
   * @param {import('./Viewport.js').Viewport} viewport
   * @param {object} [opts]
   */
  constructor(viewport, opts = {}) {
    this.viewport = viewport;

    this.viewportHeight = opts.viewportHeight ?? CONFIG.camera.viewportHeight;
    this.smoothing = opts.smoothing ?? CONFIG.camera.smoothing;
    this.lookAhead = opts.lookAhead ?? CONFIG.camera.lookAhead;
    this.maxLookAhead = opts.maxLookAhead ?? CONFIG.camera.maxLookAhead;
    this.shakeDecay = opts.shakeDecay ?? CONFIG.camera.shakeDecay;
    this.maxShake = opts.maxShake ?? CONFIG.camera.maxShake;

    // World-space position of the camera centre.
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;

    // Optional clamp region (world bounds).
    this.bounds = null;

    // Screen shake (pixels).
    this.shakeAmount = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this._shakeTime = 0;

    // Zoom multiplier for gameplay effects (boost zoom-out, death zoom-in...).
    this.zoomBias = 1;
    this.targetZoomBias = 1;

    // Scratch objects — reused so we never allocate inside the loop.
    this._visible = { x: 0, y: 0, w: 0, h: 0 };
  }

  /** Pixels per world unit. */
  get zoom() {
    return (this.viewport.height / this.viewportHeight) * this.zoomBias;
  }

  /** Half of the visible world size, in world units. */
  get halfViewWidth() {
    return this.viewport.width * 0.5 / this.zoom;
  }

  get halfViewHeight() {
    return this.viewport.height * 0.5 / this.zoom;
  }

  /** Set the rectangle the camera centre is allowed to occupy. */
  setBounds(x, y, width, height) {
    this.bounds = { x, y, width, height };
    return this;
  }

  /** Teleport (use on spawn/respawn, never mid-frame). */
  snapTo(x, y) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.clampToBounds();
    this.prevX = this.x;
    this.prevY = this.y;
    return this;
  }

  /**
   * Advance the camera — call once per FIXED simulation step.
   * @param {number} dt
   * @param {{x:number,y:number,vx?:number,vy?:number}} target
   */
  update(dt, target) {
    this.prevX = this.x;
    this.prevY = this.y;

    if (target) {
      // Look ahead along velocity (clamped so full boost doesn't throw the
      // camera halfway across the sector).
      let tx = target.x;
      let ty = target.y;
      if (target.vx !== undefined && target.vy !== undefined) {
        tx += clamp(target.vx * this.lookAhead, -this.maxLookAhead, this.maxLookAhead);
        ty += clamp(target.vy * this.lookAhead, -this.maxLookAhead, this.maxLookAhead);
      }
      this.x = damp(this.x, tx, this.smoothing, dt);
      this.y = damp(this.y, ty, this.smoothing, dt);
    }

    // Zoom bias easing (e.g. pull back slightly at top speed).
    this.zoomBias = damp(this.zoomBias, this.targetZoomBias, 3, dt);

    this.clampToBounds();
    this._updateShake(dt);
  }

  /** Keep the view inside the world (or centre it if the world is smaller). */
  clampToBounds() {
    const b = this.bounds;
    if (!b) return;
    const hw = this.halfViewWidth;
    const hh = this.halfViewHeight;

    if (b.width <= hw * 2) this.x = b.x + b.width * 0.5;
    else this.x = clamp(this.x, b.x + hw, b.x + b.width - hw);

    if (b.height <= hh * 2) this.y = b.y + b.height * 0.5;
    else this.y = clamp(this.y, b.y + hh, b.y + b.height - hh);
  }

  /** Add screen shake. `amount` is in pixels and stacks up to maxShake. */
  addShake(amount) {
    this.shakeAmount = Math.min(this.maxShake, this.shakeAmount + amount);
  }

  _updateShake(dt) {
    if (this.shakeAmount <= 0.01) {
      this.shakeAmount = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    this._shakeTime += dt;
    this.shakeAmount *= Math.exp(-this.shakeDecay * dt);
    // Cheap pseudo-random wobble (no allocation, no Math.random per frame
    // spikes — deterministic and plenty convincing).
    const t = this._shakeTime * 47;
    this.shakeX = Math.sin(t) * Math.cos(t * 1.7) * this.shakeAmount;
    this.shakeY = Math.cos(t * 1.3) * Math.sin(t * 0.9) * this.shakeAmount;
  }

  /* ------------------------------------------------------------ transforms -- */

  /** Interpolated camera position for rendering. */
  getRenderX(alpha) {
    return lerp(this.prevX, this.x, alpha);
  }

  getRenderY(alpha) {
    return lerp(this.prevY, this.y, alpha);
  }

  /**
   * Push the world→screen transform onto the context.
   * Call after `viewport.beginFrame()`; draw world objects until you reset.
   */
  applyTransform(ctx, alpha = 1) {
    const z = this.zoom;
    ctx.translate(this.viewport.centerX + this.shakeX, this.viewport.centerY + this.shakeY);
    ctx.scale(z, z);
    ctx.translate(-this.getRenderX(alpha), -this.getRenderY(alpha));
  }

  /** World → screen (CSS px). */
  worldToScreen(wx, wy, alpha = 1, out = { x: 0, y: 0 }) {
    const z = this.zoom;
    out.x = (wx - this.getRenderX(alpha)) * z + this.viewport.centerX + this.shakeX;
    out.y = (wy - this.getRenderY(alpha)) * z + this.viewport.centerY + this.shakeY;
    return out;
  }

  /** Screen (CSS px) → world. */
  screenToWorld(sx, sy, out = { x: 0, y: 0 }) {
    const z = this.zoom;
    out.x = (sx - this.viewport.centerX - this.shakeX) / z + this.x;
    out.y = (sy - this.viewport.centerY - this.shakeY) / z + this.y;
    return out;
  }

  /**
   * Visible world rectangle (plus optional margin), used for culling.
   * Returns a shared object — consume it immediately, don't store it.
   */
  getVisibleRect(margin = 0) {
    const hw = this.halfViewWidth + margin;
    const hh = this.halfViewHeight + margin;
    const r = this._visible;
    r.x = this.x - hw;
    r.y = this.y - hh;
    r.w = hw * 2;
    r.h = hh * 2;
    return r;
  }

  /** True if a world-space circle could be on screen (cheap cull test). */
  isCircleVisible(cx, cy, radius) {
    const hw = this.halfViewWidth + radius;
    const hh = this.halfViewHeight + radius;
    return Math.abs(cx - this.x) <= hw && Math.abs(cy - this.y) <= hh;
  }
}

export default Camera;
