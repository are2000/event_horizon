/**
 * Inventory.js
 * ----------------------------------------------------------------------------
 * The cargo hold: a COLS x ROWS grid of cells plus three hardpoint slots.
 *
 * It is pure model — no DOM, no canvas, no ship. Everything it does is
 * announced on the event bus, and EquipmentSystem is what turns "two lasers
 * merged" into "the ship is 3kg lighter and recharges faster".
 *
 * Cells
 *   `cells[row * cols + col]` holds the item occupying that cell (every cell
 *   an item covers points at it), so "what is under my finger" and "is this
 *   footprint free" are both O(area) with no allocation.
 *
 * Placement rules
 *   - an item covers w x h cells (rotation swaps them)
 *   - the footprint must be inside the grid and free — except for the item's
 *     own cells, which is what makes a drag look continuous
 *
 * Merge rules
 *   - drop an item onto an IDENTICAL item of the SAME tier
 *   - the target upgrades in place, the dragged item is consumed
 *   - max tier items can't merge (the drop is refused, so nothing is lost)
 *
 * Equip rules
 *   - only weapons fit a hardpoint
 *   - swapping an occupied slot pushes the old gun back into the grid; if
 *     there is no room the drop is refused rather than silently destroying it
 */
import { CONFIG } from '../config.js';
import { Item } from './Item.js';

export class Inventory {
  /**
   * @param {object} [opts]
   * @param {import('../core/EventBus.js').EventBus} [opts.events]
   */
  constructor(opts = {}) {
    this.cols = opts.cols ?? CONFIG.inventory.cols;
    this.rows = opts.rows ?? CONFIG.inventory.rows;
    this.events = opts.events ?? null;

    /** Every carried item (grid + equipped). */
    this.items = [];
    /** Occupancy map: item | null, row-major. */
    this.cells = new Array(this.cols * this.rows).fill(null);
    /** mountId -> Item | null */
    this.equipped = { left: null, right: null, rear: null };
    /** Mount ids, in display order. */
    this.mountIds = Object.keys(this.equipped);
  }

  get size() {
    return this.cols * this.rows;
  }

  /** Items that live in the grid (not equipped). */
  *gridItems() {
    for (const item of this.items) if (!item.mountId) yield item;
  }

  /* ----------------------------------------------------------------- cells -- */

  index(col, row) {
    return row * this.cols + col;
  }

  inBounds(col, row, w = 1, h = 1) {
    return col >= 0 && row >= 0 && col + w <= this.cols && row + h <= this.rows;
  }

  itemAt(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return this.cells[this.index(col, row)];
  }

