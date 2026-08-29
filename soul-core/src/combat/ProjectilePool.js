/**
 * ProjectilePool.js
 * ----------------------------------------------------------------------------
 * Fixed-size pool of shells. No allocation after construction, which is the
 * whole point: the loop must not create garbage while you are flying.
 *
 * Shells are simulated by the Game (not by the weapon that fired them), so a
 * shell keeps flying after its mount is unequipped or the ship dies — the same
 * rule as particles.
 *
 *   update(dt, { world, enemies, grid, particles, blasts, events, camera })
 *   render(ctx, alpha)          // additive tracers in WORLD space
 *
 * ============================================================================
 * SHELL KINDS
 * ============================================================================
 * One pool, three behaviours — the difference lives in the shell's own data,
 * not in a subclass per weapon:
 *
 *   slug   (kinetic)  slow, huge single-target damage, kicks the ship on fire
 *   shell  (cannon)   fast, medium damage, no frills
 *   plasma (plasma)   medium damage + an AREA detonation, heavy heat on the
 *                     ship that fired it
 *
 * A plasma shell that expires mid-flight detonates where it is, so a miss
 * still lights up the void instead of blinking out.
 *
 * ============================================================================
 * BROAD-PHASE
 * ============================================================================
 * Enemy hits are resolved through a SpatialHash (passed in as `grid`) when one
 * is available: a shell only tests the handful of enemies whose grid cell its
 * step overlaps, instead of every enemy in the sector. With 30+ enemies and
 * 200 shells in flight that is the difference between ~6000 distance tests a
 * step and a few hundred. The flat scan is kept as a fallback so the pool
 * stays usable (and testable) without one.
 */
import { CONFIG } from '../config.js';

