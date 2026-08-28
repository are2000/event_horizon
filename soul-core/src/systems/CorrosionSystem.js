/**
 * CorrosionSystem.js
 * ----------------------------------------------------------------------------
 * CORROSION — the run timer you can't see until it's too late.
 *
 *   coreCorrosion += corrosionRate * dt * heatMultiplier
 *
 * The Great Decay eats the core from the moment the run starts (0.35%/s by
 * default, so a fresh ship melts down in ~4m45s). Running the core redlined
 * accelerates the decay up to `corrosionHeatMultiplier` — which is what turns
 * heat from a nuisance into a *strategic* mistake: pushing the drive buys you
 * distance now and costs you the whole run later.
 *
 * At 100% the core goes critical: 'ship:meltdown' is emitted once and the Game
 * switches to its game-over state.
 */
import { ShipSystem } from './ShipSystem.js';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';

export class CorrosionSystem extends ShipSystem {
  static id = 'corrosion';

  constructor(config = {}) {
    super({ id: CorrosionSystem.id, ...config });
    /** True once the core has gone critical (latched — never fires twice). */
    this.melted = false;
    /** Last step's corrosion rate, multiplier included (debug/HUD). */
    this.currentRate = 0;
  }

  update(dt, ship) {
    if (this.melted) return;

    const cfg = CONFIG.systems;
    const stats = ship.stats;

    // Overheating accelerates the decay; severity 0..1 inside the redline band.
    const heatMult = 1 + (cfg.corrosionHeatMultiplier - 1) * ship.overheatSeverity;
    const rate = stats.corrosionRate * heatMult;
    this.currentRate = rate;

    stats.coreCorrosion = clamp(stats.coreCorrosion + rate * dt, 0, 100);

    if (stats.coreCorrosion >= 100) {
      this.melted = true;
      this.events?.emit('ship:meltdown', {
        ship,
        time: this.age,
        corrosion: stats.coreCorrosion,
      });
    } else if (stats.coreCorrosion >= cfg.meltdownWarning * 100 && !this._warned) {
      this._warned = true;
      this.events?.emit('corrosion:warning', { ship, corrosion: stats.coreCorrosion });
    }
  }

  apply(modifiers, ship) {
    const cfg = CONFIG.systems;
    const c = ship.corrosionRatio; // 0..1
    // A corroding hull is a sloppy hull: the plating loses its grip on the
    // manoeuvring field, so you slide more and top out lower.
    modifiers.gripMul *= 1 - c * cfg.corrosionGripPenalty;
    modifiers.maxSpeedMul *= 1 - c * cfg.corrosionSpeedPenalty;
  }

  reset() {
    this.melted = false;
    this._warned = false;
    this.currentRate = 0;
  }

  explain(stat, ship) {
    const cfg = CONFIG.systems;
    const c = ship.corrosionRatio;
    if (stat === 'gripMul') return 1 - c * cfg.corrosionGripPenalty;
    if (stat === 'maxSpeedMul') return 1 - c * cfg.corrosionSpeedPenalty;
    return null;
  }
}

export default CorrosionSystem;
