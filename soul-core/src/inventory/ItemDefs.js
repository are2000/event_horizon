/**
 * ItemDefs.js
 * ----------------------------------------------------------------------------
 * The equipment catalogue — pure data, no behaviour.
 *
 * Two kinds of item:
 *
 *   weapon — a gun. Sits in the grid until it is dragged into a hardpoint
 *            slot; only then does it exist on the ship (and cost power).
 *   module — passive gear. Its bonus applies while it is anywhere in the
 *            grid, so the hold itself is part of the build.
 *
 * Merging: two items with the same `id` AND the same `tier` combine into one
 * item of the next tier. Every stat scales per tier (see TIER_SCALE), so a
 * Laser T3 is heavier and thirstier as well as deadlier — the merge ladder is
 * a trade-off, not a free win.
 *
 * Adding a new item is one entry here (+ an icon in InventoryUI.iconSvg).
 */
import { CONFIG } from '../config.js';

/**
 * Per-tier growth. Numbers are multipliers applied (tier - 1) times:
 *   value(tier) = base * scale^(tier - 1)
 * Damage grows fastest; weight and power grow slowest, so higher tiers are
 * more efficient per kilogram but absolutely harder to run.
 */
export const TIER_SCALE = {
  damage: 1.7, // dps (laser) and per-shot damage (cannon)
  rate: 1.08, // shots/s (cannon)
  weight: 1.25,
  power: 1.32, // power draw / per-shot cost
  heat: 1.28,
  range: 1.07,
  bonus: 1.7, // module passive bonuses
  regen: 1.5, // flat recharge bonuses
};

/** Highest tier reachable by merging (two of these can't combine further). */
export const MAX_TIER = 4;

export const ITEM_DEFS = {
  /* ------------------------------------------------------------- weapons -- */
  laser: {
    id: 'laser',
    name: 'Laser',
    kind: 'weapon',
    weaponType: 'laser', // registry key in WeaponSystem
    size: { w: 1, h: 2 }, // cells: a long emitter
    color: '#7cf9ff',
    icon: 'laser',
    maxTier: MAX_TIER,
    weight: 3,
    range: 520,
    // continuous beam
    dps: 34,
    powerDraw: 7, // units/s while the beam is up
    heat: 13, // units/s while the beam is up
    desc: 'Continuous beam. Cheap to run, relentless, melts armour slowly.',
  },

  cannon: {
    id: 'cannon',
    name: 'Cannon',
    kind: 'weapon',
    weaponType: 'cannon',
    size: { w: 1, h: 2 },
    color: '#ffd166',
    icon: 'cannon',
    maxTier: MAX_TIER,
    weight: 5,
    range: 470,
    // burst fire: damage arrives in chunks, with travel time
    damage: 30, // per shell
    rate: 2.0, // shells/s
    powerPerShot: 9,
    heatPerShot: 10,
    speed: 900, // wu/s muzzle velocity
    spread: 0.045, // radians of inaccuracy
    desc: 'Shell gun. Big hits, slow rate — and you pay the capacitor per shot.',
  },

  /* ------------------------------------------------------------- modules -- */
  capacitor: {
    id: 'capacitor',
    name: 'Capacitor',
    kind: 'module',
    size: { w: 1, h: 1 },
    color: '#22d3ee',
    icon: 'capacitor',
    maxTier: MAX_TIER,
    weight: 2,
    bonus: { maxPower: 18, powerRegen: 2 },
    desc: 'Deeper capacitor bank. +max charge and a little more recharge.',
  },

  radiator: {
    id: 'radiator',
    name: 'Radiator',
    kind: 'module',
    size: { w: 1, h: 1 },
    color: '#ff8a3c',
    icon: 'radiator',
    maxTier: MAX_TIER,
    weight: 2,
    bonus: { coolingRate: 4, maxHeat: 8 },
    desc: 'Dump heat faster and push the redline a little further out.',
  },

  plating: {
    id: 'plating',
    name: 'Plating',
    kind: 'module',
    size: { w: 1, h: 1 },
    color: '#4ade80',
    icon: 'plating',
    maxTier: MAX_TIER,
    weight: 3,
    bonus: { maxHull: 18 },
    desc: 'Bolt-on armour. Heavier, but the hull takes longer to open.',
  },
};

/** Ordered ids — the drop table and the devtools spawner both use this. */
export const ITEM_IDS = Object.keys(ITEM_DEFS);

/** Weighted loot table (relative weights, not probabilities). */
export const DROP_TABLE = {
  laser: 30,
  cannon: 20,
  capacitor: 18,
  radiator: 16,
  plating: 16,
};

export function getDef(id) {
  return ITEM_DEFS[id] ?? null;
}

/** value * scale^(tier-1), rounded to something displayable. */
export function tierValue(base, tier, scale) {
  if (!base) return 0;
  return base * Math.pow(scale, tier - 1);
}

export const round1 = (v) => Math.round(v * 10) / 10;

/** Starting loadout: what the hauler leaves drydock with. */
export const START_LOADOUT = CONFIG.inventory.startLoadout;
