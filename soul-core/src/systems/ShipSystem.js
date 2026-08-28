/**
 * ShipSystem.js
 * ----------------------------------------------------------------------------
 * Base class for every ship-mounted system.
 *
 * THIS IS THE EXTENSION SEAM for the four planned systems:
 *
 *   class ReactorSystem extends ShipSystem {
 *     static id = 'reactor';
 *     update(dt, ship) {
 *       // draw power from the capacitor, dump heat into the hull...
 *       ship.resources.power = clamp(ship.resources.power - this.draw * dt, 0, 1);
 *       ship.resources.heat  = clamp(ship.resources.heat  + this.heat  * dt, 0, 1);
 *     }
 *     apply(modifiers, ship) {
 *       // ...and translate that state into physics modifiers
 *       modifiers.thrustMul *= 0.35 + 0.65 * ship.resources.power;
 *     }
 *   }
 *
 * Contract
 *  - `update(dt, ship)`  : mutate RESOURCES (simulation). Runs every fixed step.
 *  - `apply(modifiers, ship)` : mutate the MODIFIERS object (read-only ship).
 *  - never touch Ship physics directly — that is what keeps systems composable
 *    and lets us stack/unstack mods (salvaged parts, run upgrades, debuffs).
 */
export class ShipSystem {
  /** Unique registry key. Subclasses should override. */
  static id = 'system';

  /**
   * @param {object} [config] per-instance tuning (capacity, rates, tier...)
   */
  constructor(config = {}) {
    this.id = config.id ?? this.constructor.id ?? 'system';
    this.name = config.name ?? this.id;
    this.enabled = config.enabled ?? true;
    this.config = config;
    /** @type {import('../entities/Ship.js').Ship|null} */
    this.ship = null;
    this.age = 0;
  }

  /** Called by SystemsManager when installed. Override to cache state. */
  attach(ship) {
    this.ship = ship;
    this.onAttach(ship);
    return this;
  }

  detach() {
    const ship = this.ship;
    this.onDetach(ship);
    this.ship = null;
    return this;
  }

  /* --- hooks (optional) ---------------------------------------------------- */
  onAttach(ship) {}
  onDetach(ship) {}

  /**
   * @param {number} dt fixed step
   * @param {import('../entities/Ship.js').Ship} ship
   */
  update(dt, ship) {}

  /**
   * @param {object} modifiers aggregate multipliers (see Ship.createModifiers)
   * @param {import('../entities/Ship.js').Ship} ship
   */
  apply(modifiers, ship) {}
}

export default ShipSystem;
