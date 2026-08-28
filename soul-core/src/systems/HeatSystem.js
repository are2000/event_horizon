/**
 * HeatSystem.js
 * ----------------------------------------------------------------------------
 * HEAT — generate (drive, weapons, boosts), dissipate (coolingRate), and pay
 * the price when you exceed maxHeat.
 *
 *   1. cooling : heat -= coolingRate * dt     (per the `coolingRate` stat)
 *   2. redline : heat may overshoot up to maxHeat * heatCeiling
 *   3. penalty : past maxHeat, movement is penalised — thrust, turn rate and
 *                top speed — scaled by how deep into the redline band you are
 *   4. thermal : while redlined the hull itself starts cooking (HullSystem
 *                reads `ship.isOverheating`, so damage stays in one place)
 */
import { ShipSystem } from './ShipSystem.js';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';

export class HeatSystem extends ShipSystem {
  static id = 'heat';

  constructor(config = {}) {
    super({ id: HeatSystem.id, ...config });
    /** Radiator efficiency multiplier (upgrades, coolant consumables). */
    this.efficiency = config.efficiency ?? 1;
    /** True on every step the core is above maxHeat (HUD/audio hooks). */
    this.redlining = false;
  }

  update(dt, ship) {
    const stats = ship.stats;
    const ceiling = stats.maxHeat * CONFIG.systems.heatCeiling;

    // Passive dissipation — the `coolingRate` stat, in units per second.
    // (Heat generation is the job of whatever is burning: DriveSystem,
    //  weapons, boosters — they call ship.generateHeat().)
    stats.heat = clamp(stats.heat - stats.coolingRate * this.efficiency * dt, 0, ceiling);

    const wasRedlining = this.redlining;
    this.redlining = ship.isOverheating;
    if (this.redlining && !wasRedlining) {
      this.events?.emit('heat:redline', { ship, heat: stats.heat });
    } else if (!this.redlining && wasRedlining) {
      this.events?.emit('heat:nominal', { ship, heat: stats.heat });
    }
  }

  apply(modifiers, ship) {
    if (!ship.isOverheating) return;

    const cfg = CONFIG.systems;
    // severity: 0 the instant you cross maxHeat, 1 at the top of the band.
    const sev = ship.overheatSeverity;

    // Movement penalty — this is the whole point of a thermal ceiling: you
    // can push past it, but the ship stops responding like it used to.
    modifiers.thrustMul *= 1 - cfg.overheatThrustPenalty * (0.5 + 0.5 * sev);
    modifiers.turnRateMul *= 1 - cfg.overheatTurnPenalty * (0.5 + 0.5 * sev);
    modifiers.maxSpeedMul *= 1 - cfg.overheatSpeedPenalty * sev;
  }

  reset() {
    this.redlining = false;
  }

  explain(stat, ship) {
    if (!ship.isOverheating) return null;
    const cfg = CONFIG.systems;
    const sev = ship.overheatSeverity;
    if (stat === 'thrustMul') return 1 - cfg.overheatThrustPenalty * (0.5 + 0.5 * sev);
    if (stat === 'turnRateMul') return 1 - cfg.overheatTurnPenalty * (0.5 + 0.5 * sev);
    if (stat === 'maxSpeedMul') return 1 - cfg.overheatSpeedPenalty * sev;
    return null;
  }
}

export default HeatSystem;
