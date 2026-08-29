/**
 * WeaponMount.js
 * ----------------------------------------------------------------------------
 * A hardpoint bolted to the hull. It owns three things:
 *
 *   1. WHERE it sits            — `offsetX/offsetY` in the ship's LOCAL frame
 *                                 (+x = nose, +y = starboard)
 *   2. HOW FAR it can traverse  — an arc described as { centre, halfWidth }
 *                                 in the ship's local frame
 *   3. WHAT is bolted to it     — a Weapon instance
 *
 * ============================================================================
 * THE ARC MATHS (the interesting part)
 * ============================================================================
 * Arcs are stored as centre ± halfWidth rather than min/max, which makes
 * arcs that straddle the ±180° seam (the rear mount: 180° ± 90°) work with the
 * exact same code as the side mounts.
 *
 *   localDesired = wrap(atan2(target - muzzle) - shipAngle)   // where it WANTS to point
 *   clamped      = centre + clamp(wrap(localDesired - centre), -half, +half)
 *
 * `wrap(localDesired - centre)` measures the offset from the arc centre the
 * short way round, so clamp() then gives the nearest legal angle — including
 * for the rear mount, where local angles legitimately live at ±180°.
 *
 * Rotation is rate-limited, never instant:
 *
 *   localAngle = rotateToward(localAngle, clamped, turnRate * dt)
 *   localAngle = clampToArc(localAngle)          // numerical safety
 *
 * and the true aiming error is kept UNSATURATED (offset from what the mount
 * *wants*, not from the clamped angle). That is what stops a mount from firing
 * at a target sitting outside its arc: the turret parks on the arc limit, but
 * the beam may not bend, so aimError stays large and the weapon stays cold.
 */
import { CONFIG } from '../config.js';
import { clamp, DEG, rotateToward, wrapAngle } from '../core/MathUtils.js';

export class WeaponMount {
  /**
   * @param {object} config
   * @param {string} config.id                 'left' | 'right' | 'rear'
   * @param {{x:number,y:number}} config.offset  local-space position (wu)
   * @param {{center:number,half:number}} config.arc  DEGREES, local space
   * @param {number} config.turnRate           rad/s
   * @param {import('./Weapon.js').Weapon|null} [config.weapon]
   */
  constructor(config = {}) {
    this.id = config.id ?? 'mount';
    this.label = config.label ?? this.id[0]?.toUpperCase() ?? '?';
    this.offsetX = config.offset?.x ?? 0;
    this.offsetY = config.offset?.y ?? 0;

    // Config is in degrees (readable); everything internal is radians.
    this.arcCenter = (config.arc?.center ?? 0) * DEG;
    this.arcHalf = (config.arc?.half ?? 90) * DEG;
    this.turnRate = config.turnRate ?? 3.5;

    /** @type {import('./Weapon.js').Weapon|null} */
    this.weapon = config.weapon ?? null;
    /** @type {import('../entities/Ship.js').Ship|null} */
    this.ship = null;

    /* --- live state ------------------------------------------------------- */
    this.localAngle = this.arcCenter; // relative to the hull
    this.prevLocalAngle = this.arcCenter; // for render interpolation
    this.aimWorld = 0; // hull angle + local angle
    this.aimError = 0; // radians away from the desired (unclamped) angle
    this.muzzleX = 0;
    this.muzzleY = 0;

    /** @type {import('../entities/Enemy.js').Enemy|null} */
    this.target = null;
    this.hasTarget = false;
    this.retargetTimer = 0;
  }

  attach(ship) {
    this.ship = ship;
    this.localAngle = this.prevLocalAngle = this.arcCenter;
    this.weapon?.attach(this);
    return this;
  }

  /* ------------------------------------------------------------------ arc -- */

  /**
   * Clamp a local angle into this mount's traverse arc.
   * Works for any arc, including ones centred on ±180°.
   */
  clampToArc(localAngle) {
    return this.arcCenter + clamp(wrapAngle(localAngle - this.arcCenter), -this.arcHalf, this.arcHalf);
  }

