/**
 * ParticleSystem.js
 * ----------------------------------------------------------------------------
 * Fixed-size, zero-allocation particle pool for exhaust plumes, impact
 * sparks and (later) explosions, debris and coolant vents.
 *
 * Why a pool? Spawning `new Particle()` 600 times a second is the classic way
 * to make a mobile browser stutter on GC. Here we allocate once up front and
 * recycle dead slots forever — the render loop never allocates.
 *
 * Particles live in WORLD space, so they correctly streak behind a drifting
 * ship (they do NOT inherit ship velocity after emission — that's what makes
 * drifting look right).
 */
import { CONFIG } from '../config.js';

const DEFAULT_CAPACITY = 512;

export class ParticleSystem {
  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
    /** @type {Array<object>} */
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        alive: false,
        x: 0, y: 0,
        vx: 0, vy: 0,
        life: 0, maxLife: 1,
        size: 2,
        r: 255, g: 255, b: 255,
        drag: 2,
        shrink: 1,
        additive: true,
      };
    }
    this.cursor = 0;
    this.liveCount = 0;
  }

  /**
   * Spawn one particle. Silently drops the request when the pool is full
   * (better than allocating mid-frame).
   * @param {object} o
   */
  emit(o) {
    // Find a free slot, scanning at most the whole pool once.
    let p = null;
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.cursor + i) % this.capacity;
      if (!this.pool[idx].alive) {
        p = this.pool[idx];
        this.cursor = (idx + 1) % this.capacity;
        break;
      }
    }
    if (!p) return null; // pool saturated — drop

    p.alive = true;
    p.x = o.x ?? 0;
    p.y = o.y ?? 0;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.life = p.maxLife = o.life ?? 0.5;
    p.size = o.size ?? 2;
    p.drag = o.drag ?? 2;
    p.shrink = o.shrink ?? 1;
    p.additive = o.additive ?? true;

    const c = o.color ?? '#ffffff';
    const rgb = ParticleSystem._parseColor(c);
    p.r = rgb[0];
    p.g = rgb[1];
    p.b = rgb[2];

    return p;
  }

  /** Convenience: emit `n` particles with randomised spread. */
  burst(n, o) {
    for (let i = 0; i < n; i++) {
      const ang = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * Math.PI * 2;
      const spd = (o.speed ?? 100) * (0.4 + Math.random() * 0.6);
      this.emit({
        x: o.x + (Math.random() - 0.5) * (o.jitter ?? 0),
        y: o.y + (Math.random() - 0.5) * (o.jitter ?? 0),
        vx: Math.cos(ang) * spd + (o.vx ?? 0),
        vy: Math.sin(ang) * spd + (o.vy ?? 0),
        life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.7),
        size: (o.size ?? 2) * (0.6 + Math.random() * 0.8),
        color: o.color,
        drag: o.drag ?? 2,
        shrink: o.shrink ?? 1,
      });
    }
  }

  /** @param {number} dt fixed step */
  update(dt) {
    const pool = this.pool;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const p = pool[i];
      if (!p.alive) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }

      // Exponential drag keeps motion framerate-independent.
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      live++;
    }
    this.liveCount = live;
  }

  /**
   * Draw in WORLD space.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (this.liveCount === 0) return;
    const pool = this.pool;

    ctx.save();
    // Additive blending makes overlapping sparks bloom like hot plasma.
    ctx.globalCompositeOperation = 'lighter';

    let currentComposite = 'lighter';
    for (let i = 0; i < this.capacity; i++) {
      const p = pool[i];
      if (!p.alive) continue;

      if (p.additive !== (currentComposite === 'lighter')) {
        ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
        currentComposite = p.additive ? 'lighter' : 'source-over';
      }

      const t = p.life / p.maxLife; // 1 -> 0
      const size = p.size * (p.shrink ? t : 1);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${(t * 0.9).toFixed(3)})`;
      // Squares instead of arcs: with additive blending the difference is
      // invisible at these sizes and fillRect is dramatically cheaper.
      ctx.fillRect(p.x - size * 0.5, p.y - size * 0.5, size, size);
    }

    ctx.restore();
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.pool[i].alive = false;
    this.liveCount = 0;
  }

  /** Tiny colour cache so we don't re-parse hex strings every emission. */
  static _parseColor(color) {
    let cache = ParticleSystem._colorCache;
    if (!cache) cache = ParticleSystem._colorCache = new Map();
    let rgb = cache.get(color);
    if (rgb) return rgb;

    if (color[0] === '#') {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      const n = parseInt(hex, 16);
      rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else {
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(',').map((s) => parseFloat(s));
        rgb = [parts[0] | 0, parts[1] | 0, parts[2] | 0];
      } else {
        rgb = [255, 255, 255];
      }
    }
    cache.set(color, rgb);
    return rgb;
  }
}

ParticleSystem._colorCache = null;

export default ParticleSystem;
