/**
 * ShipSystem.js
 * ----------------------------------------------------------------------------
 * Base class for every ship-mounted system.
 *
 * Contract
 *  - `update(dt, ship)`       : move the GAUGES (simulation). Every fixed step.
 *  - `apply(modifiers, ship)` : multiply into the MODIFIERS object (read-only ship).
 *  - `reset()`                : clear per-run state (Game.restart() calls it).
 *  - never touch Ship physics directly — that is what lets five systems
 *    influence the same stat without knowing about each other, and it is what
 *    makes "why is my ship slow?" answerable from the debug overlay.
 *
 * A system reaches everything it needs through `this.ship` and
 * `this.manager` (set by SystemsManager on install):
 *   this.manager.events.emit('cargo:overflow', {...})
 *   this.manager.events.on('ship:impact', ...)
 *
 * The five live systems are: WeightSystem, DriveSystem, PowerSystem,
 * HeatSystem, CorrosionSystem, HullSystem.
 */
export class ShipSystem {
  /** Unique registry key. Subclasses should override. */
  static id = 'system';

  /**
   * @param {object} [config] per-instance tuning (rates, tier, capacity...)
   */
  constructor(config = {}) {
    this.id = config.id ?? this.constructor.id ?? 'system';
    this.name = config.name ?? this.id;
    this.enabled = config.enabled ?? true;
    this.config = config;
    /** @type {import('../entities/Ship.js').Ship|null} */
    this.ship = null;
    /** @type {import('./SystemsManager.js').SystemsManager|null} */
    this.manager = null;
    this.age = 0;
  }

  /**
   * Called by SystemsManager when installed.
   * @param {import('../entities/Ship.js').Ship} ship
   */
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

  /** Shortcut to the shared event bus (null if the system isn't installed). */
  get events() {
    return this.manager ? this.manager.events : null;
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

  /** Called by SystemsManager.reset() when a new run starts. */
  reset() {}
}

export default ShipSystem;
