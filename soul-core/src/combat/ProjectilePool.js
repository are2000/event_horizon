/**
 * ProjectilePool.js
 * ----------------------------------------------------------------------------
 * Fixed-size pool of cannon shells. No allocation after construction, which is
 * the whole point: the loop must not create garbage while you are flying.
 *
 * Shells are simulated by the Game (not by the weapon that fired them), so a
 * shell keeps flying after its mount is unequipped or the ship dies — the same
 * rule as particles.
 *
 *   update(dt, { world, enemies, particles, events })
 *   render(ctx, alpha)          // additive tracers in WORLD space
 */
import { CONFIG } from '../config.js';

export class ProjectilePool {
  constructor(capacity = CONFIG.combat.projectiles.capacity) {
    this.capacity = capacity;
    /** @type {Array<object>} */
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        alive: false,
        x: 0, y: 0, prevX: 0, prevY: 0,
        vx: 0, vy: 0,
        life: 0, maxLife: 1,
        damage: 0,
        radius: 6,
        color: '#ffffff',
        weapon: null,
        mount: null,
      };
    }
    this.cursor = 0;
    this.liveCount = 0;
    /** Debug: shots that expired without hitting anything. */
    this.spent = 0;
    /** Debug: total shells spawned (a hit removes one from `live` silently). */
    this.fired = 0;
  }

  /**
   * @param {object} o { x, y, vx, vy, damage, life, color, radius, weapon, mount }
   * @returns {object|null} the shell, or null when the pool is saturated
   */
  spawn(o) {
    let p = null;
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.cursor + i) % this.capacity;
      if (!this.pool[idx].alive) {
        p = this.pool[idx];
        this.cursor = (idx + 1) % this.capacity;
        break;
      }
    }
    if (!p) return null;

    p.alive = true;
    p.x = p.prevX = o.x;
    p.y = p.prevY = o.y;
    p.vx = o.vx;
    p.vy = o.vy;
    p.life = p.maxLife = o.life ?? CONFIG.combat.cannon.projectileLife;
    p.damage = o.damage ?? 10;
    p.radius = o.radius ?? CONFIG.combat.cannon.projectileRadius;
    p.color = o.color ?? CONFIG.combat.cannon.color;
    p.weapon = o.weapon ?? null;
    p.mount = o.mount ?? null;
    this.liveCount++;
    this.fired++;
    return p;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.pool[i].alive = false;
    this.liveCount = 0;
    this.spent = 0;
    this.fired = 0;
  }

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { world, enemies, particles, events }
   */
  update(dt, ctx) {
    if (this.liveCount === 0) return;
    const world = ctx.world;
    const enemies = ctx.enemies;
    const particles = ctx.particles;
    const events = ctx.events;
    const bounds = world ? world.bounds : null;
    const scratch = world ? world._scratch ?? [] : [];

    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;

      p.life -= dt;
      if (p.life <= 0) {
        this._kill(p);
        this.spent++;
        continue;
      }

      p.prevX = p.x;
      p.prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      /* --- out of bounds -------------------------------------------------- */
      if (bounds && (p.x < bounds.x || p.y < bounds.y || p.x > bounds.x + bounds.width || p.y > bounds.y + bounds.height)) {
        this._kill(p);
        this.spent++;
        continue;
      }

      /* --- asteroids ------------------------------------------------------ */
      let hitRock = false;
      if (world) {
        world.queryNearby(p.x, p.y, p.radius + world.maxObstacleRadius, scratch);
        for (let k = 0; k < scratch.length; k++) {
          const o = scratch[k];
          const dx = p.x - o.x;
          const dy = p.y - o.y;
          const rr = o.radius + p.radius;
          if (dx * dx + dy * dy <= rr * rr) {
            hitRock = true;
            break;
          }
        }
      }
      if (hitRock) {
        particles?.burst(7, {
          x: p.x, y: p.y, speed: 210, life: 0.32, size: 2.6, color: p.color, drag: 3,
        });
        this._kill(p);
        continue;
      }

      /* --- enemies (the list is small: a flat scan beats a spatial index) -- */
      if (enemies) {
        for (let k = 0; k < enemies.length; k++) {
          const e = enemies[k];
          if (!e.alive) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const rr = e.radius + p.radius;
          if (dx * dx + dy * dy > rr * rr) continue;

          const killed = e.takeDamage(p.damage, { source: 'cannon', weapon: p.weapon, mount: p.mount, projectile: p }, events);
          if (p.weapon) p.weapon.damageDealt += p.damage;
          particles?.burst(killed ? 12 : 6, {
            x: p.x, y: p.y, speed: killed ? 300 : 190, life: 0.34,
            size: killed ? 3.4 : 2.4, color: killed ? '#ffffff' : p.color, drag: 3,
          });
          this._kill(p);
          break;
        }
      }
    }
  }

  _kill(p) {
    if (!p.alive) return;
    p.alive = false;
    p.weapon = null;
    p.mount = null;
    this.liveCount--;
  }

  /** Draw shells in WORLD space (additive, so they read as hot). */
  render(ctx, alpha) {
    if (this.liveCount === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;

      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      const fade = Math.min(1, p.life / Math.max(0.001, p.maxLife * 0.35));

      // Tracer: a short streak showing the direction of travel.
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const tx = x - (p.vx / sp) * 16;
      const ty = y - (p.vy / sp) * 16;

      ctx.globalAlpha = 0.35 * fade;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.radius * 1.8;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.radius * 0.72, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, p.radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export default ProjectilePool;
