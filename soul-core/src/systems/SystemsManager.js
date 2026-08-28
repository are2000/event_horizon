/**
 * SystemsManager.js
 * ----------------------------------------------------------------------------
 * Owns every ShipSystem and produces the frame's aggregate `modifiers` object
 * that Ship physics consumes.
 *
 * Pipeline (once per fixed simulation step):
 *
 *   1. reset modifiers to neutral (all 1)
 *   2. apply BASE rules derived from the four resource gauges
 *      (weight -> mass/turn/top-speed, heat -> thrust derate,
 *       power  -> thrust scaling, corrosion -> grip + thrust decay)
 *   3. for each installed system: system.update(dt, ship) then
 *      system.apply(modifiers, ship)   <-- systems stack multiplicatively
 *   4. run passive resource dynamics (radiator cooling, capacitor recharge)
 *
 * Why modifiers instead of systems poking the ship directly? Because N systems
 * can then influence the same stat without knowing about each other, and the
 * debug overlay can print exactly *why* the ship is slow:
 *   thrustMul 0.62 = power 0.7 (0.81) x heat-derate 0.88 x corroded-engine 0.87
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

    /** Installed systems, in update order. */
    /** @type {import('./ShipSystem.js').ShipSystem[]} */
    this.systems = [];

    /** Live aggregate multipliers handed to Ship each step. */
    this.modifiers = createModifiers();

    /** Per-source breakdown for the debug overlay / tuning UI. */
    this.debug = {
      thrustFromPower: 1,
      thrustFromHeat: 1,
      thrustFromCorrosion: 1,
    };
  }

  /**
   * Install a system. Returns an uninstall function (handy for temporary
   * buffs: `const off = systems.install(boost); ... off();`).
   * @param {import('./ShipSystem.js').ShipSystem} system
   */
  install(system) {
    if (this.systems.indexOf(system) !== -1) return () => {};
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
    this.events?.emit('system:uninstalled', { system, ship: this.ship });
  }

  get(id) {
    return this.systems.find((s) => s.id === id) ?? null;
  }

  /** @param {number} dt fixed step */
  update(dt) {
    const ship = this.ship;
    const m = this.modifiers;
    const r = ship.resources;
    const cfg = CONFIG.systems;

    /* --- 1. neutral -------------------------------------------------------- */
    for (const key in m) m[key] = 1;

    /* --- 2. base rules from the resource gauges --------------------------- */
    // WEIGHT: heavier hull => more inertia, lazier turns, lower top speed.
    m.massMul *= 1 + r.weight * cfg.weightMassFactor;
    m.turnRateMul *= 1 / (1 + r.weight * 0.55);
    m.maxSpeedMul *= 1 - r.weight * cfg.weightSpeedPenalty;

    // HEAT: past the throttle threshold the engine control unit derates power
    // to protect the core. Non-linear, so mild heat is free and redlining hurts.
    const overheat = clamp((r.heat - cfg.heatThrottleThreshold) / (1 - cfg.heatThrottleThreshold), 0, 1);
    const heatDerate = 1 - cfg.heatThrottlePenalty * overheat;

    // POWER: thrust scales with available power, with a small floor so a
    // dead capacitor still leaves you drifting home rather than dead in space.
    const powerScale = 0.3 + 0.7 * clamp(r.power, 0, 1);

    // CORROSION: hull decay chews grip (you slide more) and bleeds thrust.
    const corrosionGrip = 1 - r.corrosion * cfg.corrosionGripPenalty;
    const corrosionThrust = 1 - r.corrosion * cfg.corrosionThrustPenalty;

    m.thrustMul *= powerScale * heatDerate * corrosionThrust;
    m.gripMul *= corrosionGrip;
    m.maxSpeedMul *= 1 - r.corrosion * cfg.corrosionSpeedPenalty;

    // Debug breadcrumbs (shown in the overlay: "why am I slow?").
    this.debug.thrustFromPower = powerScale;
    this.debug.thrustFromHeat = heatDerate;
    this.debug.thrustFromCorrosion = corrosionThrust;

    /* --- 3. installed systems stack on top -------------------------------- */
    for (let i = 0; i < this.systems.length; i++) {
      const s = this.systems[i];
      if (!s.enabled) continue;
      s.age += dt;
      s.update(dt, ship);
      s.apply(m, ship);
    }

    /* --- 4. passive resource dynamics ------------------------------------- */
    // Placeholders until the real systems exist: the hull radiates heat and
    // the capacitor trickles back to full. Weight/corrosion are persistent and
    // only change when a system (or a debug key) says so.
    r.heat = clamp(r.heat - cfg.heatCooling * dt, 0, 1);
    r.power = clamp(r.power + cfg.powerRegen * dt, 0, 1);

    /* --- 5. hand the aggregate to the ship -------------------------------- */
    ship.modifiers = m;
  }

  /** Human-readable snapshot for the debug overlay. */
  dump() {
    const m = this.modifiers;
    const parts = [];
    for (const key in m) parts.push(`${key}=${m[key].toFixed(2)}`);
    return parts.join(' ');
  }
}

export default SystemsManager;
