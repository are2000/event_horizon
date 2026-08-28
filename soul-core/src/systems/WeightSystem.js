/**
 * WeightSystem.js
 * ----------------------------------------------------------------------------
 * WEIGHT — the mass the other four systems have to carry.
 *
 * The load formula (per spec):
 *
 *   Actual Acceleration = EngineThrust * (1 - currentWeight / maxWeight)
 *
 * Turn rate uses the same load factor, so a fully laden hauler is sluggish in
 * every axis, not just in a straight line. With `CONFIG.systems.minThrustFactor`
 * at 0 (the default) a 100%-loaded ship produces exactly zero thrust — cargo
 * management is meant to hurt. Set the floors to ~0.15 if you'd rather an
 * overloaded ship could always limp home.
 *
 * Cargo is persistent: nothing decays here. Salvage, jettisoning and future
 * "cargo bay destroyed" events all go through `addCargo` / `jettison`.
 */
import { ShipSystem } from './ShipSystem.js';
import { CONFIG } from '../config.js';

export class WeightSystem extends ShipSystem {
  static id = 'weight';

  /** Load cargo. @returns {number} how much actually fit (0 = hold is full). */
  addCargo(amount) {
    const loaded = this.ship.addWeight(amount);
    const overflow = amount - loaded;
    if (overflow > 0.001) {
      this.events?.emit('cargo:overflow', { amount: overflow, ship: this.ship });
    }
    this.events?.emit('cargo:changed', { ship: this.ship, weight: this.ship.stats.weight });
    return loaded;
  }

  /**
   * Dump cargo overboard to buy acceleration back.
   * @param {number} [amount] omit to jettison the whole hold
   */
  jettison(amount) {
    const dropped = this.ship.jettisonCargo(amount);
    if (dropped > 0) {
      this.events?.emit('cargo:jettisoned', { amount: dropped, ship: this.ship });
    }
    return dropped;
  }

  /** Nothing decays — weight only changes when cargo does. */
  update(dt, ship) {}

  apply(modifiers, ship) {
    const cfg = CONFIG.systems;
    // 0 = empty hold (full thrust) ... 1 = at capacity (no thrust at all)
    const ratio = ship.weightRatio;

    // SPEC: acceleration scales with (1 - weight / maxWeight).
    modifiers.thrustMul *= Math.max(cfg.minThrustFactor, 1 - ratio);
    // ...and so does agility.
    modifiers.turnRateMul *= Math.max(cfg.minTurnFactor, 1 - ratio);

    // Reserved for impulse/recoil maths (mass is inertia, not just drag).
    modifiers.massMul *= 1 + ratio;
  }

  reset() {}

  /** Debug overlay: this system's slice of a modifier product. */
  explain(stat, ship) {
    const ratio = ship.weightRatio;
    if (stat === 'thrustMul') return Math.max(CONFIG.systems.minThrustFactor, 1 - ratio);
    if (stat === 'turnRateMul') return Math.max(CONFIG.systems.minTurnFactor, 1 - ratio);
    return null;
  }
}

export default WeightSystem;
