/**
 * BlastFx.js
 * ----------------------------------------------------------------------------
 * Expanding shockwave rings — the visual half of an explosion.
 *
 * Particles are great for debris and terrible for "this volume of space was
 * just very hot". A ring says that in one shape: it expands to exactly the
 * blast radius and fades, so the player learns how big a plasma splash is by
 * watching it once.
 *
 * Fixed pool, no allocation after construction, additive blending, drawn in
 * WORLD space by the Game between the rocks and the ship.
 */
import { TAU } from '../core/MathUtils.js';

export class BlastFx {
  constructor(capacity = 24) {
    this.capacity = capacity;
    /** @type {Array<object>} */
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        alive: false,
        x: 0, y: 0,
        radius: 0, // current
        maxRadius: 0,
        life: 0, maxLife: 1,
        color: '#ffb37a',
        width: 6,
        rings: 1,
        core: 0, // 0..1 brightness of the hot centre flash
      };
    }
    this.cursor = 0;
    this.liveCount = 0;
    /** Debug: blasts that had no free slot. */
    this.dropped = 0;
  }

  /**
   * @param {object} o { x, y, maxRadius, life, color, width, rings, core }
   * @returns {object|null}
   */
  spawn(o) {
    let b = null;
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.cursor + i) % this.capacity;
      if (!this.pool[idx].alive) {
        b = this.pool[idx];
        this.cursor = (idx + 1) % this.capacity;
        break;
      }
    }
    if (!b) {
      this.dropped++;
      return null;
    }

    b.alive = true;
    b.x = o.x;
    b.y = o.y;
    b.maxRadius = o.maxRadius ?? 120;
    b.radius = b.maxRadius * (o.startRadius ?? 0.12);
    b.maxLife = b.life = o.life ?? 0.45;
    b.color = o.color ?? '#ffb37a';
    b.width = o.width ?? 6;
    b.rings = o.rings ?? 1;
    b.core = o.core ?? 0.85;
    this.liveCount++;
    return b;
  }

  update(dt) {
    if (this.liveCount === 0) return;
    for (let i = 0; i < this.capacity; i++) {
      const b = this.pool[i];
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.alive = false;
        this.liveCount--;
        continue;
      }
      // Ease-out expansion: fast at first, settling as it fades.
      const t = 1 - b.life / b.maxLife;
      b.radius = b.maxRadius * (0.12 + 0.88 * (1 - (1 - t) * (1 - t)));
    }
  }

  render(ctx) {
    if (this.liveCount === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.capacity; i++) {
      const b = this.pool[i];
      if (!b.alive) continue;
      const t = b.life / b.maxLife; // 1 -> 0

      // Hot centre: a filled disc that dies in the first third.
      if (b.core > 0 && t > 0.66) {
        const k = (t - 0.66) / 0.34; // 1 -> 0
        ctx.globalAlpha = b.core * k * 0.8;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 0.85 * k, 0, TAU);
        ctx.fill();
      }

      // One or two rings, the second trailing slightly behind.
      for (let r = 0; r < b.rings; r++) {
        const lag = r * 0.18;
        const radius = b.radius * (1 - lag);
        if (radius <= 0) continue;
        ctx.globalAlpha = t * t * (r === 0 ? 0.9 : 0.4);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.width * (0.5 + t * 0.9) / (1 + r);
        ctx.beginPath();
        ctx.arc(b.x, b.y, radius, 0, TAU);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.pool[i].alive = false;
    this.liveCount = 0;
    this.dropped = 0;
  }
}

export default BlastFx;
