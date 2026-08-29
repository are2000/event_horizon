/**
 * Scrap.js
 * ----------------------------------------------------------------------------
 * Loose scrap: the run currency, lying in the void where something died.
 *
 * Deliberately NOT an inventory item. Salvage (ItemPickup) is gear you drag
 * around a grid; scrap is a NUMBER you spend. Keeping them as different
 * entities means the two systems can evolve independently — scrap can get a
 * magnet, a vacuum beam or a shop value without ever touching the grid.
 *
 * Behaviour in three stages, all of it cheap:
 *
 *   1. SCATTER — it pops out of the wreck with a random drift and slows down
 *   2. MAGNET  — inside `magnetRange` it accelerates toward the ship, so you
 *                never have to pixel-hunt with your thumb on a phone
 *   3. COLLECT — inside `pickupRange` it is gone (Game banks it and removes it)
 *
 * It decays on a timer and blinks out in the last few seconds, so a sector you
 * have swept stays swept.
 */
import { CONFIG } from '../config.js';
import { Entity } from './Entity.js';
import { TAU } from '../core/MathUtils.js';

export class Scrap extends Entity {
  /**
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {number} [opts.value] scrap units; also drives the visual size
   */
  constructor(opts = {}) {
    const cfg = CONFIG.economy.scrap;
    super({
      type: 'scrap',
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      radius: opts.radius ?? cfg.pickupRange * 0.34,
    });

    this.value = Math.max(1, Math.round(opts.value ?? 1));
    this.life = opts.life ?? cfg.lifetime;
    this.maxLife = this.life;
    /** Set the moment the ship touches it; Game removes it next sweep. */
    this.collected = false;

    // Pop out of the wreck in a random direction.
    const a = Math.random() * TAU;
    const sp = cfg.driftSpeed * (0.35 + Math.random() * 0.9);
    this.vx = (opts.vx ?? 0) + Math.cos(a) * sp;
    this.vy = (opts.vy ?? 0) + Math.sin(a) * sp;

    // Visual only: a slow tumble plus a per-instance spin phase.
    this.spin = (Math.random() - 0.5) * 2.4;
    this.phase = Math.random() * TAU;
  }

  get color() {
    return CONFIG.palette.scrap;
  }

  /** True while it is about to decay (render blinks). */
  get expiring() {
    return this.life < 6;
  }

  /** Size scales gently with value: a 7-piece cluster reads as a bigger prize. */
  get size() {
    return this.radius * (0.85 + Math.min(1, this.value / 8) * 0.5);
  }

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { ship, world }
   * @returns {boolean} true when it should be collected this step
   */
  update(dt, ctx) {
    this.savePrevious();
    this.age += dt;

    const cfg = CONFIG.economy.scrap;
    const ship = ctx?.ship;

    if (ship && ship.alive) {
      const dx = ship.x - this.x;
      const dy = ship.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (dist <= cfg.magnetRange) {
        // Stronger the closer it is — the last stretch snaps in.
        const pull = cfg.magnetAccel * (0.35 + 0.65 * (1 - dist / cfg.magnetRange));
        this.vx += (dx / dist) * pull * dt;
        this.vy += (dy / dist) * pull * dt;
      }
      if (dist <= cfg.pickupRange) {
        this.collected = true;
        this.alive = false;
        return true;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Drag, so the scatter settles instead of flying forever.
    const d = Math.exp(-1.6 * dt);
    this.vx *= d;
    this.vy *= d;

    this.life -= dt;
    if (this.life <= 0) this.alive = false;
    return false;
  }

  /**
   * Placeholder art: a tumbling cluster of angular shards with a soft halo.
   * Gold, small, and high-contrast against the dark — a shard should be
   * readable at a glance even while the screen is full of explosions.
   */
  render(ctx, alpha) {
    if (!this.alive) return;
    const x = this.getRenderX(alpha);
    const y = this.getRenderY(alpha);
    const blink = this.expiring ? 0.4 + 0.6 * Math.abs(Math.sin(this.age * 9)) : 1;
    const r = this.size;
    const pulse = 0.75 + 0.25 * Math.sin(this.age * 4 + this.phase);

    ctx.save();
    ctx.translate(x, y);

    /* --- halo --------------------------------------------------------------- */
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = blink * 0.22 * pulse;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.1, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = blink;

    /* --- shards ------------------------------------------------------------- */
    ctx.rotate(this.age * this.spin + this.phase);
    ctx.fillStyle = this.color;
    ctx.strokeStyle = 'rgba(255, 248, 214, 0.9)';
    ctx.lineWidth = 1;

    // Three shards at 120°: reads as a broken chunk of plating from any angle.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const rr = r * (0.55 + (i % 2) * 0.45);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a + 0.7) * rr * 0.45, Math.sin(a + 0.7) * rr * 0.45);
      ctx.lineTo(Math.cos(a - 0.5) * rr * 0.6, Math.sin(a - 0.5) * rr * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Scatter a cluster of scrap at a wreck site.
   * @param {object} opts { x, y, amount, count }
   * @returns {Scrap[]}
   */
  static scatter(opts) {
    const amount = Math.max(1, Math.round(opts.amount ?? 1));
    // One entity per (at most) 3 units: a 7-piece drop is 3 visible shards.
    const count = Math.min(4, Math.max(1, Math.round(amount / 3)));
    const out = [];
    let left = amount;
    for (let i = 0; i < count; i++) {
      const value = i === count - 1 ? left : Math.max(1, Math.round(amount / count));
      left -= value;
      out.push(new Scrap({ x: opts.x ?? 0, y: opts.y ?? 0, value }));
      if (left <= 0) break;
    }
    return out;
  }
}

export default Scrap;
