/**
 * PowerSystem.js
 * ----------------------------------------------------------------------------
 * POWER — the capacitor everything else draws from.
 *
 *   charge += powerRegen * dt            (slower while the core is redlined)
 *   charge -= whatever DriveSystem/weapons/shields consume
 *
 * Power itself is never a hard gate: a dry capacitor doesn't stop the drive,
 * it makes it weak (see DriveSystem's brownout). That way a player who
 * over-commits feels the ship sag rather than hitting a binary wall.
 */
import { ShipSystem } from './ShipSystem.js';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';

export class PowerSystem extends ShipSystem {
  static id = 'power';

  constructor(config = {}) {
    super({ id: PowerSystem.id, ...config });
    this.regen = config.regen ?? CONFIG.systems.powerRegen;
    /** Last step's net charge change (negative = draining). Debug/HUD. */
    this.net = 0;
  }

  update(dt, ship) {
    const cfg = CONFIG.systems;
    // Radiators and the capacitor share the thermal budget: a redlined core
    // diverts power away from recharging.
    const heatScale = ship.isOverheating ? cfg.overheatRegenPenalty : 1;
    const before = ship.stats.power;
    ship.stats.power = clamp(ship.stats.power + this.regen * heatScale * dt, 0, ship.stats.maxPower);
    this.net = (ship.stats.power - before) / Math.max(dt, 1e-6);
  }

  apply(modifiers, ship) {
    // Capacitor size scales with the rating, so an upgraded power plant
    // recharges in absolute units faster (regen is per second, not per %).
    modifiers.powerMul *= ship.powerRatio;
  }

  reset() {
    this.net = 0;
  }
}

export default PowerSystem;
