/**
 * Scavenger.js
 * ----------------------------------------------------------------------------
 * The first enemy that fights back: a raider that turns toward you, burns for
 * you, and tries to ram you.
 *
 * It is an `Enemy` subclass that overrides exactly one method — `_behave()` —
 * plus its own art. Everything else (hull, hit flash, damage events, respawn
 * timer, the hull ring) is inherited, which means the whole existing combat
 * pipeline — targeting, arc limits, lasers, shells — already works on it with
 * no changes.
 *
 * STEERING (deliberately simple, and deliberately imperfect)
 *
 *   desired = bearing to the ship + a sine wobble      (so they weave)
 *   angle   = rotateToward(angle, desired, turnRate*dt) (they CARVE, never snap)
 *   thrust  = damped 0..1, applied along the heading
 *
 * Turn rate is the whole difficulty knob: at 2.0 rad/s a raider cannot corner
 * with the ship (7.0 rad/s), so the counter-play is to turn inside it — unless
 * you are hauling cargo, in which case the weight system slows your turn rate
 * down and the raiders suddenly can keep up. That is the intended pressure:
 * being heavy makes you prey.
 *
 * They are slower than the ship on purpose (230 vs 560 wu/s). You can always
 * run from a fight; you cannot always run from the clock.
 *
 * ============================================================================
 * THE ORBIT TRAP (and how it is avoided)
 * ============================================================================
 * A pursuer that always flies at full speed has a fixed minimum turn radius:
 *
 *   r = speed / turnRate = 230 / 2.0 = 115 wu
 *
 * If it ever ends up pointing away from the ship, that circle's closest
 * approach is sqrt(d² + r²) - r — for d = 200 wu that is 116 wu. In other
 * words it ORBITS the ship at ~116 wu forever and never lands a ram, which
 * makes a stationary player completely safe. Wrong.
 *
 * The fix is the classic "arrival" behaviour: throttle down while the bearing
 * error is large. Slower flight shrinks the turn radius (r scales with speed),
 * so a raider that is pointed the wrong way slows to ~35%, pivots tightly,
 * and then drives straight in. The weave fades out on the approach for the
 * same reason.
 */
import { CONFIG } from '../config.js';
import { Enemy } from './Enemy.js';
import { clamp, damp, rotateToward, TAU, wrapAngle } from '../core/MathUtils.js';

export class Scavenger extends Enemy {
  /**
   * @param {object} [opts]
   * @param {number} [opts.x]
   * @param {number} [opts.y]
   * @param {number} [opts.hull]
   * @param {number} [opts.scrapValue] how much scrap it drops
   */
  constructor(opts = {}) {
    const cfg = CONFIG.combat.scavengers;
    super({
      ...opts,
      enemyType: 'scavenger',
      radius: opts.radius ?? cfg.radius,
      hull: opts.hull ?? cfg.hull,
      respawnDelay: opts.respawnDelay ?? cfg.respawnDelay,
      spin: 0, // it steers; the idle spin would fight the rudder
      scrapValue: opts.scrapValue ?? (CONFIG.economy.scrap.min
        + Math.random() * (CONFIG.economy.scrap.max - CONFIG.economy.scrap.min)),
    });

    // NOTE: `speed` is a READ-ONLY getter on Entity (|velocity|), so the
    // raider's top speed has to be named something else.
    this.maxSpeed = opts.speed ?? cfg.speed;
    this.accel = opts.accel ?? cfg.accel;
    this.turnRate = opts.turnRate ?? cfg.turnRate;
    this.drag = opts.drag ?? cfg.drag;
    this.aggroRange = opts.aggroRange ?? cfg.aggroRange;
    this.weave = opts.weave ?? cfg.weave;
    this.weaveRate = opts.weaveRate ?? cfg.weaveRate;
    this.obstacleAvoid = opts.obstacleAvoid ?? cfg.obstacleAvoid;

    /** Ramming (read by CollisionSystem). */
    this.contactDamage = opts.contactDamage ?? cfg.contactDamage;
    this.corrosionDamage = opts.corrosionDamage ?? cfg.corrosionDamage;
    this.knockback = opts.knockback ?? cfg.knockback;
    this.ramCooldownTime = cfg.ramCooldown;
    /** Seconds until this raider can bite again (0 = ready). */
    this.ramCooldown = 0;

    /** 0..1 engine flare (render only). */
    this.thrust = 0;
    /** cos(bearing error): 1 = pointed at the ship (drives the arrival throttle). */
    this.align = 1;
    /** Current speed ceiling — shrinks while turning, see the header. */
    this.speedCap = this.maxSpeed;
    /** Bearing to the ship on the last step (render + AI readability). */
    this.bearing = 0;
    /** Last place we saw the player — used to respawn somewhere else. */
    this.lastShipX = null;
    this.lastShipY = null;
    this.world = opts.world ?? null;

    this.phase = Math.random() * TAU; // desync the weave across the pack
    this.vx = 0;
    this.vy = 0;
  }

