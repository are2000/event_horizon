/**
 * Ship.js
 * ----------------------------------------------------------------------------
 * The player ship: flight model + the four core system gauges.
 *
 *   - `ship.stats`      : capacities (maxWeight, maxPower, maxHeat, maxHull,
 *                         coolingRate, corrosionRate, engineThrust) and the
 *                         live values (weight, power, heat, hull,
 *                         coreCorrosion). Systems read and write these.
 *   - `ship.modifiers`  : aggregate multipliers recomputed EVERY fixed step by
 *     SystemsManager (from stats + installed systems). Physics reads only
 *     these — it never knows *why* it got slower.
 *
 * Physics model (arcade-drifter, framerate independent)
 * ----------------------------------------------------
 *   1. STEERING: the hull rotates toward the stick direction at `turnRate`.
 *   2. THRUST:   applied along the HEADING, not along the stick. This is the
 *                key to feeling like a spaceship: you must turn to change
 *                direction, so momentum carries you past corners. Thrust also
 *                falls off as (1 - (v/softMax)²), so top speed is reached
 *                smoothly instead of being hard-clamped.
 *   3. DRAG:     weak quadratic (v²) + a touch of linear friction — just
 *                enough that a derelict eventually stops, not enough to kill
 *                the glide. Coast half-life is ~0.9s at cruise speed.
 *   4. GRIP:     velocity is decomposed into forward/lateral relative to the
 *                heading, and the LATERAL part is bled off at `grip` (1/s).
 *                Low grip = long, icy drifts. High grip = tight, arcadey.
 *                This single number is the "drift" dial for the whole game,
 *                and Corrosion will eat into it later.
 *
 * All integration is explicit-Euler on a FIXED step with dt-corrected
 * exponentials, so behaviour is identical on 60Hz and 144Hz devices.
 */
import { CONFIG } from '../config.js';
import { Entity } from './Entity.js';
import { clamp, damp, dampAngle, length } from '../core/MathUtils.js';

/** Neutral modifier set — every system multiplies on top of these. */
export function createModifiers() {
  return {
    massMul: 1, // (reserved: impulse/mass based forces, recoil)
    thrustMul: 1, // engine output
    turnRateMul: 1, // agility
    gripMul: 1, // lateral friction multiplier (drift)
    dragMul: 1, // overall drag
    maxSpeedMul: 1, // top speed
    heatRateMul: 1, // (reserved)
    coolingMul: 1, // (reserved)
    powerMul: 1, // (reserved)
    corrosionMul: 1, // (reserved)
  };
}

export class Ship extends Entity {
  /**
   * Fresh stat block. Capacities are ratings that upgrades/meta-progression
   * can raise; the live values are what the systems push around every step.
   */
  static createStats(overrides = {}) {
    const s = CONFIG.systems;
    const stats = {
      /* ---- capacities / ratings ---------------------------------------- */
      maxWeight: s.maxWeight, // cargo capacity
      maxPower: s.maxPower, // capacitor size
      maxHeat: s.maxHeat, // thermal ceiling (the redline)
      maxHull: s.maxHull, // structural integrity
      coolingRate: s.coolingRate, // heat units dissipated per second
      corrosionRate: s.corrosionRate, // corrosion % per second
      engineThrust: CONFIG.ship.engineThrust, // wu/s² — the raw pull of the drive

      /* ---- live values --------------------------------------------------- */
      weight: 0, // currently carried mass (0..maxWeight)
      power: s.maxPower, // charge left in the capacitor (0..maxPower)
      heat: 0, // 0..maxHeat*heatCeiling (may overshoot the ceiling)
      hull: s.maxHull, // 0..maxHull
      coreCorrosion: 0, // 0..100 — 100 = MELTDOWN
    };

    for (const key in overrides) stats[key] = overrides[key];

    // A fresh (or freshly serviced) ship starts topped up: if the caller
    // raised a capacity without specifying the live value, fill it to match.
    if (overrides.power === undefined) stats.power = stats.maxPower;
    if (overrides.hull === undefined) stats.hull = stats.maxHull;

    // ...and nothing ever starts outside its legal range.
    stats.power = clamp(stats.power, 0, stats.maxPower);
    stats.hull = clamp(stats.hull, 0, stats.maxHull);
    stats.weight = clamp(stats.weight, 0, stats.maxWeight);
    stats.coreCorrosion = clamp(stats.coreCorrosion, 0, 100);
    stats.heat = Math.max(0, stats.heat);
    return stats;
  }

