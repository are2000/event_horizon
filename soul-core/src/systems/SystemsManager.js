/**
 * SystemsManager.js
 * ----------------------------------------------------------------------------
 * Owns every ShipSystem and produces the frame's aggregate `modifiers` object
 * that Ship physics consumes.
 *
 * Pipeline (once per fixed simulation step):
 *
 *   1. reset modifiers to neutral (all 1)
 *   2. for each installed system: system.update(dt, ship) — move the gauges
 *   3. for each installed system: system.apply(modifiers, ship) — stack
 *      multipliers (Weight x Drive x Heat x Corrosion...)
 *   4. clamp every gauge into its legal range
 *   5. hand the aggregate to the ship
 *
 * Why modifiers instead of systems poking the ship directly? Because N systems
 * can influence the same stat without knowing about each other, and the debug
 * overlay can print exactly *why* the ship is slow:
 *
 *   thrustMul 0.31 = weight 0.60 x brownout 0.88 x overheat 0.72
 *
 * Each system can report its own slice of that product via `explain()`.
 */
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';
import { createModifiers } from '../entities/Ship.js';

export class SystemsManager {
  /**
   * @param {import('../entities/Ship.js').Ship} ship
   * @param {import('../core/EventBus.js').EventBus} [events]
   */
  constructor(ship, events = null) {
    this.ship = ship;
    this.events = events;

    /** Installed systems, in update order. Order matters: consumers run
     *  before the gauges they consume from are recharged. */
    /** @type {import('./ShipSystem.js').ShipSystem[]} */
    this.systems = [];

    /** Live aggregate multipliers handed to Ship each step. */
    this.modifiers = createModifiers();

    /**
     * Shared per-step context for systems that need more than the ship:
     * Game fills this with { world, particles, camera, events, targeting,
     * enemies, time } and keeps it up to date (including across restarts).
     * Systems read `this.manager.context` instead of reaching for globals.
     */
    this.context = null;
  }

  /**
   * Install a system. Returns an uninstall function (handy for temporary
   * buffs: `const off = systems.install(boost); ... off();`).
   * @param {import('./ShipSystem.js').ShipSystem} system
   */
  install(system) {
    if (this.systems.indexOf(system) !== -1) return () => {};
    system.manager = this; // gives the system access to the shared bus
    this.systems.push(system);
    system.attach(this.ship);
    this.events?.emit('system:installed', { system, ship: this.ship });
    return () => this.uninstall(system);
  }

  uninstall(system) {
    const i = this.systems.indexOf(system);
    if (i === -1) return;
    this.systems.splice(i, 1);
    system.detach();
    system.manager = null;
    this.events?.emit('system:uninstalled', { system, ship: this.ship });
  }

  get(id) {
    return this.systems.find((s) => s.id === id) ?? null;
  }

  /** @param {number} dt fixed step */
  update(dt) {
    const ship = this.ship;
    const m = this.modifiers;

    /* --- 1. neutral -------------------------------------------------------- */
    for (const key in m) m[key] = 1;

    /* --- 2 + 3. simulate, then stack modifiers ---------------------------- */
    for (let i = 0; i < this.systems.length; i++) {
      const s = this.systems[i];
      if (!s.enabled) continue;
      s.age += dt;
      s.update(dt, ship);
    }
    for (let i = 0; i < this.systems.length; i++) {
      const s = this.systems[i];
      if (!s.enabled) continue;
      s.apply(m, ship);
    }

    /* --- 4. keep every gauge legal ---------------------------------------- */
    this.clampGauges(ship);

    /* --- 5. hand the aggregate to the ship -------------------------------- */
    ship.modifiers = m;
  }

  /** Single place where every gauge is confined to its legal range. */
  clampGauges(ship) {
    const cfg = CONFIG.systems;
    const s = ship.stats;
    s.weight = clamp(s.weight, 0, s.maxWeight);
    s.power = clamp(s.power, 0, s.maxPower);
    // Heat is the only gauge allowed past its maximum (the redline band).
    s.heat = clamp(s.heat, 0, s.maxHeat * cfg.heatCeiling);
    s.hull = clamp(s.hull, 0, s.maxHull);
    s.coreCorrosion = clamp(s.coreCorrosion, 0, 100);
  }

  /**
   * New run: clear the gauges and every system's internal state. Ratings
   * (maxPower, coolingRate...) are preserved by Ship.reset().
   */
  reset() {
    for (let i = 0; i < this.systems.length; i++) {
      const s = this.systems[i];
      s.age = 0;
      s.reset();
    }
    for (const key in this.modifiers) this.modifiers[key] = 1;
    this.ship.modifiers = this.modifiers;
  }

  /** "thrust 0.31 = weight 0.60 x brownout 0.88 x overheat 0.72" */
  explain(stat = 'thrustMul') {
    const parts = [];
    for (const s of this.systems) {
      if (!s.enabled || typeof s.explain !== 'function') continue;
      const factor = s.explain(stat, this.ship);
      if (factor === null || factor === undefined || Math.abs(factor - 1) < 1e-4) continue;
      parts.push(`${s.id} ${factor.toFixed(2)}`);
    }
    const total = this.modifiers[stat];
    return `${stat} ${total.toFixed(2)}${parts.length ? ' = ' + parts.join(' x ') : ''}`;
  }

  /** Compact snapshot for the debug overlay. */
  dump() {
    return this.explain('thrustMul') + ' | ' + this.explain('turnRateMul');
  }
}

export default SystemsManager;
