/**
 * CannonWeapon.js
 * ----------------------------------------------------------------------------
 * Burst-fire shell gun — the counterpart to the laser:
 *
 *   Laser  : continuous beam, paid for per SECOND, no travel time
 *   Cannon : discrete shells, paid for per SHOT, with travel time
 *
 * Both bolt onto the same WeaponMount and are driven by the same contract, so
 * everything the mount guarantees (arc limits, gradual rotation, "don't fire
 * at what you can't legally face") applies here for free.
 *
 * A shell is fired only if the capacitor can actually pay for it: below
 * `minDuty` the trigger is refused and the gun tries again shortly after, which
 * reads as the gun stuttering on a flat battery rather than firing blanks.
 *
 * ============================================================================
 * THE BALLISTIC FAMILY
 * ============================================================================
 * This class is the base for every gun that throws something:
 *
 *   CannonWeapon  'shell'    fast, medium damage, no frills
 *   KineticCannon 'slug'     slow, huge damage, RECOIL — it shoves the hull
 *   PlasmaCannon  'plasma'   splash damage, and it cooks the core that fired it
 *
 * The differences are pure data (see CONFIG.combat.cannon / .kinetic / .plasma)
 * plus what each shell carries into ProjectilePool. Subclasses pick their
 * config block via a static `defaults` getter, so there is no duplicated
 * constructor code.
 */
import { CONFIG } from '../config.js';
import { Weapon } from './Weapon.js';
import { damp } from '../core/MathUtils.js';

export class CannonWeapon extends Weapon {
  static id = 'cannon';

  /** Registry key of the config block this gun reads. Subclasses override. */
  static get defaults() {
    return CONFIG.combat.cannon;
  }

  /** What ProjectilePool calls this kind of shell (render + detonation FX). */
  static shellKind = 'shell';

  constructor(config = {}) {
    super({ id: CannonWeapon.id, name: 'Cannon', ...config });

    // `this.constructor` is the REAL class here, so KineticCannon gets
    // CONFIG.combat.kinetic without restating a single line of this method.
    const cfg = this.constructor.defaults;
    this.damage = config.damage ?? cfg.damage;
    this.shotsPerSecond = config.shotsPerSecond ?? cfg.shotsPerSecond;
    this.powerPerShot = config.powerPerShot ?? cfg.powerPerShot;
    this.heatPerShot = config.heatPerShot ?? cfg.heatPerShot;
    this.speed = config.speed ?? cfg.speed;
    this.spread = config.spread ?? cfg.spread;
    this.color = config.color ?? cfg.color;
    this.coreColor = config.coreColor ?? cfg.coreColor;
    this.fireTolerance = config.fireTolerance ?? cfg.fireTolerance;
    this.minDuty = config.minDuty ?? cfg.minDuty;
    this.shellRadius = config.shellRadius ?? cfg.projectileRadius;
    this.projectileLife = config.projectileLife ?? cfg.projectileLife;

    /* --- what the shell carries ------------------------------------------- */
    this.kind = config.kind ?? this.constructor.shellKind;

    /* Recoil: muzzle impulse, in wu/s, applied to the SHIP. Scaled down by how
       loaded the hauler is (`recoilWeightRelief`), because a heavy ship has
       more inertia — the same physics that makes a loaded ship slower to
       accelerate also makes it shrug off a big gun. */
    this.recoil = config.recoil ?? cfg.recoil ?? 0;
    this.recoilWeightRelief = config.recoilWeightRelief ?? cfg.recoilWeightRelief ?? 0;
    this.recoilShake = config.recoilShake ?? cfg.recoilShake ?? 0;

    /* Splash: 0 means single-target. */
    this.splashRadius = config.splashRadius ?? cfg.splashRadius ?? 0;
    this.splashDamage = config.splashDamage ?? cfg.splashDamage ?? 0;
    this.splashFalloff = config.splashFalloff ?? cfg.splashFalloff ?? 0.35;
    this.splashKnockback = config.splashKnockback ?? cfg.splashKnockback ?? 0;

    /** Seconds until the next shell. */
    this.cooldown = 0;
    /** Muzzle flash brightness 0..1 (decays). */
    this.flash = 0;
    /** Sustained-equivalent draw, so the inventory panel can compare guns. */
    this.powerDraw = this.powerPerShot * this.shotsPerSecond;
    this.heatGain = this.heatPerShot * this.shotsPerSecond;

    // Chunky barrel — equipping a cannon visibly changes the ship's silhouette.
    this.barrel = { length: 15, width: 7, color: this.color, brake: true };
  }

