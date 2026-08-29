/**
 * Weapon.js
 * ----------------------------------------------------------------------------
 * Base class for anything that can be bolted to a WeaponMount.
 *
 * A weapon never decides WHERE to point (the mount owns the traverse arc) and
 * never decides WHO to shoot (the TargetingManager owns that). It only answers
 * one question every step: "given where I'm pointed and what I'm locked onto,
 * do I fire, and what does it cost?"
 *
 * Subclass contract
 *   update(dt, ctx)  — ctx: { ship, mount, target, particles, events, time }
 *                      Call ship.consumePower() / ship.generateHeat() here:
 *                      the capacitor and the thermal model are shared, so a
 *                      new weapon gets correct power/heat behaviour for free.
 *   render(ctx, alpha)
 *   reset()
 */
export class Weapon {
  /** Registry key — used by WeaponSystem to build mounts from config. */
  static id = 'weapon';

  constructor(config = {}) {
    this.id = config.id ?? this.constructor.id ?? 'weapon';
    this.name = config.name ?? 'Weapon';
    this.range = config.range ?? 500;

    /** @type {import('./WeaponMount.js').WeaponMount|null} */
    this.mount = null;
    /** @type {import('../entities/Ship.js').Ship|null} */
    this.ship = null;

    /** True on steps where the weapon is actually dealing damage. */
    this.firing = false;
    /** 0..1 spool-up (a beam ramps instead of snapping on). */
    this.charge = 0;
    /** 0..1 fraction of the requested power the capacitor could supply. */
    this.duty = 1;
    /** Where the shot currently terminates (render + impact FX). */
    this.hitX = 0;
    this.hitY = 0;
    /** Current target (convenience mirror of mount.target). */
    this.target = null;

    /** Cumulative telemetry. */
    this.damageDealt = 0;
    this.energyDrawn = 0;

    /** Tint used by the mount's turret art. */
    this.color = config.color ?? '#9fb4d8';
    /**
     * How the gun looks on the hull. Overriding this is what makes equipping
     * a different weapon visibly change the ship:
     *   { length, width, color, brake }
     */
    this.barrel = {
      length: config.barrelLength ?? 17,
      width: config.barrelWidth ?? 4,
      color: this.color,
      brake: config.brake ?? false,
    };
    /** Set by EquipmentSystem so it can tell when a slot's gun changed. */
    this.itemUid = config.itemUid ?? null;
  }

  attach(mount) {
    this.mount = mount;
    this.ship = mount ? mount.ship : null;
    return this;
  }

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { ship, mount, target, particles, events, time }
   */
  update(dt, ctx) {}

  /**
   * Draw in WORLD space.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha
   */
  render(ctx, alpha) {}

  reset() {
    this.firing = false;
    this.charge = 0;
    this.duty = 1;
    this.target = null;
    this.damageDealt = 0;
    this.energyDrawn = 0;
  }

  /** Damage actually applied this step (used by the HUD/debug overlay). */
  get dps() {
    return 0;
  }
}

export default Weapon;