/** Fallback enemy radius when the caller doesn't tell us the real maximum. */
const DEFAULT_ENEMY_RADIUS = 32;

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
        coreColor: '#ffffff',
        kind: 'shell', // 'shell' | 'slug' | 'plasma'
        trail: 16, // tracer length in wu
        // Splash (0 = single target)
        splash: 0,
        splashDamage: 0,
        splashFalloff: 0.35,
        splashKnockback: 0,
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
    /** Debug: shells that actually connected. */
    this.hits = 0;

    /** Reused candidate list for broad-phase queries (never reallocated). */
    this._near = [];
    /** Separate list for detonations: `_detonate` can run while `update` is
     *  still holding results, and the two must not share a buffer. */
    this._blastNear = [];
  }

  /**
   * @param {object} o { x, y, vx, vy, damage, life, color, radius, weapon, mount,
   *                     kind, splash, splashDamage, splashFalloff, splashKnockback }
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
    p.coreColor = o.coreColor ?? '#ffffff';
    p.weapon = o.weapon ?? null;
    p.mount = o.mount ?? null;

    p.kind = o.kind ?? 'shell';
    p.trail = o.trail ?? (p.kind === 'slug' ? 26 : p.kind === 'plasma' ? 20 : 16);
    p.splash = o.splash ?? 0;
    p.splashDamage = o.splashDamage ?? 0;
    p.splashFalloff = o.splashFalloff ?? 0.35;
    p.splashKnockback = o.splashKnockback ?? 0;

    this.liveCount++;
    this.fired++;
    return p;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.pool[i].alive = false;
    this.liveCount = 0;
    this.spent = 0;
    this.fired = 0;
    this.hits = 0;
  }

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { world, enemies, grid, particles, blasts, events, camera }
   */
  update(dt, ctx) {
    if (this.liveCount === 0) return;
    const world = ctx.world;
    const enemies = ctx.enemies;
    const grid = ctx.grid ?? null;
    const particles = ctx.particles;
    const events = ctx.events;
    const bounds = world ? world.bounds : null;
    const scratch = world ? world._scratch ?? [] : [];
    const enemyRadius = ctx.maxEnemyRadius ?? DEFAULT_ENEMY_RADIUS;

    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;

      p.life -= dt;
      if (p.life <= 0) {
        // A plasma bolt that runs out of steam still goes off.
        if (p.splash > 0) this._detonate(p, p.x, p.y, ctx);
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
        if (p.splash > 0) this._detonate(p, p.x, p.y, ctx);
        else {
          particles?.burst(7, {
            x: p.x, y: p.y, speed: 210, life: 0.32, size: 2.6, color: p.color, drag: 3,
          });
        }
        this._kill(p);
        continue;
      }

      /* --- enemies: broad-phase first, exact test second ------------------- */
      if (enemies && enemies.length) {
        const searchR = p.radius + enemyRadius;
        let list = enemies;
        if (grid) {
          list = grid.query(p.x, p.y, searchR, this._near);
        }

        let hitEnemy = null;
        for (let k = 0; k < list.length; k++) {
          const e = list[k];
          if (!e.alive) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const rr = e.radius + p.radius;
          if (dx * dx + dy * dy > rr * rr) continue;
          hitEnemy = e;
          break;
        }

        if (hitEnemy) {
          if (p.splash > 0) {
            this._detonate(p, p.x, p.y, ctx, hitEnemy);
          } else {
            this._applyHit(p, hitEnemy, p.damage, ctx, { source: p.kind });
            particles?.burst(hitEnemy.alive ? 6 : 12, {
              x: p.x, y: p.y, speed: hitEnemy.alive ? 190 : 300, life: 0.34,
              size: hitEnemy.alive ? 2.4 : 3.4, color: hitEnemy.alive ? p.color : '#ffffff', drag: 3,
            });
          }
          this.hits++;
          this._kill(p);
        }
      }
    }
  }

  /**
   * Single-target damage + bookkeeping.
   * @param {object} p shell
   * @param {object} enemy
   * @param {number} amount
   * @param {object} ctx update context
   * @param {object} [info] extra damage-event fields
   */
  _applyHit(p, enemy, amount, ctx, info = {}) {
    if (amount <= 0) return false;
    const killed = enemy.takeDamage(
      amount,
      { source: info.source ?? 'shell', weapon: p.weapon, mount: p.mount, projectile: p },
      ctx.events,
    );
    if (p.weapon) p.weapon.damageDealt += amount;
    return killed;
  }

  /**
   * Area detonation: everything inside the blast takes damage that falls off
   * toward the edge, and gets shoved outwards. The direct target (if any) is
   * simply the enemy at the centre — it takes the falloff damage too, on top
   * of the direct hit, so a point-blank plasma shot is properly brutal.
   */
  _detonate(p, x, y, ctx, direct = null) {
    const radius = p.splash;
    const particles = ctx.particles;
    const events = ctx.events;

    if (direct) this._applyHit(p, direct, p.damage, ctx, { source: p.kind });

    if (radius > 0) {
      const enemies = ctx.enemies;
      const grid = ctx.grid ?? null;
      const list = grid
        ? grid.query(x, y, radius + (ctx.maxEnemyRadius ?? DEFAULT_ENEMY_RADIUS), this._blastNear)
        : enemies;
      // Snapshot the candidates: taking damage can kill an enemy mid-loop and
      // the broad-phase list is a live view of the grid's buckets.
      const n = list.length;
      for (let k = 0; k < n; k++) {
        const e = list[k];
        if (!e.alive || e === direct) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const d = Math.hypot(dx, dy);
        if (d > radius + e.radius) continue;

        // Linear falloff from full damage at the centre to `splashFalloff` at
        // the rim — enough to feel like a blast, not a maths exercise.
        const t = Math.min(1, d / Math.max(1, radius));
        const falloff = 1 - (1 - p.splashFalloff) * t;
        this._applyHit(p, e, p.splashDamage * falloff, ctx, { source: `${p.kind}:splash` });

        if (p.splashKnockback > 0 && d > 0.001) {
          const push = p.splashKnockback * falloff;
          e.applyImpulse?.((dx / d) * push, (dy / d) * push);
        }
      }
    }

    /* --- FX: the ring is the tutorial for how big the blast was ------------ */
    ctx.blasts?.spawn({
      x, y,
      maxRadius: Math.max(radius, 40),
      life: p.kind === 'plasma' ? 0.5 : 0.35,
      color: p.color,
      width: p.kind === 'plasma' ? 9 : 6,
      rings: p.kind === 'plasma' ? 2 : 1,
      core: 0.9,
    });
    particles?.burst(p.kind === 'plasma' ? 26 : 10, {
      x, y, speed: 320, life: 0.5, size: 3.4, color: p.color, drag: 2.4, jitter: 14,
    });
    // Kicking the camera is what makes a plasma hit feel heavy.
    ctx.camera?.addShake(p.kind === 'plasma' ? 3.2 : 1);
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

      // Tracer: a short streak showing the direction of travel. Slugs get a
      // longer one so a slow shell is still legible against the stars.
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const tx = x - (p.vx / sp) * p.trail;
      const ty = y - (p.vy / sp) * p.trail;

      ctx.globalAlpha = 0.35 * fade;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.radius * 1.8;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Plasma bolts get a soft corona so they read as "about to go off".
      if (p.kind === 'plasma') {
        ctx.globalAlpha = 0.3 * fade;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.radius * 0.72, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = p.coreColor;
      ctx.beginPath();
      ctx.arc(x, y, p.radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export default ProjectilePool;
