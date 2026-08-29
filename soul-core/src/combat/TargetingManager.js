/**
 * TargetingManager.js
 * ----------------------------------------------------------------------------
 * Decides WHAT each weapon mount should shoot at.
 *
 * The query is deliberately expressed as "the best enemy inside this world
 * arc, within this range, from this point" — because that is exactly the
 * question a turret with a limited traverse asks:
 *
 *        muzzle ●─────────────►  arc centre (ship heading + mount centre)
 *              \__ ± halfWidth __/
 *
 * Rules
 *  - dead enemies are ignored
 *  - enemies outside the mount's traverse arc are ignored (even if closer)
 *  - by default each mount prefers its OWN target, so three mounts cover
 *    three threats instead of all three lasering the same dummy
 *    (`shareTargets: true` turns that off)
 *  - scoring is pluggable: 'nearest' (default), 'weakest', 'strongest'
 *
 * It is kept separate from the weapons on purpose: swapping in radar range
 * upgrades, stealth enemies or a manual targeting mode later means changing
 * one file, not every weapon.
 */
import { CONFIG } from '../config.js';
import { clamp, distanceSq, wrapAngle } from '../core/MathUtils.js';

export class TargetingManager {
  /**
   * @param {import('../entities/Enemy.js').Enemy[]} enemies live array owned by
   *        the Game (mutated in place, so restarts are picked up automatically)
   * @param {object} [config]
   */
  constructor(enemies = [], config = {}) {
    /** Shared, mutable list — never copied, so it stays in sync with Game. */
    this.enemies = enemies;
    this.mode = config.mode ?? CONFIG.combat.targeting.mode;
    this.defaultRange = config.range ?? CONFIG.combat.targeting.range;
    this.shareTargets = config.shareTargets ?? CONFIG.combat.targeting.shareTargets;
    this.retargetDelay = config.retargetDelay ?? CONFIG.combat.targeting.retargetDelay;

    /** Telemetry for the debug overlay. */
    this.scans = 0;
    this.lastCandidates = 0;
  }

  /** Point the manager at a (new) enemy list — used by Game.restart(). */
  setEnemies(enemies) {
    this.enemies = enemies;
    return this;
  }

  get aliveCount() {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) n++;
    return n;
  }

  /**
   * Is `enemy` still a legal target for a mount?
   * (Mounts call this every step to decide whether to keep their lock.)
   */
  isValid(enemy, x, y, range, arcCenter, arcHalf) {
    if (!enemy || !enemy.alive) return false;
    const dSq = distanceSq(x, y, enemy.x, enemy.y);
    if (dSq > range * range) return false;
    return this.isInArc(enemy, x, y, arcCenter, arcHalf);
  }

  /** Angle-only test: does the enemy fall inside the mount's traverse arc? */
  isInArc(enemy, x, y, arcCenter, arcHalf) {
    const angle = Math.atan2(enemy.y - y, enemy.x - x);
    return Math.abs(wrapAngle(angle - arcCenter)) <= arcHalf;
  }

  /**
   * Best target for a mount.
   *
   * @param {number} x      muzzle world x
   * @param {number} y      muzzle world y
   * @param {number} range  weapon range
   * @param {object} opts
   * @param {number} [opts.arcCenter] world-space centre of the allowed arc
   * @param {number} [opts.arcHalf]   half-width of the allowed arc (radians)
   * @param {Set<object>} [opts.reserved] enemies already claimed this scan
   * @returns {import('../entities/Enemy.js').Enemy|null}
   */
  findBest(x, y, range = this.defaultRange, opts = {}) {
    this.scans++;

    const arcCenter = opts.arcCenter;
    const arcHalf = opts.arcHalf;
    const reserved = opts.reserved;
    const rangeSq = range * range;

    let best = null;
    let bestScore = Infinity;
    let candidates = 0;

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      if (reserved && reserved.has(e)) continue;

      const dSq = distanceSq(x, y, e.x, e.y);
      if (dSq > rangeSq) continue;
      if (arcHalf !== undefined && arcCenter !== undefined && !this.isInArc(e, x, y, arcCenter, arcHalf)) continue;

      candidates++;
      const score = this._score(e, dSq);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }

    this.lastCandidates = candidates;
    return best;
  }

  /** Lower is better. Distance is always the tiebreaker. */
  _score(enemy, dSq) {
    switch (this.mode) {
      case 'weakest':
        return enemy.hull * 1e6 + dSq * 1e-3;
      case 'strongest':
        return (enemy.maxHull - enemy.hull) * 1e6 + dSq * 1e-3;
      case 'nearest':
      default:
        return dSq;
    }
  }

  /** Shared "who is claimed" set helper (cleared by WeaponSystem each step). */
  static createReservedSet() {
    return new Set();
  }

  /** Human-readable state for the debug overlay. */
  debugString(mounts = []) {
    const locks = mounts.map((m) => `${m.label}:${m.target ? 'lock' : m.hasTarget ? '?' : '-'}`).join(' ');
    return `targets ${this.aliveCount}/${this.enemies.length}  ${locks}`;
  }

  /** Sanity helper used by tests: nearest enemy to a point, ignoring arcs. */
  nearest(x, y, range = Infinity) {
    return this.findBest(x, y, range === Infinity ? Number.MAX_SAFE_INTEGER : range, {});
  }

  static clampRange(range) {
    return clamp(range, 0, 100000);
  }
}

export default TargetingManager;
