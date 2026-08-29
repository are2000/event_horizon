/**
 * ItemPickup.js
 * ----------------------------------------------------------------------------
 * A piece of salvage floating in the world: an Item wrapped in something you
 * can see, fly over and collect.
 *
 * Deliberately an Entity (not a DOM node or a UI concern): it lives in world
 * space, it is culled by the camera, and it is drawn with the same placeholder
 * geometry as everything else. When real art lands this file swaps the shapes.
 *
 * Pickups decay — `life` ticks down and the last few seconds blink — so the
 * sector doesn't slowly fill with junk the player never bothered to collect.
 */
import { CONFIG } from '../config.js';
import { Entity } from './Entity.js';
import { TAU } from '../core/MathUtils.js';

export class ItemPickup extends Entity {
  /**
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {import('../inventory/Item.js').Item} opts.item
   */
  constructor(opts = {}) {
    super({
      type: 'pickup',
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      radius: opts.radius ?? CONFIG.inventory.pickupRadius * 0.4,
    });
    this.item = opts.item ?? null;
    this.life = opts.life ?? CONFIG.inventory.pickupLifetime;
    this.maxLife = this.life;
    /** Set when the ship touches it; Game removes it on the next sweep. */
    this.collected = false;
    // A gentle drift makes salvage feel like it is really out there.
    this.vx = opts.vx ?? (Math.random() - 0.5) * 26;
    this.vy = opts.vy ?? (Math.random() - 0.5) * 26;
  }

  get color() {
    return this.item?.color ?? '#8bd450';
  }

  update(dt, ctx) {
    this.savePrevious();
    this.age += dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Salvage slows to a stop rather than drifting forever.
    const drag = Math.exp(-0.6 * dt);
    this.vx *= drag;
    this.vy *= drag;

    this.life -= dt;
    if (this.life <= 0) this.alive = false;
    return this;
  }

  /** True while the wreck is about to vanish (render blinks). */
  get expiring() {
    return this.life < 6;
  }

  render(ctx, alpha) {
    if (!this.alive) return;
    const x = this.getRenderX(alpha);
    const y = this.getRenderY(alpha);
    const bob = Math.sin(this.age * 2.6) * 3;
    const blink = this.expiring ? 0.45 + 0.55 * Math.abs(Math.sin(this.age * 9)) : 1;
    const tier = this.item?.tier ?? 1;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.globalAlpha = blink;

    /* --- collection halo --------------------------------------------------- */
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = blink * (0.18 + 0.12 * Math.sin(this.age * 3.4));
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 1.9, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = blink;

    /* --- the crate: a tumbling diamond ------------------------------------ */
    ctx.rotate(this.age * 0.9);
    const r = this.radius * 0.72;
    ctx.fillStyle = 'rgba(10, 16, 28, 0.85)';
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tier pips stacked down the middle: T1 = one dot, T3 = three.
    ctx.fillStyle = this.color;
    const pip = Math.max(1.4, r * 0.17);
    for (let i = 0; i < tier; i++) {
      const py = (i - (tier - 1) / 2) * (pip * 2.6);
      ctx.beginPath();
      ctx.arc(0, py, pip, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}

export default ItemPickup;