  /** Is this local angle inside the arc? (tests + debug) */
  isLocalInArc(localAngle) {
    return Math.abs(wrapAngle(localAngle - this.arcCenter)) <= this.arcHalf + 1e-9;
  }

  /** World-space centre of the arc (hull heading + mount offset). */
  getWorldArcCenter(ship = this.ship) {
    return ship.angle + this.arcCenter;
  }

  get localMin() {
    return this.arcCenter - this.arcHalf;
  }

  get localMax() {
    return this.arcCenter + this.arcHalf;
  }

  /* ----------------------------------------------------------------- tick -- */

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { ship, targeting, particles, events, reserved, time }
   */
  update(dt, ctx) {
    const ship = this.ship ?? ctx.ship;
    if (!ship) return;

    this.prevLocalAngle = this.localAngle;

    /* 1. MUZZLE in world space (rotate the local offset by the hull angle) -- */
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    this.muzzleX = ship.x + this.offsetX * cos - this.offsetY * sin;
    this.muzzleY = ship.y + this.offsetX * sin + this.offsetY * cos;

    /* 2. TARGETING ---------------------------------------------------------- */
    // An empty hardpoint has nothing to shoot with, so it neither scans nor
    // claims a target — it just parks at the centre of its arc.
    const targeting = this.weapon ? ctx.targeting : null;
    const range = this.weapon ? this.weapon.range : (ctx.targeting ? ctx.targeting.defaultRange : 500);
    const arcCenterWorld = ship.angle + this.arcCenter;

    if (targeting) {
      this.retargetTimer -= dt;

      // Drop the lock as soon as it becomes illegal (dead, out of range, or
      // swung outside the arc as the hull turns).
      if (this.target && !targeting.isValid(this.target, this.muzzleX, this.muzzleY, range, arcCenterWorld, this.arcHalf)) {
        this.target = null;
      }

      // Re-scan on a timer: re-scanning every step makes mounts flick between
      // two equidistant targets.
      if (!this.target && this.retargetTimer <= 0) {
        this.target =
          targeting.findBest(this.muzzleX, this.muzzleY, range, {
            arcCenter: arcCenterWorld,
            arcHalf: this.arcHalf,
            reserved: ctx.reserved,
          }) || targeting.findBest(this.muzzleX, this.muzzleY, range, {
            arcCenter: arcCenterWorld,
            arcHalf: this.arcHalf,
          });
        this.retargetTimer = targeting.retargetDelay;
      }

      // Claim it so the next mount prefers a different threat.
      if (this.target && ctx.reserved) ctx.reserved.add(this.target);
    }

    this.hasTarget = !!this.target;

    /* 3. WHERE DO WE WANT TO POINT? ---------------------------------------- */
    let desiredLocal;
    if (this.target) {
      const worldAngle = Math.atan2(this.target.y - this.muzzleY, this.target.x - this.muzzleX);
      desiredLocal = wrapAngle(worldAngle - ship.angle);
    } else {
      desiredLocal = this.arcCenter; // rest pose: centred in the arc
    }

    /* 4. CLAMP TO THE ARC, THEN ROTATE GRADUALLY ---------------------------- */
    const clampedDesired = this.clampToArc(desiredLocal);
    this.localAngle = rotateToward(this.localAngle, clampedDesired, this.turnRate * dt);
    this.localAngle = this.clampToArc(this.localAngle); // numerical safety

    this.aimWorld = ship.angle + this.localAngle;
    // Error measured against the UNSATURATED desire, so a target outside the
    // arc leaves a permanent error and the weapon never fires at it.
    this.aimError = this.target ? Math.abs(wrapAngle(desiredLocal - this.localAngle)) : 0;

    /* 5. FIRE ---------------------------------------------------------------- */
    if (this.weapon) {
      this.weapon.update(dt, {
        ship,
        mount: this,
        target: this.target,
        particles: ctx.particles,
        // Projectile weapons spawn into the shared pool; it must be forwarded
        // every step or a cannon pays for shells that never exist.
        projectiles: ctx.projectiles,
        camera: ctx.camera,
        events: ctx.events,
        time: ctx.time,
      });
    }
  }

