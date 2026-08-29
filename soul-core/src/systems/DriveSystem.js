/**
 * DriveSystem.js
 * ----------------------------------------------------------------------------
 * The PLACEHOLDER CONSUMER / GENERATOR required by the spec:
 *
 *   consumePower() : the drive draws from the capacitor in proportion to
 *                    throttle. If the capacitor can't keep up, the drive
 *                    browns out and thrust drops toward `brownoutThrust`.
 *   generateHeat() : burning the drive dumps heat into the core, also in
 *                    proportion to throttle.
 *
 * When real weapons/boosters/shields arrive they use the exact same two calls
 * on Ship (`ship.consumePower(n)`, `ship.generateHeat(n)`), so the capacitor
 * and the heat curve already account for them.
 *
 * Balance (defaults): full throttle draws 23 power/s against 16/s of recharge,
 * so a continuous burn empties the capacitor in ~14 s. From then on the drive
 * only gets what the reactor can supply (duty ~0.7) and settles at ~78%
 * thrust. Heat builds at 16/s against 11/s of cooling, so holding the stick
 * down redlines the core in ~25 s. Burst, coast, cool — that's the rhythm.
 * (Installed weapons eat into the same recharge — see EquipmentSystem.)
 */
import { ShipSystem } from './ShipSystem.js';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../core/MathUtils.js';

export class DriveSystem extends ShipSystem {
  static id = 'drive';

  constructor(config = {}) {
    super({ id: DriveSystem.id, ...config });
    /** 0 = fully powered, 1 = completely starved (smoothed for feel). */
    this.brownout = 0;
    /** Units of power the drive asked for last step (debug/HUD). */
    this.draw = 0;
  }

  update(dt, ship) {
    const cfg = CONFIG.systems;

    /* 1. CONSUME POWER ------------------------------------------------------ */
    // Throttle sets the draw; the capacitor decides how much we actually get.
    const want = cfg.drivePowerDraw * ship.throttle * dt;
    const got = ship.consumePower(want);
    this.draw = want / Math.max(dt, 1e-6); // units/s, for the HUD

    // duty 1 = got everything we asked for, 0 = got nothing.
    const duty = want > 1e-6 ? got / want : 1;
    this.brownout = damp(this.brownout, clamp(1 - duty, 0, 1), 6, dt);

    if (duty < 0.999) {
      this.events?.emit('power:brownout', { ship, duty, requested: want, delivered: got });
    }

    /* 2. GENERATE HEAT ------------------------------------------------------ */
    // A starved drive still wastes energy as heat — inefficiency, not output,
    // is what cooks you (hence the 0.6 floor on how clean a browned-out
    // drive runs).
    const dirty = 0.6 + 0.4 * duty;
    ship.generateHeat(cfg.driveHeatGain * dirty * ship.throttle * dt);
  }

  apply(modifiers, ship) {
    if (this.brownout <= 0.001) return;
    const floor = CONFIG.systems.brownoutThrust;
    modifiers.thrustMul *= 1 - (1 - floor) * this.brownout;
  }

  reset() {
    this.brownout = 0;
    this.draw = 0;
  }

  explain(stat) {
    if (stat !== 'thrustMul' || this.brownout <= 0.001) return null;
    return 1 - (1 - CONFIG.systems.brownoutThrust) * this.brownout;
  }
}

export default DriveSystem;