  constructor(opts = {}) {
    super({
      type: 'ship',
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      angle: opts.angle ?? -Math.PI / 2, // nose up at spawn
      radius: opts.radius ?? CONFIG.ship.radius,
    });

    const c = CONFIG.ship;
    this.maxSpeed = opts.maxSpeed ?? c.maxSpeed; // wu/s (tuning target)
    this.softMaxSpeed = opts.softMaxSpeed ?? c.softMaxSpeed; // thrust cutoff
    this.dragCoef = opts.dragCoef ?? c.dragCoef; // quadratic
    this.linearDrag = opts.linearDrag ?? c.linearDrag; // 1/s
    this.grip = opts.grip ?? c.grip; // 1/s lateral friction
    this.turnRate = opts.turnRate ?? c.turnRate; // rad/s
    this.restitution = opts.restitution ?? c.restitution;

    this.length = opts.length ?? c.length; // visual only

    /** Capacities + live gauges. Systems own the numbers, the ship owns the box. */
    this.stats = Ship.createStats(opts.stats);

    /** Recomputed by SystemsManager every fixed step. */
    this.modifiers = createModifiers();

    /** Telemetry / FX state. */
    this.throttle = 0; // smoothed 0..1 (for flames, audio, heat)
    this.currentAccel = 0; // wu/s² the drive can produce right now
    this.speedValue = 0; // |velocity| in wu/s (cached; HUD + systems read it)
    this.forwardSpeed = 0; // signed, along heading
    this.lateralSpeed = 0; // signed, perpendicular → THE DRIFT VALUE
    this.headingX = Math.cos(this.angle);
    this.headingY = Math.sin(this.angle);

    this._exhaustAccum = 0;
    this._hitCooldown = 0;
  }

  /* =========================================================== gauges ====== */
  /* Ratios are what the systems, HUD and modifiers all speak in: 0 = empty,
     1 = at the rated maximum. `heatRatio` can exceed 1 (that is the redline). */

  /** currentWeight / maxWeight — drives acceleration and turn rate. */
  get weightRatio() {
    return clamp(this.stats.weight / this.stats.maxWeight, 0, 1);
  }

  /** heat / maxHeat — > 1 means the core is overheating. */
  get heatRatio() {
    return this.stats.heat / this.stats.maxHeat;
  }

  /** power / maxPower. */
  get powerRatio() {
    return clamp(this.stats.power / this.stats.maxPower, 0, 1);
  }

  /** hull / maxHull. */
  get hullRatio() {
    return clamp(this.stats.hull / this.stats.maxHull, 0, 1);
  }

  /** coreCorrosion / 100 — 1 is a meltdown. */
  get corrosionRatio() {
    return clamp(this.stats.coreCorrosion / 100, 0, 1);
  }

  /** How far into the redline band (maxHeat -> maxHeat*ceiling) we are, 0..1. */
  get overheatSeverity() {
    const ceiling = CONFIG.systems.heatCeiling;
    return clamp((this.heatRatio - 1) / Math.max(0.0001, ceiling - 1), 0, 1);
  }

  get isOverheating() {
    return this.stats.heat > this.stats.maxHeat;
  }

  get isOverloaded() {
    return this.weightRatio >= 0.999;
  }

  /* ====================================================== resource API ===== */
  /* Systems (and later: weapons, boosters, shields) move the gauges through
     these four methods so every write is clamped in exactly one place. */