  /* --------------------------------------------------------------- render -- */

  getRenderLocalAngle(alpha) {
    let d = this.localAngle - this.prevLocalAngle;
    d -= Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2));
    return this.prevLocalAngle + d * alpha;
  }

  /** 'firing' | 'tracking' | 'idle' — drives HUD + turret colour. */
  get state() {
    if (this.weapon && this.weapon.firing) return 'firing';
    if (this.target) return 'tracking';
    return 'idle';
  }

  /**
   * Draw the turret in WORLD space, using the interpolated ship transform.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha
   */
  render(ctx, alpha) {
    const ship = this.ship;
    if (!ship) return;
    const p = CONFIG.palette;

    const sx = ship.getRenderX(alpha);
    const sy = ship.getRenderY(alpha);
    const sa = ship.getRenderAngle(alpha);
    const cos = Math.cos(sa);
    const sin = Math.sin(sa);
    const mx = sx + this.offsetX * cos - this.offsetY * sin;
    const my = sy + this.offsetX * sin + this.offsetY * cos;
    const aim = sa + this.getRenderLocalAngle(alpha);

    const state = this.state;
    const color = state === 'firing' ? p.gaugeHeat : state === 'tracking' ? p.accent : p.hullDark;

    ctx.save();
    ctx.translate(mx, my);

    // Base
    ctx.fillStyle = 'rgba(12, 20, 34, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    /* --- EMPTY HARDPOINT ---------------------------------------------------- */
    // Nothing bolted on: draw a socket so the player can see where a gun goes
    // (and notices when a slot is empty while fiddling with the inventory).
    if (!this.weapon) {
      ctx.save();
      ctx.rotate(aim);
      ctx.strokeStyle = 'rgba(127, 157, 203, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
      ctx.restore();
      ctx.restore();
      return;
    }

    // Barrel — shape and colour come from the weapon, so swapping gear changes
    // the ship's silhouette on the canvas.
    const barrel = this.weapon.barrel ?? { length: 17, width: 4, color, brake: false };
    const bw = barrel.width;
    const bh = bw * 0.5;

    ctx.save();
    ctx.rotate(aim);
    ctx.fillStyle = state === 'firing' ? p.gaugeHeat : barrel.color ?? color;
    ctx.fillRect(0, -bh, barrel.length, bw);
    if (barrel.brake) {
      // Chunky muzzle brake — reads as a cannon at a glance.
      ctx.fillStyle = p.hullDark;
      ctx.fillRect(barrel.length - 5, -bh - 1.5, 5, bw + 3);
    } else {
      ctx.fillStyle = p.hullDark;
      ctx.fillRect(barrel.length - 5, -bh - 1, 4, bw + 2);
    }

    // Muzzle glow while firing
    if (state === 'firing') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = this.weapon.color ?? CONFIG.combat.laser.coreColor;
      ctx.beginPath();
      ctx.arc(barrel.length, 0, 3 + Math.random() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  /**
   * Swap what is bolted to this hardpoint (inventory equip / unequip).
   * @param {import('./Weapon.js').Weapon|null} weapon
   */
  setWeapon(weapon) {
    if (this.weapon === weapon) return this;
    this.weapon = weapon ?? null;
    if (this.weapon) this.weapon.attach(this);
    // Point the new gun at the middle of its arc and drop any stale lock.
    this.target = null;
    this.hasTarget = false;
    this.retargetTimer = 0;
    return this;
  }

  reset() {
    this.localAngle = this.prevLocalAngle = this.arcCenter;
    this.target = null;
    this.hasTarget = false;
    this.retargetTimer = 0;
    this.aimError = 0;
    this.weapon?.reset();
  }
}

export default WeaponMount;