  get dps() {
    return Math.round(this.damage * this.shotsPerSecond * 10) / 10;
  }

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { ship, mount, target, particles, projectiles, events }
   */
  update(dt, ctx) {
    const { ship, mount, target, particles, projectiles, camera } = ctx;
    this.target = target ?? null;

    this.cooldown -= dt;
    this.flash = damp(this.flash, 0, 14, dt);
    this.firing = false;

    const aimed = mount && mount.aimError <= this.fireTolerance;
    const inRange = this.target
      ? Math.hypot(this.target.x - mount.muzzleX, this.target.y - mount.muzzleY) <= this.range
      : false;
    const ready = this.cooldown <= 0;

    if (!(this.target && this.target.alive && aimed && inRange && ready)) {
      this.duty = 1;
      return;
    }

    /* --- pay for the shell ------------------------------------------------- */
    const want = this.powerPerShot;
    const got = ship.consumePower(want);
    const duty = want > 1e-9 ? got / want : 1;
    this.duty = duty;
    this.energyDrawn += got;

    if (duty < this.minDuty) {
      // Not enough charge: stutter, don't shoot blanks.
      this.cooldown = 0.18;
      return;
    }

    /* --- fire -------------------------------------------------------------- */
    ship.generateHeat(this.heatPerShot * duty);
    this.cooldown = 1 / Math.max(0.05, this.shotsPerSecond);
    this.flash = 1;
    this.firing = true;
    this.charge = 1;

    const angle = mount.aimWorld + (Math.random() - 0.5) * 2 * this.spread;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Inherit a slice of ship velocity: shells fired at speed keep momentum.
    const vx = cos * this.speed + ship.vx * 0.3;
    const vy = sin * this.speed + ship.vy * 0.3;

    projectiles?.spawn({
      x: mount.muzzleX + cos * 14,
      y: mount.muzzleY + sin * 14,
      vx, vy,
      damage: this.damage * duty,
      life: this.projectileLife,
      color: this.color,
      coreColor: this.coreColor,
      radius: this.shellRadius,
      kind: this.kind,
      splash: this.splashRadius,
      splashDamage: this.splashDamage * duty,
      splashFalloff: this.splashFalloff,
      splashKnockback: this.splashKnockback,
      weapon: this,
      mount,
    });

    /* --- recoil: the gun pushes the hull back ----------------------------- */
    if (this.recoil > 0) {
      // A loaded ship has more inertia, so it gets thrown around less.
      const relief = 1 - this.recoilWeightRelief * ship.weightRatio;
      const kick = this.recoil * duty * relief;
      ship.applyImpulse(-cos * kick, -sin * kick);
      // The camera takes a bigger hit than the hull does: on a near-frictionless
      // ship the physical shove has to stay small enough to fly through, and
      // the shake is what actually sells the size of the gun.
      camera?.addShake(Math.min(6, (this.recoilShake ?? 0) * duty));
    }

    particles?.burst(5, {
      x: mount.muzzleX + cos * 16,
      y: mount.muzzleY + sin * 16,
      angle, spread: 0.9, speed: 220, life: 0.22, size: 3, color: this.color, drag: 4,
    });
  }

  /** Muzzle flash only — the shells draw themselves (ProjectilePool.render). */
  render(ctx, alpha) {
    const mount = this.mount;
    if (!mount || this.flash <= 0.02) return;
    const ship = mount.ship;
    const sx = ship.getRenderX(alpha);
    const sy = ship.getRenderY(alpha);
    const sa = ship.getRenderAngle(alpha);
    const cos = Math.cos(sa);
    const sin = Math.sin(sa);
    const mx = sx + mount.offsetX * cos - mount.offsetY * sin;
    const my = sy + mount.offsetX * sin + mount.offsetY * cos;
    const a = sa + mount.getRenderLocalAngle(alpha);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.flash * 0.9;
    ctx.fillStyle = this.coreColor;
    ctx.beginPath();
    ctx.arc(mx + Math.cos(a) * 16, my + Math.sin(a) * 16, 4 + this.flash * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = this.flash * 0.5;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(mx + Math.cos(a) * 14, my + Math.sin(a) * 14, 8 + this.flash * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  reset() {
    super.reset();
    this.cooldown = 0;
    this.flash = 0;
  }
}

export default CannonWeapon;
