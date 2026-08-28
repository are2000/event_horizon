/**
 * ThrusterHeatSystem.js
 * ----------------------------------------------------------------------------
 * WORKED EXAMPLE of the systems seam — a miniature version of the planned
 * HEAT system. It is opt-in (launch with `?heat=1`) so Phase 1 stays a pure
 * flight prototype, but it proves the whole pipeline end to end:
 *
 *   resources  ──►  modifiers  ──►  ship physics
 *
 *   throttle 0.8  ->  heat rises  ->  past 75% the engine derates  ->  the ship
 *   visibly stops reaching its top speed even at full stick.
 *
 * Division of responsibility (important!):
 *   - SystemsManager owns PASSIVE decay (radiators always bleed heat).
 *   - A system only ever ADDS load here. If both subtracted heat you'd get
 *     double-cooling and the gauge would never move.
 *
 * Copy this file as the template for ReactorSystem (Power), CargoSystem
 * (Weight) and HullSystem (Corrosion).
 */
import { ShipSystem } from './ShipSystem.js';
import { clamp } from '../core/MathUtils.js';

export class ThrusterHeatSystem extends ShipSystem {
  static id = 'thruster-heat';

  /**
   * @param {object} [config]
   * @param {number} [config.heatPerSecond] heat gained at full throttle (0..1/s)
   */
  constructor(config = {}) {
    super({ id: ThrusterHeatSystem.id, ...config });
    this.heatPerSecond = config.heatPerSecond ?? 0.2;
  }

  /** Simulate: move the HEAT gauge. Never touch physics in here. */
  update(dt, ship) {
    // Burning the drive dumps heat into the core; SystemsManager's passive
    // cooling bleeds it back out, so the gauge settles where the two balance.
    const gain = this.heatPerSecond * ship.throttle;
    ship.resources.heat = clamp(ship.resources.heat + gain * dt, 0, 1);
  }

  /** Translate gauge state into physics modifiers. */
  apply(modifiers, ship) {
    const heat = ship.resources.heat;
    // Emergency derate on top of SystemsManager's base heat handling.
    if (heat > 0.9) modifiers.thrustMul *= 1 - (heat - 0.9) * 2; // up to -20% at 1.0
    // A hot drive loses material tolerance -> the hull slides more.
    modifiers.gripMul *= 1 - heat * 0.15;
  }
}

export default ThrusterHeatSystem;
