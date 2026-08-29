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

/** Weapons that throw something (and therefore share one stat block). */
const BALLISTIC = new Set(['cannon', 'kinetic', 'plasma']);

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
      if (BALLISTIC.has(d.weaponType)) {
        // Round FIRST, then derive: the weapon is built from the rounded
        // damage/rate (see weaponConfig), so deriving DPS and sustained draw
        // from the unrounded values made the tooltip quote 371.3 dps for a gun
        // that actually fired 368.5. One source of truth, rounded once.
        s.damage = round1(tierValue(d.damage ?? 0, t, TIER_SCALE.damage));
        s.rate = round1(tierValue(d.rate ?? 1, t, TIER_SCALE.rate));
        s.powerPerShot = round1(tierValue(d.powerPerShot ?? 0, t, TIER_SCALE.power));
        s.heatPerShot = round1(tierValue(d.heatPerShot ?? 0, t, TIER_SCALE.heat));
        s.dps = round1(s.damage * s.rate);
        // Sustained draw, so the inventory panel can compare unlike guns.
        s.powerDraw = round1(s.powerPerShot * s.rate);
        s.heat = round1(s.heatPerShot * s.rate);
        s.speed = d.speed;
        s.spread = d.spread;
        // Kinetic: the muzzle impulse that shoves the ship.
        if (d.recoil) s.recoil = round1(tierValue(d.recoil, t, TIER_SCALE.recoil));
        // Plasma: the blast. Damage scales like any other damage; the RADIUS
        // scales faster, because a bigger blast is the whole fantasy.
        if (d.splashRadius) {
          s.splashRadius = Math.round(tierValue(d.splashRadius, t, TIER_SCALE.splash));
          s.splashDamage = round1(tierValue(d.splashDamage ?? 0, t, TIER_SCALE.damage));
          s.splashKnockback = Math.round(tierValue(d.splashKnockback ?? 0, t, TIER_SCALE.splash));
          // Splash is the real damage dealer — quote it in the DPS figure.
          // 0.7 is the same weighting PlasmaCannon.dps uses, so the card and
          // the gun agree.
          s.dps = round1((s.damage + s.splashDamage * 0.7) * s.rate);
        }
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
    if (BALLISTIC.has(d.weaponType)) {
      const cfg = CONFIG.combat[d.weaponType] ?? {};
      return {
        ...base,
        damage: s.damage,
        shotsPerSecond: s.rate,
        powerPerShot: s.powerPerShot,
        heatPerShot: s.heatPerShot,
        speed: s.speed ?? cfg.speed,
        spread: s.spread ?? cfg.spread,
        projectileLife: cfg.projectileLife,
        recoil: s.recoil ?? cfg.recoil ?? 0,
        recoilWeightRelief: cfg.recoilWeightRelief ?? 0,
        splashRadius: s.splashRadius ?? 0,
        splashDamage: s.splashDamage ?? 0,
        splashFalloff: cfg.splashFalloff ?? 0.35,
        splashKnockback: s.splashKnockback ?? 0,
        coreColor: cfg.coreColor ?? '#ffffff',
        minDuty: cfg.minDuty,
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
      if (BALLISTIC.has(this.def.weaponType)) lines.push(['RATE', `${s.rate}/s`]);
      // The two new guns advertise what makes them special.
      if (s.splashRadius) lines.push(['BLAST', String(s.splashRadius)]);
      if (s.recoil) lines.push(['KICK', String(s.recoil)]);
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