  /**
   * PLACEHOLDER CONSUMER: draw power from the capacitor.
   * Returns the amount actually delivered — a partial result means brownout,
   * and the caller decides how to degrade (the drive just gets weaker).
   *
   * @param {number} amount units of power requested
   * @returns {number} units actually delivered
   */
  consumePower(amount) {
    if (amount <= 0) return 0;
    const delivered = Math.min(amount, this.stats.power);
    this.stats.power = clamp(this.stats.power - delivered, 0, this.stats.maxPower);
    return delivered;
  }

  /** PLACEHOLDER GENERATOR: dump heat into the core (weapons, drive, boosts). */
  generateHeat(amount) {
    if (amount <= 0) return 0;
    const ceiling = this.stats.maxHeat * CONFIG.systems.heatCeiling;
    const before = this.stats.heat;
    this.stats.heat = clamp(this.stats.heat + amount, 0, ceiling);
    return this.stats.heat - before;
  }

  /** Restore charge in the capacitor (solar trim, docking, pickups). */
  restorePower(amount) {
    this.stats.power = clamp(this.stats.power + amount, 0, this.stats.maxPower);
    return this.stats.power;
  }

  /** Load cargo/salvage. Returns the amount that actually fit. */
  addWeight(amount) {
    const before = this.stats.weight;
    this.stats.weight = clamp(this.stats.weight + amount, 0, this.stats.maxWeight);
    return this.stats.weight - before;
  }

  /**
   * Dump cargo to get acceleration back.
   * @param {number} [amount] omit to jettison everything
   */
  jettisonCargo(amount) {
    const drop = amount === undefined ? this.stats.weight : Math.min(amount, this.stats.weight);
    this.stats.weight = clamp(this.stats.weight - drop, 0, this.stats.maxWeight);
    return drop;
  }

  /** Apply hull damage. Returns the new hull value. */
  damage(amount) {
    if (amount <= 0 || !this.alive) return this.stats.hull;
    this.stats.hull = clamp(this.stats.hull - amount, 0, this.stats.maxHull);
    if (this.stats.hull <= 0) this.alive = false; // HullSystem emits 'ship:destroyed'
    return this.stats.hull;
  }

  repair(amount) {
    this.stats.hull = clamp(this.stats.hull + amount, 0, this.stats.maxHull);
    if (this.stats.hull > 0) this.alive = true;
    return this.stats.hull;
  }

  /** Scrub corrosion off the core (repair bay, consumable, meta upgrade). */
  cleanCorrosion(amount) {
    this.stats.coreCorrosion = clamp(this.stats.coreCorrosion - amount, 0, 100);
    return this.stats.coreCorrosion;
  }

  /**
   * Back to factory fresh — used by Game.restart(). Systems are reset
   * separately through SystemsManager.reset().
   */
  reset(x = this.x, y = this.y, angle = -Math.PI / 2) {
    const upgrades = {
      // Ratings bought in the meta layer survive a restart; gauges do not.
      maxWeight: this.stats.maxWeight,
      maxPower: this.stats.maxPower,
      maxHeat: this.stats.maxHeat,
      maxHull: this.stats.maxHull,
      coolingRate: this.stats.coolingRate,
      corrosionRate: this.stats.corrosionRate,
      engineThrust: this.stats.engineThrust,
    };
    this.stats = Ship.createStats(upgrades);
    for (const key in this.modifiers) this.modifiers[key] = 1;
    this.teleport(x, y, angle);
    this.vx = 0;
    this.vy = 0;
    this.throttle = 0;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.speedValue = 0;
    this.alive = true;
    this.visible = true;
    this._hitCooldown = 0;
    this._exhaustAccum = 0;
    return this;
  }

