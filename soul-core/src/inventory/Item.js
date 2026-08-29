/**
 * Item.js
 * ----------------------------------------------------------------------------
 * One piece of equipment: a definition + a tier + where it currently sits.
 *
 * An item is deliberately dumb — it knows its own numbers and nothing about
 * the grid, the ship or the canvas. Inventory owns placement, EquipmentSystem
 * owns what an item does to the ship, InventoryUI owns how it looks.
 *
 * Tier scaling lives in ONE place (see `stats`), so a Laser T3 shown in a
 * tooltip, merged in the grid and bolted to a mount are always the same gun.
 */
import { CONFIG } from '../config.js';
import { getDef, tierValue, round1, TIER_SCALE } from './ItemDefs.js';

export class Item {
  static _nextUid = 1;

  /**
   * @param {object} opts
   * @param {string} opts.defId   key into ITEM_DEFS ('laser', 'capacitor', ...)
   * @param {number} [opts.tier]  1..maxTier
   * @param {number} [opts.col]   grid column (-1 = not in the grid)
   * @param {number} [opts.row]   grid row
   * @param {boolean} [opts.rotated] 90° turn (swaps w/h)
   * @param {string|null} [opts.mountId] hardpoint it is equipped to, if any
   */
  constructor(opts = {}) {
    this.uid = Item._nextUid++;
    this.defId = opts.defId ?? 'laser';
    this.tier = Math.max(1, opts.tier ?? 1);
    this.col = opts.col ?? -1;
    this.row = opts.row ?? 0;
    this.rotated = !!opts.rotated;
    /** 'left' | 'right' | 'rear' | null */
    this.mountId = opts.mountId ?? null;
  }

  get def() {
    return getDef(this.defId);
  }

  get name() {
    return `${this.def?.name ?? 'Unknown'} T${this.tier}`;
  }

  get kind() {
    return this.def?.kind ?? 'module';
  }

  get isWeapon() {
    return this.def?.kind === 'weapon';
  }

  get color() {
    return this.def?.color ?? '#9fb4d8';
  }

  get maxTier() {
    return this.def?.maxTier ?? 1;
  }

  /** True when this item is at the top of the merge ladder. */
  get maxed() {
    return this.tier >= this.maxTier;
  }

  /* ----------------------------------------------------------------- size -- */

  /** Cells wide (rotation aware). */
  get w() {
    const s = this.def?.size ?? { w: 1, h: 1 };
    return this.rotated ? s.h : s.w;
  }

  /** Cells tall (rotation aware). */
  get h() {
    const s = this.def?.size ?? { w: 1, h: 1 };
    return this.rotated ? s.w : s.h;
  }

  get cells() {
    return this.w * this.h;
  }

  /** True for 1x2 style items where turning it around matters. */
  get rotatable() {
    const s = this.def?.size ?? { w: 1, h: 1 };
    return s.w !== s.h;
  }

  rotate() {
    if (!this.rotatable) return false;
    this.rotated = !this.rotated;
    return true;
  }

  /* ---------------------------------------------------------------- stats -- */

  /**
   * Every derived number, scaled by tier. Cached because the UI reads it
   * several times per render and the tier only changes on a merge.
   */
  get stats() {
    if (this._stats && this._statsTier === this.tier) return this._stats;
    const d = this.def;
    const t = this.tier;
    const s = {
      weight: round1(tierValue(d.weight ?? 0, t, TIER_SCALE.weight)),
      range: Math.round(tierValue(d.range ?? 0, t, TIER_SCALE.range)),
    };

    if (d.kind === 'weapon') {
      if (d.weaponType === 'cannon') {
        const damage = tierValue(d.damage ?? 0, t, TIER_SCALE.damage);
        const rate = tierValue(d.rate ?? 1, t, TIER_SCALE.rate);
        s.damage = round1(damage);
        s.rate = round1(rate);
        s.dps = round1(damage * rate);
        // Sustained draw, so the inventory panel can compare unlike guns.
        s.powerDraw = round1(tierValue(d.powerPerShot ?? 0, t, TIER_SCALE.power) * rate);
        s.heat = round1(tierValue(d.heatPerShot ?? 0, t, TIER_SCALE.heat) * rate);
        s.powerPerShot = round1(tierValue(d.powerPerShot ?? 0, t, TIER_SCALE.power));
        s.heatPerShot = round1(tierValue(d.heatPerShot ?? 0, t, TIER_SCALE.heat));
      } else {
        s.dps = round1(tierValue(d.dps ?? 0, t, TIER_SCALE.damage));
        s.powerDraw = round1(tierValue(d.powerDraw ?? 0, t, TIER_SCALE.power));
        s.heat = round1(tierValue(d.heat ?? 0, t, TIER_SCALE.heat));
      }
      // Standby draw: an installed gun bleeds power even while it is silent.
      s.load = round1(s.powerDraw * CONFIG.inventory.idleLoadFactor);
    } else {
      s.bonus = {};
      const b = d.bonus ?? {};
      for (const key in b) {
        s.bonus[key] = round1(tierValue(b[key], t, key === 'powerRegen' ? TIER_SCALE.regen : TIER_SCALE.bonus));
      }
      s.load = 0;
    }

    this._stats = s;
    this._statsTier = this.tier;
    return s;
  }

