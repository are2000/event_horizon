/**
 * VirtualJoystick.js
 * ----------------------------------------------------------------------------
 * Touch-first movement stick, rendered on the canvas (not in the DOM) so it
 * shares the game's resolution, safe-area handling and draw order for free.
 *
 * Behaviour (deliberately forgiving — this is a thumb, not a mouse):
 *  - The BASE stays anchored bottom-centre, so it is always where the player
 *    expects it.
 *  - The ACTIVATION ZONE is the whole lower part of the screen, so the player
 *    does not have to hit a 60px circle: touching anywhere down there grabs
 *    the stick and the knob immediately snaps to the finger.
 *  - Multi-touch safe: it tracks one `pointerId` and ignores all others, so a
 *    second finger (future fire button) cannot hijack movement.
 *  - Dead zone kills thumb jitter; output magnitude is 0..1 so ships can
 *    throttle instead of being binary on/off.
 *
 * The joystick only produces an INPUT VECTOR — it knows nothing about ships.
 * Ship.js decides what to do with it, which is what lets the same stick drive
 * a drifting hull now and a heavy, corroded barge later.
 */
import { CONFIG } from '../config.js';
import { clamp, damp, length } from '../core/MathUtils.js';

export class VirtualJoystick {
  /**
   * @param {import('../core/Viewport.js').Viewport} viewport
   * @param {object} [opts]
   */
  constructor(viewport, opts = {}) {
    this.viewport = viewport;

    const cfg = CONFIG.joystick;
    this.anchorX = opts.anchorX ?? cfg.anchorX; // fraction of viewport width
    this.radiusFraction = opts.radiusFraction ?? cfg.radiusFraction;
    this.minRadius = opts.minRadius ?? cfg.minRadius;
    this.maxRadius = opts.maxRadius ?? cfg.maxRadius;
    this.bottomMargin = opts.bottomMargin ?? cfg.bottomMargin;
    this.deadzone = opts.deadzone ?? cfg.deadzone;
    this.activation = opts.activation ?? cfg.activation;
    this.knobReturn = opts.knobReturn ?? cfg.knobReturn;

    /** Centre of the stick, in CSS px (screen space). */
    this.centerX = 0;
    this.centerY = 0;
    this.radius = 64;
    this.activationRect = { x: 0, y: 0, w: 0, h: 0 };

    /** Knob offset from centre, in px (never longer than `radius`). */
    this.knobX = 0;
    this.knobY = 0;

    /** Normalised output: magnitude 0..1, in screen axes (y+ = down). */
    this.vectorX = 0;
    this.vectorY = 0;
    this.magnitude = 0;

    /** Which pointer owns the stick (null = idle). */
    this.pointerId = null;
    this.active = false;

    /** Visual state: 0 = hidden-ish, 1 = fully lit. */
    this.visibility = 0;
    this.enabled = true;

    this.layout();
  }

  /** Recompute geometry from the viewport — call on every resize. */
  layout() {
    const vp = this.viewport;
    const r = clamp(Math.min(vp.width, vp.height) * this.radiusFraction, this.minRadius, this.maxRadius);
    this.radius = r;

    const safe = vp.safeArea;
    this.centerX = vp.width * this.anchorX;
    this.centerY = vp.height - (r + this.bottomMargin + safe.bottom);

    const a = this.activation;
    this.activationRect.x = vp.width * a.x;
    this.activationRect.y = vp.height * a.y;
    this.activationRect.w = vp.width * a.w;
    this.activationRect.h = vp.height * a.h;
    return this;
  }

  /** Is this screen point inside the grab zone? */
  isInActivationZone(x, y) {
    const r = this.activationRect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /**
   * Try to grab the stick with a new pointer.
   * @returns {boolean} true if this stick claimed the pointer
   */
  begin(pointerId, x, y) {
    if (!this.enabled || this.pointerId !== null) return false;
    if (!this.isInActivationZone(x, y)) return false;

    this.pointerId = pointerId;
    this.active = true;
    this._setKnobFromPoint(x, y);
    return true;
  }

  /** Update the knob while dragging. */
  move(pointerId, x, y) {
    if (this.pointerId !== pointerId) return false;
    this._setKnobFromPoint(x, y);
    return true;
  }

  /** Release (also called when the pointer is cancelled / leaves the screen). */
  end(pointerId) {
    if (this.pointerId !== pointerId) return false;
    this.pointerId = null;
    this.active = false;
    this.vectorX = 0;
    this.vectorY = 0;
    this.magnitude = 0;
    return true;
  }

  _setKnobFromPoint(x, y) {
    let dx = x - this.centerX;
    let dy = y - this.centerY;
    const dist = length(dx, dy);

    if (dist > this.radius) {
      // Clamp the knob on the ring; the vector stays full-strength.
      const s = this.radius / dist;
      dx *= s;
      dy *= s;
    }
    this.knobX = dx;
    this.knobY = dy;

    // --- analog output -------------------------------------------------
    const dz = this.deadzone * this.radius;
    const raw = length(dx, dy);
    if (raw <= dz) {
      this.magnitude = 0;
      this.vectorX = 0;
      this.vectorY = 0;
      return;
    }
    // Re-map [deadzone..radius] -> [0..1] so leaving the dead zone is smooth
    // instead of jumping straight to 30% throttle.
    const mag = clamp((raw - dz) / (this.radius - dz), 0, 1);
    const inv = raw > 0.0001 ? 1 / raw : 0;
    this.magnitude = mag;
    this.vectorX = dx * inv * mag;
    this.vectorY = dy * inv * mag;
  }

  /**
   * Per-frame visuals only (the knob eases back to centre when released).
   * @param {number} dt seconds
   */
  update(dt) {
    if (!this.active) {
      this.knobX = damp(this.knobX, 0, this.knobReturn, dt);
      this.knobY = damp(this.knobY, 0, this.knobReturn, dt);
    }
    const target = this.enabled ? (this.active ? 1 : 0.42) : 0.15;
    this.visibility = damp(this.visibility, target, CONFIG.joystick.fadeIn, dt);
  }

  /**
   * Draw in SCREEN space (no camera transform).
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const vis = this.visibility;
    if (vis <= 0.02) return;

    const { centerX: cx, centerY: cy, radius: r } = this;
    const p = CONFIG.palette;
    const knobR = r * 0.42;

    ctx.save();
    ctx.globalAlpha = vis;

    // --- outer ring ----------------------------------------------------
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.active ? 'rgba(53, 224, 255, 0.55)' : 'rgba(207, 224, 255, 0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // --- soft base disc ------------------------------------------------
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(120, 170, 255, 0.10)');
    grad.addColorStop(1, 'rgba(120, 170, 255, 0.02)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // --- dead-zone hint -------------------------------------------------
    ctx.strokeStyle = 'rgba(207, 224, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * this.deadzone, 0, Math.PI * 2);
    ctx.stroke();

    // --- direction tether ------------------------------------------------
    const kx = cx + this.knobX;
    const ky = cy + this.knobY;
    if (this.magnitude > 0) {
      ctx.strokeStyle = 'rgba(53, 224, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(kx, ky);
      ctx.stroke();
    }

    // --- knob -------------------------------------------------------------
    ctx.fillStyle = this.active ? p.accent : 'rgba(207, 224, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(5, 12, 24, 0.75)';
    ctx.beginPath();
    ctx.arc(kx, ky, knobR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** Tiny helper used by the debug overlay. */
  debugString() {
    return `stick ${this.vectorX.toFixed(2)},${this.vectorY.toFixed(2)} |${this.magnitude.toFixed(2)}|`;
  }
}

export default VirtualJoystick;