  /* ------------------------------------------------------------------ tick -- */

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { input, world, particles, camera, events, time, dt }
   */
  update(dt, ctx) {
    this.savePrevious();
    this.age += dt;

    const input = ctx.input ? ctx.input.axis : ZERO;
    const rawThrottle = clamp(length(input.x, input.y), 0, 1);

    // Smoothed throttle: nicer flames, and a stable value for systems/audio.
    this.throttle = damp(this.throttle, rawThrottle, 16, dt);

    /* 1. STEERING ---------------------------------------------------------- */
    if (rawThrottle > 0.02) {
      const targetAngle = Math.atan2(input.y, input.x);
      const rate = this.turnRate * this.modifiers.turnRateMul;
      // Exponential approach = snappy at first, gentle at the end, and it
      // never overspins. dt-corrected, so 120Hz isn't twice as agile.
      this.angle = dampAngle(this.angle, targetAngle, rate, dt);
    }

    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    this.headingX = cos;
    this.headingY = sin;

    /* 2. THRUST (along heading, with speed falloff) ------------------------ */
    //   Actual Acceleration = EngineThrust * (1 - weight/maxWeight) * modifiers
    // The load term lives in WeightSystem (so cargo, salvage and upgrades all
    // flow through the same modifier pipeline as power/heat/corrosion), and
    // `engineThrust` is the ship's rated pull in wu/s².
    //
    // Instead of clamping the speed (which feels like hitting a wall) the
    // drive also loses authority as it approaches its rated maximum:
    //   thrust(v) = accel * throttle * (1 - (v / softMax)²)
    // Result: brisk acceleration, a smooth asymptote to top speed, and — because
    // real drag stays low — a long glide once the stick is released.
    const speedMul = this.modifiers.maxSpeedMul;
    const softMax = this.softMaxSpeed * speedMul;
    const vNow = length(this.vx, this.vy);
    const falloff = vNow < softMax ? 1 - (vNow / softMax) * (vNow / softMax) : 0;
    const accel = this.stats.engineThrust * this.modifiers.thrustMul * rawThrottle * falloff;
    // Exposed for the HUD / debug overlay: wu/s² the drive is producing now.
    this.currentAccel = this.stats.engineThrust * this.modifiers.thrustMul;
    if (accel > 0) {
      this.vx += cos * accel * dt;
      this.vy += sin * accel * dt;
    }

    /* 3. DRAG -------------------------------------------------------------- */
    let speed = length(this.vx, this.vy);
    if (speed > 1e-4) {
      // Quadratic term sets the natural top speed; linear term stops the ship
      // from creeping forever at 2 wu/s.
      const dragAccel = speed * speed * this.dragCoef * this.modifiers.dragMul + speed * this.linearDrag;
      const dec = Math.min(speed, dragAccel * dt); // never reverse direction
      const inv = 1 / speed;
      this.vx -= this.vx * inv * dec;
      this.vy -= this.vy * inv * dec;
      speed -= dec;
    }

    /* 4. GRIP / DRIFT ------------------------------------------------------ */
    // Split velocity into "along the nose" and "sliding sideways".
    const fwd = this.vx * cos + this.vy * sin;
    const lat = -this.vx * sin + this.vy * cos;
    const keptLat = lat * Math.exp(-this.grip * this.modifiers.gripMul * dt);
    this.vx = fwd * cos - keptLat * sin;
    this.vy = fwd * sin + keptLat * cos;

    this.forwardSpeed = fwd;
    this.lateralSpeed = keptLat;

    /* 5. SAFETY CLAMP ------------------------------------------------------ */
    // The falloff above should keep us under softMax; this only catches
    // external pushes (bounces, future explosions/tractor beams).
    const hardMax = softMax * 1.05;
    speed = length(this.vx, this.vy);
    if (speed > hardMax && speed > 1e-4) {
      const s = hardMax / speed;
      this.vx *= s;
      this.vy *= s;
      speed = hardMax;
    }
    this.speedValue = speed;

    /* 6. INTEGRATE ---------------------------------------------------------- */
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    /* 7. COLLISIONS --------------------------------------------------------- */
    if (this._hitCooldown > 0) this._hitCooldown -= dt;
    if (ctx.world) {
      this._collideWithBounds(ctx);
      this._collideWithObstacles(ctx);
    }

    /* 8. ENGINE FX ---------------------------------------------------------- */
    this._emitExhaust(ctx, dt);
  }

  /* ----------------------------------------------------------- collisions -- */