  /**
   * Would `item` fit at (col,row)?
   * @param {Item} item
   * @param {Item} [ignore] item whose own cells don't count (the one being dragged)
   */
  canPlace(item, col, row, ignore = null) {
    if (!item || !this.inBounds(col, row, item.w, item.h)) return false;
    const w = item.w;
    const h = item.h;
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        const occupant = this.cells[this.index(c, r)];
        if (occupant && occupant !== ignore) return false;
      }
    }
    return true;
  }

  /** Write the occupancy map for an item (assumes the space is legal). */
  _stamp(item, clear = false) {
    const w = item.w;
    const h = item.h;
    for (let r = item.row; r < item.row + h; r++) {
      for (let c = item.col; c < item.col + w; c++) {
        if (this.inBounds(c, r)) this.cells[this.index(c, r)] = clear ? null : item;
      }
    }
  }

  /** First slot where `item` fits (scanning row-major, like reading text). */
  findFreeSlot(item, ignore = null) {
    for (let r = 0; r <= this.rows - item.h; r++) {
      for (let c = 0; c <= this.cols - item.w; c++) {
        if (this.canPlace(item, c, r, ignore)) return { col: c, row: r };
      }
    }
    return null;
  }

  /* ----------------------------------------------------------------- items -- */

  /** Add an item to the grid. @returns {Item|null} null when the hold is full. */
  add(item) {
    const slot = this.findFreeSlot(item);
    if (!slot) {
      this.events?.emit('inventory:full', { item });
      return null;
    }
    item.col = slot.col;
    item.row = slot.row;
    item.mountId = null;
    this.items.push(item);
    this._stamp(item);
    this.events?.emit('item:added', { item });
    this._changed('add');
    return item;
  }

  /** Convenience: build + add. @returns {Item|null} */
  addDef(defId, tier = 1) {
    return this.add(new Item({ defId, tier }));
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i === -1) return false;
    if (item.mountId) this.equipped[item.mountId] = null;
    else this._stamp(item, true);
    this.items.splice(i, 1);
    this.events?.emit('item:removed', { item });
    this._changed('remove');
    return true;
  }

  /** Move an item already in the grid. Returns false if the target is illegal. */
  move(item, col, row) {
    if (!item || item.mountId) return false;
    if (!this.canPlace(item, col, row, item)) return false;
    this._stamp(item, true);
    item.col = col;
    item.row = row;
    this._stamp(item);
    this._changed('move');
    return true;
  }

  /** Rotate in place (keeps the top-left cell; nudges back inside if it pokes out). */
  rotate(item) {
    if (!item || item.mountId || !item.rotatable) return false;
    this._stamp(item, true);
    item.rotate();
    // Keep it legal: clamp the origin, then fall back to any free slot.
    item.col = Math.min(item.col, this.cols - item.w);
    item.row = Math.min(item.row, this.rows - item.h);
    if (!this.canPlace(item, item.col, item.row, item)) {
      const slot = this.findFreeSlot(item);
      if (!slot) {
        item.rotate(); // undo
        this._stamp(item);
        return false;
      }
      item.col = slot.col;
      item.row = slot.row;
    }
    this._stamp(item);
    this._changed('rotate');
    return true;
  }

  /* ---------------------------------------------------------------- merging -- */

  /**
   * Merge `dragged` into `target`. The target stays where it is and goes up a
   * tier; the dragged item is destroyed.
   * @returns {Item|null} the upgraded item, or null if the merge was illegal
   */
  merge(dragged, target) {
    if (!dragged || !target) return null;
    if (!dragged.canMergeWith(target)) return null;

    const from = { col: dragged.col, row: dragged.row };
    // Order matters: remove first so the target's own re-stamp is clean.
    this.remove(dragged);

    const newTier = Math.min(target.maxTier, target.tier + 1);
    // Equipped items stay equipped; grid items keep their cell (and may need a
    // nudge if a 1x2 grew, which it can't — rotation is preserved).
    this._stamp(target, true);
    target.tier = newTier;
    target._stats = null; // invalidate the tier-scaled stat cache
    const slot = this.canPlace(target, target.col, target.row) ? { col: target.col, row: target.row } : this.findFreeSlot(target);
    target.col = slot ? slot.col : target.col;
    target.row = slot ? slot.row : target.row;
    if (!target.mountId) this._stamp(target);

    const mergeEvent = { item: target, from, consumed: dragged, tier: newTier };
    this.events?.emit('item:merged', mergeEvent);
    this._changed('merge');
    return target;
  }

  /* --------------------------------------------------------------- equipping -- */

  canEquip(item, mountId) {
    return !!item && item.isWeapon && mountId in this.equipped;
  }

  /**
   * Bolt a weapon into a hardpoint. Anything already there is pushed back into
   * the grid (into the slot the incoming item just vacated, if it fits).
   * @returns {boolean}
   */
  equip(item, mountId) {
    if (!this.canEquip(item, mountId)) return false;

    const previous = this.equipped[mountId];
    const vacated = item.mountId ? null : { col: item.col, row: item.row };

    // Take the incoming item out of the grid (or out of its old slot).
    if (item.mountId) this.equipped[item.mountId] = null;
    else this._stamp(item, true);

    // ...and find a home for whatever it displaced.
    if (previous && previous !== item) {
      this.equipped[mountId] = null;
      let slot = vacated && this.canPlace(previous, vacated.col, vacated.row) ? vacated : null;
      if (!slot) slot = this.findFreeSlot(previous);
      if (!slot) {
        // No room to put the old gun back: refuse the swap, undo everything.
        this.equipped[mountId] = previous;
        if (vacated) {
          item.col = vacated.col;
          item.row = vacated.row;
          this._stamp(item);
        } else {
          this.equipped[item.mountId ?? mountId] = item;
        }
        this.events?.emit('inventory:full', { item: previous, swapping: true });
        return false;
      }
      previous.mountId = null;
      previous.col = slot.col;
      previous.row = slot.row;
      this._stamp(previous);
      this.events?.emit('item:unequipped', { item: previous, mountId, swapped: true });
    }

    this.equipped[mountId] = item;
    item.mountId = mountId;
    item.col = -1;
    item.row = 0;

    this.events?.emit('item:equipped', { item, mountId });
    this._changed('equip');
    return true;
  }

  /** Take a weapon out of a hardpoint and drop it into the grid. */
  unequip(mountId) {
    const item = this.equipped[mountId];
    if (!item) return false;
    const slot = this.findFreeSlot(item);
    if (!slot) {
      this.events?.emit('inventory:full', { item });
      return false;
    }
    this.equipped[mountId] = null;
    item.mountId = null;
    item.col = slot.col;
    item.row = slot.row;
    this._stamp(item);
    this.events?.emit('item:unequipped', { item, mountId });
    this._changed('unequip');
    return true;
  }

  /** Item equipped in a mount (or null). */
  equippedIn(mountId) {
    return this.equipped[mountId] ?? null;
  }

  /** First mount that can take this weapon and is free. */
  firstFreeMount(item) {
    if (!item?.isWeapon) return null;
    for (const id of this.mountIds) if (!this.equipped[id]) return id;
    return null;
  }

  /* ----------------------------------------------------------------- totals -- */

  /** Mass of everything carried (grid + hardpoints). Feeds the Weight system. */
  get totalWeight() {
    let sum = 0;
    for (let i = 0; i < this.items.length; i++) sum += this.items[i].weight;
    return Math.round(sum * 10) / 10;
  }

  /** Standby power draw of every INSTALLED weapon (units/s). */
  get powerLoad() {
    let sum = 0;
    for (const id of this.mountIds) {
      const item = this.equipped[id];
      if (item) sum += item.load;
    }
    return Math.round(sum * 10) / 10;
  }

  /** Passive bonuses from every module in the grid. */
  get bonuses() {
    const out = {};
    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i].bonus;
      if (!b) continue;
      for (const key in b) out[key] = Math.round(((out[key] ?? 0) + b[key]) * 10) / 10;
    }
    return out;
  }

  /* ------------------------------------------------------------------ misc -- */

  _changed(reason) {
    this.events?.emit('inventory:changed', { inventory: this, reason, weight: this.totalWeight, powerLoad: this.powerLoad });
  }

  /** Wipe the hold (new game / debug). */
  clear(loadout = null) {
    this.items.length = 0;
    this.cells.fill(null);
    for (const id of this.mountIds) this.equipped[id] = null;
    if (loadout) this.load(loadout);
    this._changed('clear');
  }

  /**
   * Build a starting loadout.
   * @param {Array<{defId:string,tier?:number,mount?:string,col?:number,row?:number,rotated?:boolean}>} entries
   */
  load(entries = []) {
    for (const entry of entries) {
      const item = new Item({ defId: entry.defId, tier: entry.tier ?? 1, rotated: entry.rotated ?? false });
      if (entry.mount && entry.mount in this.equipped && item.isWeapon) {
        if (!this.equipped[entry.mount]) {
          this.items.push(item);
          this.equipped[entry.mount] = item;
          item.mountId = entry.mount;
          item.col = -1;
          continue;
        }
      }
      this.add(item);
    }
    this._changed('load');
    return this;
  }

  /** Debug snapshot. */
  debugString() {
    const gear = this.mountIds.map((id) => `${id}:${this.equipped[id]?.name ?? '-'}`).join(' ');
    return `hold ${this.items.length} items  ${this.totalWeight}kg  load ${this.powerLoad}/s  ${gear}`;
  }
}

export default Inventory;
