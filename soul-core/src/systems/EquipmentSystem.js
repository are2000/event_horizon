/**
 * EquipmentSystem.js
 * ----------------------------------------------------------------------------
 * The bridge between the CARGO HOLD and the SHIP.
 *
 * Inventory knows nothing about the ship; the ship knows nothing about grids.
 * This system is the only place the two meet, and it reacts to events rather
 * than polling, so a merge is applied exactly once:
 *
 *   item:equipped   -> build the weapon, bolt it to the mount, add its mass
 *   item:merged     -> rebuild that gun at the new tier, re-apply the numbers
 *   item:removed    -> empty the hardpoint, refund the mass
 *   inventory:changed -> recompute MASS, POWER LOAD and passive bonuses
 *
 * WHAT an item changes
 *   weight      every carried item adds mass to `stats.weight`, and WeightSystem
 *               turns that into the (1 - weight/maxWeight) thrust factor that
 *               already exists. A full hold is a slow ship. Free.
 *   powerLoad   every INSTALLED weapon bleeds `draw * idleLoadFactor` units/s,
 *               which PowerSystem subtracts from recharge. Guns cost you the
 *               capacitor even when they are quiet.
 *   bonuses     modules in the grid raise the ratings: maxPower, powerRegen,
 *               coolingRate, maxHeat, maxHull.
 *
 * All stat changes are applied as DELTAS against what this system last applied,
 * so it composes with anything else that moves the same numbers (debug cargo,
 * meta upgrades, future repair pickups) instead of stomping on them.
 */
import { CONFIG } from '../config.js';
import { ShipSystem } from './ShipSystem.js';

/** Bonus keys an item can grant -> ship stat of the same name. */
const BONUS_STATS = ['maxPower', 'powerRegen', 'coolingRate', 'maxHeat', 'maxHull'];
/** Raising these capacities also tops the live gauge up by the same amount. */
const REFILL_ON_RAISE = { maxPower: 'power', maxHull: 'hull' };

export class EquipmentSystem extends ShipSystem {
  static id = 'equipment';

  /** @param {object} config @param {import('../inventory/Inventory.js').Inventory} config.inventory */
  constructor(config = {}) {
    super({ id: EquipmentSystem.id, ...config });
    this.inventory = config.inventory ?? null;
    /** Last applied values — everything below is a delta against these. */
    this.gearWeight = 0;
    this.bonuses = {};
    this.powerLoad = 0;
    this._offChanged = null;
  }

  onAttach(ship) {
    this._offChanged = this.events?.on('inventory:changed', () => this.sync()) ?? null;
    this.sync();
  }

  onDetach() {
    if (this._offChanged) this._offChanged();
    this._offChanged = null;
  }

  /** The weapon system (mounts) — reached through the manager, never a global. */
  get weaponSystem() {
    return this.manager ? this.manager.get('weapons') : null;
  }

  /**
   * Push the whole inventory state onto the ship. Cheap and idempotent: it is
   * called on every inventory change, and every part is a no-op when nothing
   * moved.
   */
  sync() {
    const inv = this.inventory;
    const ship = this.ship;
    if (!inv || !ship) return this;

    this._syncMounts(inv);
    this._syncWeight(inv);
    this._syncPower(inv);
    this._syncBonuses(inv);
    return this;
  }

  /* --------------------------------------------------------------- mounts -- */

  _syncMounts(inv) {
    const weapons = this.weaponSystem;
    if (!weapons) return;

    for (let i = 0; i < weapons.mounts.length; i++) {
      const mount = weapons.mounts[i];
      const item = inv.equipped[mount.id] ?? null;

      if (item) {
        // Only rebuild when the actual item changed — a merge bumps the uid's
        // tier, so `itemUid` alone is not enough to detect it.
        const current = mount.weapon;
        if (current && current.itemUid === item.uid && current.tier === item.tier) continue;
        const config = item.weaponConfig();
        if (!config) {
          mount.setWeapon(null);
          continue;
        }
        const weapon = weapons.createWeapon(item.def.weaponType, { ...config, itemUid: item.uid });
        weapon.tier = item.tier;
        mount.setWeapon(weapon);
        this.events?.emit('weapon:installed', { mount, item, weapon });
      } else if (mount.weapon) {
        const removed = mount.weapon;
        mount.setWeapon(null);
        this.events?.emit('weapon:removed', { mount, weapon: removed });
      }
    }
  }