  /** True while it is actually chasing (render + AI tells). */
  get hunting() {
    return this.thrust > 0.15;
  }

  /* ----------------------------------------------------------------- tick -- */

  _behave(dt, ctx) {
    const ship = ctx?.ship;
    const world = ctx?.world ?? this.world;
    if (world) this.world = world;

    if (this.ramCooldown > 0) this.ramCooldown = Math.max(0, this.ramCooldown - dt);

    // On game over `ship.alive` is false, so raiders coast to a stop instead
    // of swarming the wreck.
    if (!ship || !ship.alive) {
      // Nothing to hunt: coast to a stop and idle.
      this.thrust = damp(this.thrust, 0, 3, dt);
      this.angle += 0.25 * dt;
    } else {
      this.lastShipX = ship.x;
      this.lastShipY = ship.y;
      this.speedCap = this.maxSpeed; // default until the maths below runs

      const dx = ship.x - this.x;
      const dy = ship.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      this.bearing = Math.atan2(dy, dx);

      const inRange = dist <= this.aggroRange;
      this.thrust = damp(this.thrust, inRange ? 1 : 0, 5, dt);

      // Weave on the way in (so a pack drifts in as a cloud), fading to a
      // straight line for the final approach.
      const wobble = Math.sin(this.age * this.weaveRate + this.phase)
        * this.weave * Math.min(1, dist / 400);
      const desired = this.bearing + wobble;
      this.angle = rotateToward(this.angle, desired, this.turnRate * dt);

      // ARRIVAL: two speed limits, whichever is lower.
      //   1. TURN LIMIT — never fly faster than you can corner at this range
      //      (v = d * turnRate keeps the turn radius inside the distance).
      //   2. ALIGN LIMIT — ease off while the nose is off the bearing.
      // A slower raider turns in a tighter circle, so both of these are what
      // stop it orbiting a stationary ship instead of ramming it (see header).
      const err = Math.abs(wrapAngle(this.bearing - this.angle));
      this.align = Math.cos(err); // 1 = dead ahead, -1 = facing away
      const turnCap = dist * this.turnRate * 0.6;
      const alignCap = this.maxSpeed * (0.35 + 0.65 * Math.max(0, this.align));
      this.speedCap = clamp(Math.min(turnCap, alignCap), this.maxSpeed * 0.3, this.maxSpeed);
    }

    /* --- integrate --------------------------------------------------------- */
    this.vx += Math.cos(this.angle) * this.accel * this.thrust * dt;
    this.vy += Math.sin(this.angle) * this.accel * this.thrust * dt;

    // Rocks are solid: steer around them rather than grinding along the hull.
    if (this.world) this._avoidObstacles(dt);

    const d = Math.exp(-this.drag * dt);
    this.vx *= d;
    this.vy *= d;

    // `speedCap` is the arrival throttle; maxSpeed remains the hard ceiling.
    const cap = Math.min(this.maxSpeed, this.speedCap ?? this.maxSpeed);
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > cap) {
      const k = cap / sp;
      this.vx *= k;
      this.vy *= k;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Stay inside the sector (bounce, so they never escape the playfield).
    if (this.world) {
      const b = this.world.bounds;
      const r = this.radius;
      if (this.x < b.x + r) { this.x = b.x + r; this.vx = Math.abs(this.vx) * 0.5; }
      else if (this.x > b.x + b.width - r) { this.x = b.x + b.width - r; this.vx = -Math.abs(this.vx) * 0.5; }
      if (this.y < b.y + r) { this.y = b.y + r; this.vy = Math.abs(this.vy) * 0.5; }
      else if (this.y > b.y + b.height - r) { this.y = b.y + b.height - r; this.vy = -Math.abs(this.vy) * 0.5; }
    }
  }