  _collideWithBounds(ctx) {
    const b = ctx.world.bounds;
    const r = this.radius;
    let hit = 0;

    if (this.x - r < b.x) {
      this.x = b.x + r;
      if (this.vx < 0) hit = -this.vx;
      this.vx = -this.vx * this.restitution;
    } else if (this.x + r > b.x + b.width) {
      this.x = b.x + b.width - r;
      if (this.vx > 0) hit = this.vx;
      this.vx = -this.vx * this.restitution;
    }

    if (this.y - r < b.y) {
      this.y = b.y + r;
      if (this.vy < 0) hit = Math.max(hit, -this.vy);
      this.vy = -this.vy * this.restitution;
    } else if (this.y + r > b.y + b.height) {
      this.y = b.y + b.height - r;
      if (this.vy > 0) hit = Math.max(hit, this.vy);
      this.vy = -this.vy * this.restitution;
    }

    if (hit > 40) this._onImpact(ctx, hit, -Math.sign(this.vx), -Math.sign(this.vy));
  }

  _collideWithObstacles(ctx) {
    const world = ctx.world;
    const candidates = world.queryNearby(this.x, this.y, this.radius + world.maxObstacleRadius, world._scratch);

    for (let i = 0; i < candidates.length; i++) {
      const o = candidates[i];
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const minDist = this.radius + o.radius;
      const dSq = dx * dx + dy * dy;
      if (dSq >= minDist * minDist) continue;

      let d = Math.sqrt(dSq);
      let nx;
      let ny;
      if (d < 1e-4) {
        // Degenerate case (spawned exactly on top): pick an arbitrary normal.
        nx = 1;
        ny = 0;
        d = 1e-4;
      } else {
        nx = dx / d;
        ny = dy / d;
      }

      // Positional correction: never let the ship sink into geometry.
      const penetration = minDist - d;
      this.x += nx * penetration;
      this.y += ny * penetration;

      // Reflect the velocity component along the normal.
      const vn = this.vx * nx + this.vy * ny;
      if (vn < 0) {
        const j = -(1 + this.restitution) * vn;
        this.vx += nx * j;
        this.vy += ny * j;
        this._onImpact(ctx, -vn, nx, ny);
      }
    }
  }

  _onImpact(ctx, impactSpeed, nx, ny) {
    if (this._hitCooldown > 0) return;
    this._hitCooldown = 0.08;

    const strength = clamp(impactSpeed / this.maxSpeed, 0, 1);

    // FX
    if (ctx.camera) ctx.camera.addShake(2 + strength * 12);
    if (ctx.particles) {
      ctx.particles.burst(6 + Math.round(strength * 18), {
        x: this.x - nx * this.radius,
        y: this.y - ny * this.radius,
        angle: Math.atan2(ny, nx),
        spread: Math.PI * 1.1,
        speed: 90 + strength * 340,
        life: 0.45,
        size: 3,
        color: CONFIG.palette.thrustCore,
        drag: 2.6,
      });
    }

    // This is where the future systems hook in, e.g.
    //   corrosion: bus.on('ship:impact', e => corrosion.add(e.speed * 0.0008))
    if (ctx.events) {
      ctx.events.emit('ship:impact', {
        ship: this,
        speed: impactSpeed,
        strength,
        x: this.x,
        y: this.y,
        nx,
        ny,
      });
    }
  }

  /* ----------------------------------------------------------------- fx -- */