  /* --------------------------------------------------------------- weight -- */

  _syncWeight(inv) {
    const ship = this.ship;
    const target = inv.totalWeight;
    const delta = target - this.gearWeight;
    if (Math.abs(delta) < 1e-6) return;

    if (delta > 0) {
      const before = ship.stats.weight;
      ship.addWeight(delta);
      const loaded = ship.stats.weight - before;
      if (loaded + 1e-6 < delta) {
        // The hold is physically full — say so instead of silently ignoring it.
        this.events?.emit('cargo:overflow', { amount: delta - loaded, ship });
      }
    } else {
      ship.jettisonCargo(-delta);
    }
    this.gearWeight = target;
  }

  /* ---------------------------------------------------------------- power -- */

  _syncPower(inv) {
    const load = inv.powerLoad;
    if (Math.abs(load - this.powerLoad) < 1e-6) return;
    this.powerLoad = load;
    if (this.ship.stats.powerLoad !== undefined) this.ship.stats.powerLoad = load;
    this.events?.emit('power:load', { load, ship: this.ship });
  }

  /* -------------------------------------------------------------- bonuses -- */

  _syncBonuses(inv) {
    const ship = this.ship;
    const target = inv.bonuses;

    for (const key of BONUS_STATS) {
      const want = target[key] ?? 0;
      const have = this.bonuses[key] ?? 0;
      const delta = want - have;
      if (Math.abs(delta) < 1e-6) continue;

      const base = CONFIG.systems[key] ?? ship.stats[key] ?? 0;
      ship.stats[key] = Math.max(0, (ship.stats[key] ?? base) + delta);

      // Adding capacity shouldn't make a full gauge look emptier.
      const live = REFILL_ON_RAISE[key];
      if (live && delta > 0) ship.stats[live] = (ship.stats[live] ?? 0) + delta;

      this.bonuses[key] = want;
      this.events?.emit('stat:changed', { key, delta, value: ship.stats[key], ship });
    }

    // Keys that went away entirely (item sold/jettisoned mid-run).
    for (const key in this.bonuses) {
      if (!(key in target) && this.bonuses[key]) {
        ship.stats[key] = Math.max(0, (ship.stats[key] ?? 0) - this.bonuses[key]);
        this.bonuses[key] = 0;
      }
    }
  }

  /* ----------------------------------------------------------------- misc -- */

  /**
   * New run: the hold is untouched (gear survives death — that is the meta
   * layer for now). Ship.reset() rebuilds the stat block, which
   *   - zeroes weight and powerLoad  -> we must re-apply those, and
   *   - PRESERVES the raised ratings -> the module bonuses are still in there,
   *     so re-applying them would double-dip (100 + 18 + 18 = 136 hull).
   * Hence: keep `bonuses`, forget only what the reset actually cleared.
   */
  reset() {
    this.gearWeight = 0;
    this.powerLoad = -1; // force the first write even when the load is 0
    this.sync();
  }

  /** Debug overlay line. */
  explain() {
    return null; // numbers live on the gauges already
  }

  debugString() {
    const inv = this.inventory;
    if (!inv) return 'equipment: no inventory';
    return `gear ${inv.totalWeight}kg  load ${inv.powerLoad}/s  ` +
      Object.keys(inv.equipped).map((id) => `${id}:${inv.equipped[id]?.name ?? '-'}`).join(' ');
  }
}

export default EquipmentSystem;
