/**
 * Enemy.js
 * ----------------------------------------------------------------------------
 * A dummy target: the practice dummy of the sector. Stationary, dumb, and
 * deliberately simple — its only job right now is to exist so the targeting
 * manager has something to find and the lasers have something to cut.
 *
 * It is still a full Entity (transform, radius, hull, damage events), so the
 * hunters, drones and bosses of Phase 4 can subclass it rather than replace
 * the whole combat pipeline.
 *
 * Dummies respawn after `CONFIG.combat.enemies.respawnDelay` seconds so you
 * can test targeting indefinitely without restarting the run.
 */
import { CONFIG } from '../config.js';
import { Entity } from './Entity.js';
import { clamp, createRng, randRange, TAU } from '../core/MathUtils.js';

export class Enemy extends Entity {
  /**
   * @param {object} [opts]
   * @param {number} [opts.hull]
   * @param {number} [opts.respawnDelay] seconds; 0 = stays dead
   */
  constructor(opts = {}) {
    const cfg = CONFIG.combat.enemies;
    super({
      type: 'enemy',
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      angle: opts.angle ?? 0,
      radius: opts.radius ?? cfg.radius,
    });

    this.maxHull = opts.hull ?? cfg.hull;
    this.hull = this.maxHull;
    this.respawnDelay = opts.respawnDelay ?? cfg.respawnDelay;
    this.spin = opts.spin ?? 0.35; // slow idle rotation (pure flavour)

    /** 1 -> 0 flash when hit (render only). */
    this.hitFlash = 0;
    /** Seconds until it pops back up (0 while alive). */
    this.respawnTimer = 0;
    this.deaths = 0;
  }

  get hullRatio() {
    return clamp(this.hull / this.maxHull, 0, 1);
  }

  /**
   * @param {number} amount
   * @param {object} [info] { source, weapon }
   * @param {object} [events] event bus (to announce the kill)
   * @returns {boolean} true if this hit destroyed it
   */
  takeDamage(amount, info = {}, events = null) {
    if (!this.alive || amount <= 0) return false;
    this.hull = clamp(this.hull - amount, 0, this.maxHull);
    this.hitFlash = 1;

    if (this.hull <= 0) {
      this.alive = false;
      this.deaths++;
      this.respawnTimer = this.respawnDelay;
      events?.emit('enemy:destroyed', { enemy: this, x: this.x, y: this.y, ...info });
      return true;
    }
    return false;
  }

  /** @param {number} dt fixed step */
  update(dt, ctx = {}) {
    this.savePrevious();
    this.age += dt;

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 4);

    if (!this.alive) {
      if (this.respawnDelay > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
      }
      return;
    }

    this.angle += this.spin * dt;
  }

  respawn() {
    this.hull = this.maxHull;
    this.alive = true;
    this.respawnTimer = 0;
    this.hitFlash = 0.5;
  }

  /**
   * Placeholder art: a hexagon with a glowing core that dims as the hull
   * drops, plus a white flash on hit.
   */
  render(ctx, alpha) {
    if (!this.alive) {
      // A faint husk marks the wreck site while it rebuilds.
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = CONFIG.palette.gaugeCritical;
      ctx.lineWidth = 1.5 / (ctx.__zoom ?? 1);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.6, 0, TAU);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const r = this.radius;
    const p = CONFIG.palette;
    const health = this.hullRatio;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Hull
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(70, 26, 40, ${(0.55 + health * 0.35).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 90, 110, ${(0.45 + health * 0.5).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Core — bright when fresh, guttering as it dies
    ctx.fillStyle = `rgba(255, 140, 90, ${(0.35 + health * 0.6).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(r * 0.42, 0);
    ctx.lineTo(0, r * 0.28);
    ctx.lineTo(-r * 0.42, 0);
    ctx.lineTo(0, -r * 0.28);
    ctx.closePath();
    ctx.fill();

    // Hit flash
    if (this.hitFlash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hitFlash * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.7 + this.hitFlash * 0.5), 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // Hull ring: a thin arc that empties as it takes damage.
    if (health < 0.999) {
      ctx.save();
      ctx.strokeStyle = p.gaugeHull;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * health);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Scatter a field of dummies across a sector.
   * Half of them drop near the spawn point (so there is something to shoot
   * immediately), the rest are spread out to reward exploring.
   *
   * @param {object} opts
   * @param {import('../world/World.js').World} opts.world
   * @param {number} [opts.count]
   * @param {number} [opts.seed]
   * @param {{x:number,y:number}} [opts.avoid] keep clear of the player's start
   * @returns {Enemy[]}
   */
  static spawnField(opts) {
    const cfg = CONFIG.combat.enemies;
    const world = opts.world;
    const count = opts.count ?? cfg.count;
    const avoid = opts.avoid ?? { x: world.width * 0.5, y: world.height * 0.5 };
    const rng = createRng(opts.seed ?? world.seed ^ 0x9e3779b9);

    const out = [];
    const scratch = [];
    let attempts = 0;

    while (out.length < count && attempts < count * 60) {
      attempts++;

      let x;
      let y;
      if (rng() < 0.45) {
        // Ring around the drop point: instant target practice.
        const a = rng() * TAU;
        const d = cfg.minDistanceFromSpawn + rng() * 900;
        x = avoid.x + Math.cos(a) * d;
        y = avoid.y + Math.sin(a) * d;
      } else {
        x = randRange(rng, 80, world.width - 80);
        y = randRange(rng, 80, world.height - 80);
      }

      x = clamp(x, 60, world.width - 60);
      y = clamp(y, 60, world.height - 60);
      if (Math.hypot(x - avoid.x, y - avoid.y) < cfg.minDistanceFromSpawn) continue;

      // Never inside an asteroid.
      const near = world.queryNearby(x, y, cfg.radius + world.maxObstacleRadius, scratch);
      let blocked = false;
      for (let i = 0; i < near.length; i++) {
        const o = near[i];
        if (Math.hypot(o.x - x, o.y - y) < o.radius + cfg.radius + 40) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // ...or stacked on another dummy.
      let tooClose = false;
      for (let i = 0; i < out.length; i++) {
        if (Math.hypot(out[i].x - x, out[i].y - y) < cfg.radius * 3) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      out.push(new Enemy({ x, y, angle: rng() * TAU, spin: (rng() - 0.5) * 0.7 }));
    }

    return out;
  }
}

export default Enemy;