  _emitExhaust(ctx, dt) {
    if (!ctx.particles || this.throttle < 0.04) return;

    // Emission rate scales with throttle; the accumulator keeps it stable
    // regardless of the fixed step size.
    this._exhaustAccum += this.throttle * 110 * dt;
    let count = Math.floor(this._exhaustAccum);
    if (count <= 0) return;
    this._exhaustAccum -= count;
    if (count > 6) count = 6; // per-step budget

    const cos = this.headingX;
    const sin = this.headingY;
    // Nozzle sits at the tail of the hull.
    const ex = this.x - cos * this.radius * 0.85;
    const ey = this.y - sin * this.radius * 0.85;

    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.7;
      const ca = Math.cos(this.angle + Math.PI + spread);
      const sa = Math.sin(this.angle + Math.PI + spread);
      const spd = (150 + Math.random() * 220) * (0.4 + this.throttle * 0.8);

      ctx.particles.emit({
        x: ex + (Math.random() - 0.5) * 6,
        y: ey + (Math.random() - 0.5) * 6,
        // A fraction of ship velocity is inherited, so a fast ship leaves a
        // longer plume — but not 100%, or the exhaust would look glued on.
        vx: this.vx * 0.25 + ca * spd,
        vy: this.vy * 0.25 + sa * spd,
        life: 0.22 + Math.random() * 0.28,
        size: 3 + Math.random() * 3 * this.throttle,
        color: Math.random() < 0.35 ? CONFIG.palette.thrustCore : CONFIG.palette.thrust,
        drag: 3.2,
      });
    }
  }

  /* --------------------------------------------------------------- render -- */

  /**
   * Placeholder art: geometric hull + engine flame + drift indicators.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha
   */
  render(ctx, alpha) {
    const x = this.getRenderX(alpha);
    const y = this.getRenderY(alpha);
    const a = this.getRenderAngle(alpha);
    const p = CONFIG.palette;

    /* --- drift / velocity indicators (drawn under the hull) -------------- */
    const drift = Math.abs(this.lateralSpeed);
    if (drift > CONFIG.ship.driftFxThreshold) {
      const t = clamp((drift - CONFIG.ship.driftFxThreshold) / 260, 0, 1);
      const vLen = clamp(this.speedValue * 0.16, 0, 130);
      const inv = this.speedValue > 1e-3 ? 1 / this.speedValue : 0;
      ctx.save();
      ctx.globalAlpha = 0.18 + t * 0.35;
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + this.vx * inv * vLen, y + this.vy * inv * vLen);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);

    /* --- engine flame ---------------------------------------------------- */
    if (this.throttle > 0.03) {
      const flicker = 0.82 + Math.random() * 0.36;
      const flameLen = (16 + this.throttle * 34) * flicker;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.thrust;
      ctx.globalAlpha = 0.55 + this.throttle * 0.35;
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.7, -7);
      ctx.lineTo(-this.radius * 0.7 - flameLen, 0);
      ctx.lineTo(-this.radius * 0.7, 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = p.thrustCore;
      ctx.globalAlpha = 0.7 + this.throttle * 0.3;
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.7, -3.5);
      ctx.lineTo(-this.radius * 0.7 - flameLen * 0.55, 0);
      ctx.lineTo(-this.radius * 0.7, 3.5);
      ctx.closePath();
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    /* --- overheat glow (the core is cooking) ------------------------------ */
    if (this.isOverheating) {
      const sev = 0.35 + this.overheatSeverity * 0.65;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = sev * (0.5 + 0.5 * Math.abs(Math.sin(this.age * 9)));
      ctx.fillStyle = CONFIG.palette.gaugeCritical;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* --- hull (placeholder: arrowhead) ----------------------------------- */
    const L = this.length * 0.5;
    const W = this.radius * 0.9;

    ctx.fillStyle = p.hull;
    ctx.strokeStyle = p.hullDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L, 0); // nose
    ctx.lineTo(-L * 0.55, -W); // left wing tip
    ctx.lineTo(-L * 0.2, 0); // engine notch
    ctx.lineTo(-L * 0.55, W); // right wing tip
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit / Soul Core placeholder (this becomes the glowing core later).
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(L * 0.12, 0, this.radius * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // Wing stripes — cheap way to read orientation at a glance.
    ctx.fillStyle = p.hullDark;
    ctx.fillRect(-L * 0.5, -W * 0.72, L * 0.3, 3);
    ctx.fillRect(-L * 0.5, W * 0.72 - 3, L * 0.3, 3);

    ctx.restore();
  }
}

const ZERO = { x: 0, y: 0 };

export default Ship;