  /** Mass contributed to the hold (Weapon/Weight systems read the total). */
  get weight() {
    return this.stats.weight;
  }

  /** Power this item eats while installed (units/s, standby rate). */
  get load() {
    return this.stats.load ?? 0;
  }

  get bonus() {
    return this.stats.bonus ?? null;
  }

  /** Effective sustained damage, for tooltips and the HUD. */
  get dps() {
    return this.stats.dps ?? 0;
  }

  /* --------------------------------------------------------------- merging -- */

  /** Can this item merge into `other`? (Identical def, identical tier, room.) */
  canMergeWith(other) {
    return !!other && other !== this && other.defId === this.defId &&
      other.tier === this.tier && this.tier < this.maxTier;
  }

  /** A brand new item one tier up. */
  nextTier() {
    const next = new Item({ defId: this.defId, tier: Math.min(this.maxTier, this.tier + 1) });
    return next;
  }

  /* --------------------------------------------------------------- weapons -- */

  /**
   * Config object for WeaponSystem.createWeapon() — the bridge between
   * "an item in a slot" and "a gun bolted to a mount".
   */
  weaponConfig() {
    const d = this.def;
    if (!d || d.kind !== 'weapon') return null;
    const s = this.stats;
    const base = {
      name: this.name,
      tier: this.tier,
      range: s.range,
      color: d.color,
      coreColor: '#ffffff',
      fireTolerance: CONFIG.combat[d.weaponType]?.fireTolerance ?? 0.1,
    };
    if (d.weaponType === 'cannon') {
      return {
        ...base,
        damage: s.damage,
        shotsPerSecond: s.rate,
        powerPerShot: s.powerPerShot,
        heatPerShot: s.heatPerShot,
        speed: d.speed,
        spread: d.spread,
        coreColor: '#fff3c4',
      };
    }
    return {
      ...base,
      dps: s.dps,
      powerDraw: s.powerDraw,
      heatGain: s.heat,
      width: CONFIG.combat.laser.width,
      spinUpTime: CONFIG.combat.laser.spinUpTime,
    };
  }

  /** Short stat lines for the tooltip. */
  describe() {
    const s = this.stats;
    const lines = [];
    if (this.isWeapon) {
      lines.push(['DPS', String(s.dps)]);
      lines.push(['DRAW', `${s.powerDraw}/s`]);
      lines.push(['HEAT', `${s.heat}/s`]);
      lines.push(['RANGE', String(s.range)]);
      if (this.def.weaponType === 'cannon') lines.push(['RATE', `${s.rate}/s`]);
    } else if (s.bonus) {
      for (const key in s.bonus) {
        lines.push([BONUS_LABELS[key] ?? key, `+${s.bonus[key]}`]);
      }
    }
    lines.push(['MASS', String(s.weight)]);
    if (this.isWeapon && s.load > 0) lines.push(['LOAD', `${s.load}/s`]);
    return lines;
  }

  toJSON() {
    return { defId: this.defId, tier: this.tier, col: this.col, row: this.row, rotated: this.rotated, mountId: this.mountId };
  }

  static fromJSON(json) {
    return new Item(json);
  }
}

export const BONUS_LABELS = {
  maxPower: 'CAPACITY',
  powerRegen: 'RECHARGE',
  coolingRate: 'COOLING',
  maxHeat: 'REDLINE',
  maxHull: 'HULL',
};

export default Item;