  /** Cheap repulsion from nearby rocks (the world's own spatial hash). */
  _avoidObstacles(dt) {
    const near = this.world.queryNearby(this.x, this.y, this.obstacleAvoid, this.world._scratch);
    if (!near.length) return;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = o.radius + this.obstacleAvoid;
      if (d >= reach) continue;
      // Push harder the closer it is, and only ever outwards.
      const push = (1 - d / reach) * this.accel * 2.2 * dt;
      this.vx += (dx / d) * push;
      this.vy += (dy / d) * push;
    }
  }

  /** Revive away from the player so the pack never materialises in your lap. */
  respawn() {
    super.respawn(); // hull, flash, timer
    this.vx = 0;
    this.vy = 0;
    this.thrust = 0;

    const w = this.world;
    const cfg = CONFIG.combat.scavengers;
    if (!w) return;
    const ax = this.lastShipX ?? w.width * 0.5;
    const ay = this.lastShipY ?? w.height * 0.5;

    for (let attempt = 0; attempt < 12; attempt++) {
      const a = Math.random() * TAU;
      const dist = cfg.respawnMinDistance * (1 + Math.random() * 0.6);
      const x = clamp(ax + Math.cos(a) * dist, 60, w.width - 60);
      const y = clamp(ay + Math.sin(a) * dist, 60, w.height - 60);
      if (Math.hypot(x - ax, y - ay) < cfg.respawnMinDistance * 0.8) continue;

      const near = w.queryNearby(x, y, this.radius + w.maxObstacleRadius, w._scratch);
      let blocked = false;
      for (let i = 0; i < near.length; i++) {
        const o = near[i];
        if (Math.hypot(o.x - x, o.y - y) < o.radius + this.radius + 30) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      this.teleport(x, y, Math.random() * TAU);
      return;
    }
    // Fallback: somewhere on the far side of the sector.
    this.teleport(
      clamp(w.width - this.x, 60, w.width - 60),
      clamp(w.height - this.y, 60, w.height - 60),
      Math.random() * TAU,
    );
  }

  /* ---------------------------------------------------------------- render -- */

  /**
   * Placeholder art: a dart — wide at the back, sharp at the front — in the
   * raider's rust-red, with an engine flare that only shows while it burns
   * for you. Distinct from the dummy's hexagon at a glance, which matters
   * when the two are mixed in one sector.
   */
  render(ctx, alpha) {
    if (!this.alive) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = CONFIG.palette.gaugeCritical;
      ctx.lineWidth = 1.5 / (ctx.__zoom ?? 1);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.55, 0, TAU);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const x = this.getRenderX(alpha);
    const y = this.getRenderY(alpha);
    const a = this.getRenderAngle(alpha);
    const r = this.radius;
    const health = this.hullRatio;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);

    /* --- engine flare ------------------------------------------------------ */
    if (this.thrust > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.thrust * (0.5 + 0.3 * Math.sin(this.age * 40 + this.phase));
      ctx.fillStyle = '#ff7a2f';
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, -r * 0.36);
      ctx.lineTo(-r * (1.25 + this.thrust * 0.6), 0);
      ctx.lineTo(-r * 0.75, r * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    /* --- hull: a dart ------------------------------------------------------ */
    ctx.beginPath();
    ctx.moveTo(r * 1.15, 0); // nose
    ctx.lineTo(-r * 0.55, r * 0.85); // starboard wingtip
    ctx.lineTo(-r * 0.2, 0); // tail notch
    ctx.lineTo(-r * 0.55, -r * 0.85); // port wingtip
    ctx.closePath();
    ctx.fillStyle = `rgba(96, 32, 44, ${(0.6 + health * 0.3).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 106, 128, ${(0.5 + health * 0.45).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Two "eyes" — the cockpit, and a cheap way to read its heading.
    ctx.fillStyle = `rgba(255, 190, 120, ${(0.4 + health * 0.5).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(r * 0.28, 0, r * 0.2, 0, TAU);
    ctx.fill();

    if (this.hitFlash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hitFlash * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.8 + this.hitFlash * 0.5), 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    /* --- hull ring, same language as the dummies --------------------------- */
    if (health < 0.999) {
      ctx.save();
      ctx.strokeStyle = CONFIG.palette.gaugeHull;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * health);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Scatter raiders across a sector (shares the dummy placement maths).
   * @param {object} opts @see Enemy.spawnField
   * @returns {Scavenger[]}
   */
  static spawnField(opts) {
    return Enemy.spawnField({ ...opts, Class: Scavenger });
  }
}

export default Scavenger;
