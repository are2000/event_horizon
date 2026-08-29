/**
 * LaserWeapon.js
 * ----------------------------------------------------------------------------
 * A continuous-beam laser. This is the weapon that proves the whole chain:
 *
 *   TargetingManager picks a target
 *        -> WeaponMount rotates until it is inside its traverse arc
 *             -> LaserWeapon checks aim error + range
 *                  -> draws power, dumps heat, applies DPS
 *                       -> beam is drawn as an additive line
 *
 * Continuous means continuous COST: every second of beam drains the capacitor
 * and heats the core. If the capacitor runs dry the beam doesn't stop — it
 * weakens (damage scales with the fraction of power actually delivered), which
 * reads as the laser stuttering under load.
 */
import { CONFIG } from '../config.js';
import { Weapon } from './Weapon.js';
import { clamp, damp } from '../core/MathUtils.js';

export class LaserWeapon extends Weapon {
  static id = 'laser';

  constructor(config = {}) {
    super({ id: LaserWeapon.id, name: 'Laser', ...config });

    const cfg = CONFIG.combat.laser;
    this.damagePerSecond = config.dps ?? cfg.dps;
    this.powerDraw = config.powerDraw ?? cfg.powerDraw; // units/s while firing
    this.heatGain = config.heatGain ?? cfg.heatGain; // units/s while firing
    this.width = config.width ?? cfg.width;
    this.color = config.color ?? cfg.color;
    this.coreColor = config.coreColor ?? cfg.coreColor;
    this.spinUpTime = config.spinUpTime ?? cfg.spinUpTime;
    /** The beam only fires when the mount is aimed this closely (radians). */
    this.fireTolerance = config.fireTolerance ?? cfg.fireTolerance;
    /** Below this fraction of requested power the beam drops out. */
    this.minDuty = config.minDuty ?? 0.12;

    this.beamAlpha = 0;
    this._flicker = 1;

    // Slim emitter — visually distinct from the cannon's stubby barrel.
    this.barrel = { length: 17, width: 4, color: this.color, brake: false };
  }

  get dps() {
    return this.damagePerSecond;
  }

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { ship, mount, target, particles, events }
   */
  update(dt, ctx) {
    const { ship, mount, target, particles, events } = ctx;
    this.target = target ?? null;

    /* 1. CAN WE SHOOT? ------------------------------------------------------ */
    // The mount has already rotated as far as its arc allows; `aimError` is
    // how far off the *desired* angle it still is.
    const aimed = mount && mount.aimError <= this.fireTolerance;
    const inRange = this.target
      ? Math.hypot(this.target.x - mount.muzzleX, this.target.y - mount.muzzleY) <= this.range
      : false;
    const wantsToFire = !!(this.target && this.target.alive && aimed && inRange);

    /* 2. PAY FOR IT --------------------------------------------------------- */
    let duty = 1;
    if (wantsToFire) {
      const want = this.powerDraw * dt;
      const got = ship.consumePower(want);
      duty = want > 1e-9 ? got / want : 1;
      this.energyDrawn += got;
    }
    this.duty = duty;

    // Spool up / down: the beam fades in and out instead of snapping.
    const powered = wantsToFire && duty > this.minDuty;
    this.charge = damp(this.charge, powered ? 1 : 0, 1 / Math.max(0.01, this.spinUpTime), dt);
    this.firing = powered && this.charge > 0.25;

    /* 3. TERMINATE THE BEAM ------------------------------------------------- */
    const cos = Math.cos(mount.aimWorld);
    const sin = Math.sin(mount.aimWorld);
    if (this.firing && this.target) {
      // Stop at the near surface of the target rather than its centre.
      const dx = this.target.x - mount.muzzleX;
      const dy = this.target.y - mount.muzzleY;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.max(0, dist - this.target.radius * 0.85);
      this.hitX = mount.muzzleX + (dx / dist) * reach;
      this.hitY = mount.muzzleY + (dy / dist) * reach;
      this.beamAlpha = this.charge * (0.55 + 0.45 * duty);

      /* 4. HEAT + DAMAGE --------------------------------------------------- */
      ship.generateHeat(this.heatGain * duty * dt);
      const damage = this.damagePerSecond * duty * dt;
      this.damageDealt += damage;

      const killed = this.target.takeDamage(damage, { source: 'laser', weapon: this, mount }, events);

      if (particles && Math.random() < 0.55) {
        particles.burst(1, {
          x: this.hitX,
          y: this.hitY,
          angle: Math.atan2(-sin, -cos) + (Math.random() - 0.5) * 2.2,
          speed: 90 + Math.random() * 160,
          life: 0.22 + Math.random() * 0.25,
          size: 2 + Math.random() * 2.5,
          color: killed ? '#ffffff' : this.color,
          drag: 3,
        });
      }
    } else {
      // Idle: a short "range marker" stub so you can see where it points.
      this.hitX = mount.muzzleX + cos * this.range * 0.14;
      this.hitY = mount.muzzleY + sin * this.range * 0.14;
      this.beamAlpha = 0;
    }

    this._flicker = 0.86 + Math.random() * 0.14;
  }

  /**
   * Draw the beam in WORLD space (additive, so overlaps bloom).
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx, alpha) {
    const mount = this.mount;
    if (!mount) return;

    // Interpolated ship transform, so beams track smoothly between steps.
    const ship = mount.ship;
    const sx = ship.getRenderX(alpha);
    const sy = ship.getRenderY(alpha);
    const sa = ship.getRenderAngle(alpha);
    const cos = Math.cos(sa);
    const sin = Math.sin(sa);
    const mx = sx + mount.offsetX * cos - mount.offsetY * sin;
    const my = sy + mount.offsetX * sin + mount.offsetY * cos;

    const a = this.beamAlpha * this._flicker;
    if (a <= 0.02) {
      // Not firing: draw a dim aiming stub so arcs are legible.
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(sa + mount.localAngle) * this.range * 0.14,
        my + Math.sin(sa + mount.localAngle) * this.range * 0.14);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // Outer glow
    ctx.globalAlpha = clamp(a * 0.35, 0, 1);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width * 3.2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(this.hitX, this.hitY);
    ctx.stroke();

    // Beam
    ctx.globalAlpha = clamp(a * 0.85, 0, 1);
    ctx.lineWidth = this.width * 1.5;
    ctx.stroke();

    // White-hot core
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.strokeStyle = this.coreColor;
    ctx.lineWidth = this.width * 0.55;
    ctx.stroke();

    // Muzzle flash + impact bloom
    ctx.fillStyle = this.coreColor;
    ctx.globalAlpha = clamp(a * 0.9, 0, 1);
    ctx.beginPath();
    ctx.arc(mx, my, this.width * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.color;
    ctx.globalAlpha = clamp(a * 0.75, 0, 1);
    ctx.beginPath();
    ctx.arc(this.hitX, this.hitY, this.width * (2.2 + Math.random() * 1.4), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  reset() {
    super.reset();
    this.beamAlpha = 0;
  }
}

export default LaserWeapon;
