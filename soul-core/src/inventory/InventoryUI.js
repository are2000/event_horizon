/**
 * InventoryUI.js
 * ----------------------------------------------------------------------------
 * The cargo hold as a DOM overlay on top of the canvas.
 *
 * Why DOM and not canvas? Because this screen is a *touch surface*: hit
 * testing, hit slop, scrolling, focus and accessibility all come free, and
 * drag-and-drop (the one interaction that has to feel perfect) is a solved
 * problem with pointer events. The game keeps rendering behind it; the panel
 * is just a layer.
 *
 * TOUCH RULES that shaped this file
 *   1. Everything is driven by POINTER events (one code path for finger,
 *      stylus and mouse) with `touch-action: none` in CSS so the browser
 *      never steals a drag.
 *   2. A drag starts after ~7px of movement, so a tap still means "show me
 *      the details" — you never have to aim for a tiny grab handle.
 *   3. The dragged item is lifted ABOVE the finger (LIFT_PX) and scaled up,
 *      because a fingertip hides a 60px cell completely.
 *   4. Every possible landing spot is colour-coded the instant you pick
 *      something up: gold = will merge, green = fits, red = refuses.
 *   5. Nothing is ever destroyed by accident: illegal drops snap back, a full
 *      hold refuses the swap instead of eating the old gun, and jettison
 *      requires a deliberate drag onto the chute.
 *
 * The class owns DOM only. Placement, merging and equipping all happen in
 * Inventory; what that does to the ship happens in EquipmentSystem.
 */
import { CONFIG } from '../config.js';

/** How far the ghost floats above the fingertip (px). */
const LIFT_PX = 14;
/** Movement (px) before a press becomes a drag. */
const DRAG_THRESHOLD = 7;

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * '#7cf9ff' + alpha -> 'rgba(124, 249, 255, 0.35)'.
 * Pre-computing the translucent tints here keeps `color-mix()` (patchy on
 * older mobile Safari) out of the stylesheet.
 */
function tintVars(hex, alpha) {
  const h = String(hex ?? '#9fb4d8').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  if (!Number.isFinite(num)) return `rgba(159, 180, 216, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function el(tag, className, parent = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

/** Inline SVG glyphs — placeholder art, replaced by real icons later. */
const ICONS = {
  laser: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="2" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.55"/>' +
    '<path d="M8 12h13" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M8 12h13" stroke="#fff" stroke-width="0.9" stroke-linecap="round" opacity="0.85"/>' +
    '<circle cx="19" cy="12" r="1.6" fill="#fff"/></svg>',
  cannon: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="2" y="8.5" width="12" height="7" rx="1.6" fill="currentColor" opacity="0.75"/>' +
    '<rect x="12" y="6" width="3.5" height="12" rx="1.2" fill="currentColor"/>' +
    '<circle cx="20" cy="12" r="2.6" fill="currentColor" opacity="0.9"/>' +
    '<circle cx="20" cy="12" r="1.1" fill="#fff"/></svg>',
  // Kinetic: a fat barrel with a slug leaving it and a recoil arrow behind.
  kinetic: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="3" y="8" width="10" height="8" rx="1.8" fill="currentColor" opacity="0.8"/>' +
    '<rect x="11" y="9.5" width="5" height="5" rx="1" fill="currentColor"/>' +
    '<circle cx="19.5" cy="12" r="2.1" fill="currentColor" opacity="0.95"/>' +
    '<path d="M3 12H1M5 9.5 3.5 8M5 14.5 3.5 16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/>' +
    '<circle cx="19.5" cy="12" r="0.9" fill="#fff"/></svg>',
  // Plasma: a bolt inside a shockwave — the icon IS the pitch.
  plasma: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.45"/>' +
    '<circle cx="12" cy="12" r="4.5" fill="currentColor" opacity="0.3"/>' +
    '<path d="M13.5 4 8 13h4l-1.5 7 6-9.5h-4.2z" fill="currentColor"/>' +
    '<circle cx="12" cy="12" r="1.6" fill="#fff"/></svg>',
  capacitor: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M13 3 6 13h5l-1 8 7-10h-5l1-8z" fill="currentColor"/>' +
    '<path d="M4 20h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/></svg>',
  radiator: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 4v16M9.3 4v16M14.7 4v16M20 4v16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.75"/>' +
    '<path d="M3 20h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plating: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 3l7.5 3v6c0 4.2-3 7.3-7.5 9-4.5-1.7-7.5-4.8-7.5-9V6z" fill="currentColor" opacity="0.32"/>' +
    '<path d="M12 3l7.5 3v6c0 4.2-3 7.3-7.5 9-4.5-1.7-7.5-4.8-7.5-9V6z" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M12 8v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

export class InventoryUI {
  /**
   * @param {object} opts
   * @param {import('../core/Game.js').Game} opts.game
   * @param {import('./Inventory.js').Inventory} opts.inventory
   * @param {HTMLElement} [opts.root] container element
   */
  constructor(opts = {}) {
    this.game = opts.game;
    this.inventory = opts.inventory;
    this.events = opts.events ?? this.game?.events ?? null;
    this.root = opts.root ?? this._defaultRoot();

    this.open_ = false;
    /** @type {null | object} active drag state */
    this.drag = null;
    /** Press that has not become a drag yet. */
    this.pending = null;
    /** Public + test-seedable geometry (see _measure). */
    this.geometry = { grid: null, slots: {}, trash: null };
    this.cell = 58;

    this._toastTimer = null;
    this._offChanged = null;
    /** uid -> item element (avoids attribute-selector lookups on every drag). */
    this.nodes = new Map();

    this._build();
    this.layout();
    this.refresh();
  }

  _defaultRoot() {
    let root = document.getElementById('ui-layer');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ui-layer';
      (document.getElementById('app') ?? document.body).appendChild(root);
    }
    return root;
  }

  /* =============================================================== build == */

  _build() {
    const root = this.root;
    root.classList.add('inv');

    /* --- the always-visible open button ------------------------------------ */
    this.fab = el('button', 'inv-fab', root);
    this.fab.type = 'button';
    this.fab.setAttribute('aria-label', 'Open cargo hold');
    this.fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    this.fabBadge = el('span', 'inv-fab-badge', this.fab);
    this.fab.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggle();
    });

    /* --- scrim (tap to close) ---------------------------------------------- */
    this.scrim = el('div', 'inv-scrim', root);
    this.scrim.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.close();
    });

    /* --- the panel ---------------------------------------------------------- */
    this.panel = el('section', 'inv-panel', root);
    this.panel.setAttribute('aria-label', 'Cargo hold');

    /* header */
    const head = el('header', 'inv-head', this.panel);
    const titleBox = el('div', 'inv-title-box', head);
    el('div', 'inv-title', titleBox).textContent = 'CARGO HOLD';
    el('div', 'inv-subtitle', titleBox).textContent = 'merge · equip · jettison';

    this.readout = el('div', 'inv-readout', head);
    this.statMass = this._stat(this.readout, 'MASS', '/100');
    this.statLoad = this._stat(this.readout, 'LOAD', '/s');
    this.statRegen = this._stat(this.readout, 'RECHARGE', '/s');

    this.closeBtn = el('button', 'inv-close', head);
    this.closeBtn.type = 'button';
    this.closeBtn.setAttribute('aria-label', 'Close cargo hold');
    this.closeBtn.textContent = '✕';
    this.closeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.close();
    });

    /* hardpoint slots */
    this.slotsWrap = el('div', 'inv-mounts', this.panel);
    this.slotEls = {};
    const arcOf = (id) => CONFIG.combat.mounts.find((m) => m.id === id)?.arc ?? { center: 0, half: 90 };
    for (const id of this.inventory.mountIds) {
      const cfg = CONFIG.combat.mounts.find((m) => m.id === id);
      const slot = el('div', 'inv-slot', this.slotsWrap);
      slot.dataset.mount = id;
      const head2 = el('div', 'inv-slot-head', slot);
      el('span', 'inv-slot-name', head2).textContent = (cfg?.label ?? id[0].toUpperCase()) + ' · ' + id.toUpperCase();
      // e.g. "-90°…30°" for the side mounts, "90°…270°" for the rear
      // (measured clockwise from the nose, so the rear straddles ±180°).
      el('span', 'inv-slot-arc', head2).textContent = `${arcOf(id).center - arcOf(id).half}°…${arcOf(id).center + arcOf(id).half}°`;
      const drop = el('div', 'inv-slot-drop', slot);
      drop.dataset.mountDrop = id;
      el('div', 'inv-slot-empty', drop).textContent = 'EMPTY';
      this.slotEls[id] = { root: slot, drop };
    }

    /* grid */
    this.gridWrap = el('div', 'inv-grid-wrap', this.panel);
    this.gridEl = el('div', 'inv-grid', this.gridWrap);
    this.cellEls = [];
    for (let r = 0; r < this.inventory.rows; r++) {
      const row = [];
      for (let c = 0; c < this.inventory.cols; c++) {
        const cell = el('div', 'inv-cell', this.gridEl);
        cell.dataset.col = String(c);
        cell.dataset.row = String(r);
        row.push(cell);
      }
      this.cellEls.push(row);
    }

    /* footer: hint + rotate + jettison chute */
    const foot = el('footer', 'inv-foot', this.panel);
    this.hintEl = el('div', 'inv-hint', foot);
    this.hintEl.textContent = 'drag an item onto an identical one to merge';

    this.rotateBtn = el('button', 'inv-rotate', foot);
    this.rotateBtn.type = 'button';
    this.rotateBtn.textContent = 'ROTATE';
    this.rotateBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._rotateHeld();
    });

    this.trashEl = el('div', 'inv-trash', foot);
    this.trashEl.innerHTML = '<span>JETTISON</span>';

    /* --- floating layers ---------------------------------------------------- */
    this.ghost = el('div', 'inv-ghost', root);
    this.tip = el('div', 'inv-tip', root);
    this.toastEl = el('div', 'inv-toast', root);

    /* --- global listeners --------------------------------------------------- */
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);
    this._onCancel = () => this._cancelDrag();
    window.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp, { passive: false });
    window.addEventListener('pointercancel', this._onCancel, { passive: false });
    window.addEventListener('resize', () => {
      this.layout();
      if (this.open_) this._measure();
    });

    // Any model change re-renders the grid (never mid-drag: the element we are
    // dragging would be destroyed).
    this._offChanged = this.events?.on('inventory:changed', () => {
      if (!this.drag) this.refresh();
    }) ?? null;
  }

  _stat(parent, label, unit) {
    const box = el('div', 'inv-stat', parent);
    el('span', 'inv-stat-label', box).textContent = label;
    const value = el('span', 'inv-stat-value', box);
    const b = el('b', null, value);
    const u = el('i', null, value);
    u.textContent = unit;
    return { box, b, unit: u };
  }

  /* ============================================================== layout == */

  /**
   * Size the cells to the screen: as large as they can be while the whole
   * grid, the hardpoint row and the footer still fit in portrait.
   */
  layout() {
    const vw = window.innerWidth || 390;
    const vh = window.innerHeight || 844;
    // Everything that is not the grid: header, slots, footer, padding. Measured
    // from the real layout plus a margin so the sheet never touches the edges.
    const chrome = 320;
    const byHeight = Math.floor((vh - chrome) / this.inventory.rows);
    const byWidth = Math.floor((Math.min(vw, 460) - 28 - (this.inventory.cols - 1) * 6) / this.inventory.cols);
    this.cell = Math.max(38, Math.min(72, byHeight, byWidth));
    this.root.style.setProperty('--inv-cell', `${this.cell}px`);
    this.root.style.setProperty('--inv-cols', String(this.inventory.cols));
    this.root.style.setProperty('--inv-rows', String(this.inventory.rows));
  }

  /** Cache element rectangles so drop targets can be resolved with maths. */
  _measure() {
    const rect = (node) => {
      if (!node || !node.getBoundingClientRect) return null;
      const r = node.getBoundingClientRect();
      if (!r || (!r.width && !r.height && !r.left && !r.top)) return null;
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    this.geometry.grid = rect(this.gridEl);
    this.geometry.trash = rect(this.trashEl);
    for (const id of this.inventory.mountIds) {
      this.geometry.slots[id] = rect(this.slotEls[id]?.drop ?? null);
    }
    return this.geometry;
  }

  /* ============================================================== render == */

  /** Rebuild every item element + the numeric readouts. */
  refresh() {
    const inv = this.inventory;
    this.nodes.clear();

    // Wipe item elements (cells, slots contents) but keep the cell grid.
    for (const node of Array.from(this.gridEl.querySelectorAll('.inv-item'))) node.remove();
    for (const id of inv.mountIds) {
      const drop = this.slotEls[id]?.drop;
      if (!drop) continue;
      for (const node of Array.from(drop.querySelectorAll('.inv-item'))) node.remove();
      drop.classList.toggle('is-filled', !!inv.equipped[id]);
    }

    for (const item of inv.items) {
      const parent = item.mountId ? this.slotEls[item.mountId]?.drop : this.gridEl;
      if (!parent) continue;
      const node = this._itemEl(item, item.mountId ? 'slot' : 'grid');
      parent.appendChild(node);
      this._place(node, item);
      this.nodes.set(item.uid, node);
    }

    // Readouts
    const ship = this.game?.ship;
    const maxWeight = ship ? ship.stats.maxWeight : CONFIG.systems.maxWeight;
    const regen = ship ? (ship.stats.powerRegen ?? CONFIG.systems.powerRegen) : CONFIG.systems.powerRegen;
    this.statMass.b.textContent = f1(inv.totalWeight);
    this.statMass.unit.textContent = `/${maxWeight}`;
    this.statMass.box.classList.toggle('is-warn', inv.totalWeight > maxWeight * 0.75);
    this.statLoad.b.textContent = f1(inv.powerLoad);
    this.statRegen.b.textContent = f1(Math.max(0, regen - inv.powerLoad));
    this.statRegen.box.classList.toggle('is-warn', inv.powerLoad >= regen);

    const count = inv.items.length;
    this.fabBadge.textContent = String(count);
    this.fabBadge.classList.toggle('is-hidden', count === 0);
    this.root.classList.toggle('is-open', this.open_);
  }

  _itemEl(item, source) {
    const node = el('div', 'inv-item');
    node.dataset.uid = String(item.uid);
    node.dataset.def = item.defId;
    node.dataset.tier = String(item.tier);
    node.dataset.source = source;
    node.style.setProperty('--tint', item.color);
    node.style.setProperty('--tint-soft', tintVars(item.color, 0.34));
    node.style.setProperty('--tint-glow', tintVars(item.color, 0.55));
    if (item.tier > 1) node.classList.add(`is-t${Math.min(4, item.tier)}`);

    const art = el('div', 'inv-item-art', node);
    art.innerHTML = ICONS[item.def?.icon] ?? ICONS.capacitor;

    const meta = el('div', 'inv-item-meta', node);
    el('span', 'inv-item-name', meta).textContent = (item.def?.name ?? '?').toUpperCase();
    el('span', 'inv-item-tier', meta).textContent = `T${item.tier}`;

    node.addEventListener('pointerdown', (e) => this._pointerDown(e, item, source));
    return node;
  }

  _place(node, item) {
    node.style.setProperty('--col', String(Math.max(0, item.col)));
    node.style.setProperty('--row', String(Math.max(0, item.row)));
    node.style.setProperty('--w', String(item.w));
    node.style.setProperty('--h', String(item.h));
  }

  /* ================================================================ open == */

  get isOpen() {
    return this.open_;
  }

  open() {
    if (this.open_) return this;
    this.open_ = true;
    this.root.classList.add('is-open');
    // Sizing and hit rectangles depend on layout, which only exists now.
    this.layout();
    this.refresh();
    this._measure();
    this.game?.pauseForInventory?.(true);
    return this;
  }

  close() {
    if (!this.open_) return this;
    this._hideTip();
    this.open_ = false;
    this.root.classList.remove('is-open');
    this.game?.pauseForInventory?.(false);
    return this;
  }

  toggle() {
    return this.open_ ? this.close() : this.open();
  }

  /* ================================================================ drag == */

  _pointerDown(e, item, source) {
    if (e.button !== undefined && e.button !== 0) return; // left / finger only
    e.preventDefault();
    e.stopPropagation?.();
    this._hideTip();

    const rect = (e.currentTarget ?? e.target).getBoundingClientRect?.() ?? { left: 0, top: 0 };
    this.pending = {
      item,
      source,
      startX: e.clientX,
      startY: e.clientY,
      grabDX: (rect.width ? e.clientX - rect.left : 0),
      grabDY: (rect.height ? e.clientY - rect.top : 0),
      rotated: item.rotated,
      node: e.currentTarget,
    };
  }

  _pointerMove(e) {
    const p = this.pending;
    if (!p) return;
    if (!this.drag) {
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (dist < DRAG_THRESHOLD) return;
      this._beginDrag();
    }
    e.preventDefault?.();
    this._updateDrag(e.clientX, e.clientY);
  }

  _pointerUp(e) {
    const p = this.pending;
    if (!p) return;
    if (!this.drag) {
      // A tap (no movement): show the details card.
      this.pending = null;
      this._showTip(p.item, e.clientX, e.clientY);
      return;
    }
    this._updateDrag(e.clientX ?? p.startX, e.clientY ?? p.startY);
    this._applyDrop();
  }

  _cancelDrag() {
    if (!this.drag) {
      this.pending = null;
      return;
    }
    this._endDrag();
    this.refresh();
  }

  _beginDrag() {
    const p = this.pending;
    if (!p) return;
    const inv = this.inventory;
    if (!this.geometry.grid) this._measure();

    const dims = this._dragDims(p.item, p.rotated);
    this.drag = {
      item: p.item,
      source: p.source,
      rotated: p.rotated,
      w: dims.w,
      h: dims.h,
      grabDX: p.grabDX,
      grabDY: p.grabDY,
      target: null,
      node: p.node,
    };

    // Lift the ghost and mark every item it could merge with: on a phone the
    // hardest part of merging is finding the other half.
    p.node?.classList.add('is-dragging');
    this.root.classList.add('is-dragging');
    this.ghost.innerHTML = '';
    const ghostItem = this._itemEl(p.item, 'ghost');
    this._place(ghostItem, { col: 0, row: 0, w: dims.w, h: dims.h });
    this.ghost.appendChild(ghostItem);
    this.ghost.style.setProperty('--w', String(dims.w));
    this.ghost.style.setProperty('--h', String(dims.h));
    this.ghost.classList.add('is-visible');
    this.ghostBadge = el('div', 'inv-ghost-badge', this.ghost);
    this.rotateBtn.classList.toggle('is-visible', p.item.rotatable);
    this.hintEl.textContent = 'gold = merge · green = fits · red = blocked';

    for (const other of inv.items) {
      if (p.item.canMergeWith(other)) {
        const node = this._nodeFor(other);
        node?.classList.add('can-merge');
      }
    }
  }

  _dragDims(item, rotated) {
    const s = item.def?.size ?? { w: 1, h: 1 };
    const w = rotated ? s.h : s.w;
    const h = rotated ? s.w : s.h;
    return { w, h };
  }

  _updateDrag(x, y) {
    const d = this.drag;
    if (!d) return;
    d.x = x;
    d.y = y;
    this.ghost.style.transform = `translate3d(${x - d.grabDX}px, ${y - d.grabDY - LIFT_PX}px, 0) scale(1.06)`;
    const target = this._hitTest(x, y - LIFT_PX);
    d.target = target;
    this._preview(target, d);
  }

  /** @returns {{kind:'grid'|'slot'|'trash'|'none', col?:number, row?:number, mountId?:string}} */
  _hitTest(x, y) {
    const g = this.geometry.grid;
    if (g) {
      const step = this.cell + 6; // --inv-gap
      const col = Math.floor((x - g.left) / step);
      const row = Math.floor((y - g.top) / step);
      if (col >= 0 && col < this.inventory.cols && row >= 0 && row < this.inventory.rows) {
        return { kind: 'grid', col, row };
      }
    }
    for (const id of this.inventory.mountIds) {
      const r = this.geometry.slots[id];
      if (r && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height) {
        return { kind: 'slot', mountId: id };
      }
    }
    const t = this.geometry.trash;
    if (t && x >= t.left && x <= t.left + t.width && y >= t.top && y <= t.top + t.height) {
      return { kind: 'trash' };
    }
    return { kind: 'none' };
  }

  /** Colour the landing zone. This is the whole "is this legal?" answer. */
  _preview(target, d) {
    this._clearPreview();
    const inv = this.inventory;
    const item = d.item;

    if (target.kind === 'grid') {
      // Grab-relative so the item keeps the cell you picked it up by.
      const step = this.cell + 6;
      const g = this.geometry.grid;
      const col = Math.round((d.x - d.grabDX - g.left) / step);
      const row = Math.round((d.y - d.grabDY - LIFT_PX - g.top) / step);
      const c = Math.max(0, Math.min(inv.cols - d.w, col));
      const r = Math.max(0, Math.min(inv.rows - d.h, row));
      d.cell = { col: c, row: r };

      const occupant = inv.itemAt(c, r);
      if (occupant && occupant !== item && item.canMergeWith(occupant)) {
        d.willMerge = occupant;
        this._nodeFor(occupant)?.classList.add('is-merge-target');
        this.ghostBadge.textContent = `MERGE → T${occupant.tier + 1}`;
        this.ghostBadge.className = 'inv-ghost-badge is-merge';
        return;
      }
      d.willMerge = null;

      const fits = this._fits(item, c, r, d.w, d.h);
      this._highlightCells(c, r, d.w, d.h, fits ? 'is-valid' : 'is-invalid');
      if (fits) {
        this.ghostBadge.textContent = item.isWeapon ? 'EQUIP? drag to a slot' : '';
        this.ghostBadge.className = 'inv-ghost-badge is-ok';
      } else {
        this.ghostBadge.textContent = 'BLOCKED';
        this.ghostBadge.className = 'inv-ghost-badge is-bad';
      }
      return;
    }

    if (target.kind === 'slot') {
      const slotEl = this.slotEls[target.mountId];
      const occupant = inv.equipped[target.mountId];
      if (occupant && occupant !== item && item.canMergeWith(occupant)) {
        d.willMerge = occupant;
        slotEl?.root.classList.add('is-merge');
        this.ghostBadge.textContent = `MERGE → T${occupant.tier + 1}`;
        this.ghostBadge.className = 'inv-ghost-badge is-merge';
      } else if (item.isWeapon) {
        slotEl?.root.classList.add('is-valid');
        this.ghostBadge.textContent = occupant ? 'SWAP' : 'EQUIP';
        this.ghostBadge.className = 'inv-ghost-badge is-ok';
      } else {
        slotEl?.root.classList.add('is-invalid');
        this.ghostBadge.textContent = 'WEAPONS ONLY';
        this.ghostBadge.className = 'inv-ghost-badge is-bad';
      }
      return;
    }

    if (target.kind === 'trash') {
      this.trashEl.classList.add('is-hot');
      this.ghostBadge.textContent = 'JETTISON';
      this.ghostBadge.className = 'inv-ghost-badge is-bad';
      return;
    }

    this.ghostBadge.textContent = '';
    this.ghostBadge.className = 'inv-ghost-badge';
  }

  /** Would the (possibly rotated) item fit here, ignoring its own cells? */
  _fits(item, col, row, w, h) {
    const inv = this.inventory;
    if (!inv.inBounds(col, row, w, h)) return false;
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        const occupant = inv.cells[inv.index(c, r)];
        if (occupant && occupant !== item) return false;
      }
    }
    return true;
  }

  _highlightCells(col, row, w, h, cls) {
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        this.cellEls[r]?.[c]?.classList.add(cls);
      }
    }
  }

  _clearPreview() {
    for (let r = 0; r < this.cellEls.length; r++) {
      const row = this.cellEls[r];
      for (let c = 0; c < row.length; c++) {
        row[c].classList.remove('is-valid', 'is-invalid');
      }
    }
    for (const id of this.inventory.mountIds) {
      this.slotEls[id]?.root.classList.remove('is-valid', 'is-invalid', 'is-merge');
    }
    this.trashEl.classList.remove('is-hot');
    for (const node of Array.from(this.gridEl.querySelectorAll('.is-merge-target'))) {
      node.classList.remove('is-merge-target');
    }
    for (const id of this.inventory.mountIds) {
      for (const node of Array.from(this.slotEls[id].drop.querySelectorAll('.is-merge-target'))) {
        node.classList.remove('is-merge-target');
      }
    }
  }

  _nodeFor(item) {
    return this.nodes.get(item.uid) ?? null;
  }

  /* --------------------------------------------------------------- the drop -- */

  _applyDrop() {
    const d = this.drag;
    if (!d) return;
    const target = d.target ?? { kind: 'none' };
    const inv = this.inventory;
    const item = d.item;
    let message = null;

    if (target.kind === 'trash') {
      inv.remove(item);
      message = `jettisoned ${item.name}`;
    } else if (target.kind === 'grid' && d.willMerge) {
      const merged = inv.merge(item, d.willMerge);
      message = merged ? `merged → ${merged.name}` : null;
    } else if (target.kind === 'slot' && d.willMerge) {
      const merged = inv.merge(item, d.willMerge);
      message = merged ? `merged → ${merged.name}` : null;
    } else if (target.kind === 'grid' && d.cell && this._fits(item, d.cell.col, d.cell.row, d.w, d.h)) {
      if (d.rotated !== item.rotated) item.rotated = d.rotated;
      if (item.mountId) {
        inv.unequip(item.mountId) && inv.move(item, d.cell.col, d.cell.row);
      } else {
        inv.move(item, d.cell.col, d.cell.row);
      }
    } else if (target.kind === 'slot' && item.isWeapon) {
      if (d.rotated !== item.rotated) item.rotated = d.rotated;
      const ok = inv.equip(item, target.mountId);
      message = ok ? `${item.name} → ${target.mountId}` : 'no room in the hold';
    } else if (d.node) {
      // Illegal / outside: snap back with a nudge so it reads as "refused".
      d.node.classList.add('is-refused');
      const node = d.node;
      setTimeout(() => node.classList.remove('is-refused'), 260);
    }

    this._endDrag();
    this.refresh();
    if (message) this.toast(message, target.kind === 'trash' ? 'bad' : 'good');
  }

  _endDrag() {
    this.drag = null;
    this.pending = null;
    this.ghost.classList.remove('is-visible');
    this.ghost.innerHTML = '';
    this.root.classList.remove('is-dragging');
    this.rotateBtn.classList.remove('is-visible');
    this.hintEl.textContent = 'drag an item onto an identical one to merge';
    for (const node of Array.from(this.gridEl.querySelectorAll('.is-dragging'))) {
      node.classList.remove('is-dragging');
    }
    for (const node of Array.from(this.gridEl.querySelectorAll('.can-merge'))) {
      node.classList.remove('can-merge');
    }
    this._clearPreview();
  }

  _rotateHeld() {
    const d = this.drag;
    if (!d) return;
    const item = d.item;
    if (!item.rotatable) return;
    d.rotated = !d.rotated;
    const dims = this._dragDims(item, d.rotated);
    d.w = dims.w;
    d.h = dims.h;
    const ghostItem = this._itemEl(item, 'ghost');
    this._place(ghostItem, { col: 0, row: 0, w: dims.w, h: dims.h });
    this.ghost.innerHTML = '';
    this.ghost.appendChild(ghostItem);
    this.ghost.style.setProperty('--w', String(dims.w));
    this.ghost.style.setProperty('--h', String(dims.h));
    this.ghostBadge = el('div', 'inv-ghost-badge', this.ghost);
    this._updateDrag(d.x ?? 0, d.y ?? 0);
  }

  /* ================================================================ tooltip == */

  _showTip(item, x = 0, y = 0) {
    this.tip.innerHTML = '';
    const head = el('div', 'inv-tip-head', this.tip);
    el('span', 'inv-tip-name', head).textContent = item.name.toUpperCase();
    el('span', 'inv-tip-kind', head).textContent = item.isWeapon ? (item.mountId ? `ON ${item.mountId.toUpperCase()}` : 'WEAPON') : 'MODULE';
    el('div', 'inv-tip-desc', this.tip).textContent = item.def?.desc ?? '';

    const stats = el('div', 'inv-tip-stats', this.tip);
    for (const [label, value] of item.describe()) {
      const row = el('div', 'inv-tip-row', stats);
      el('span', null, row).textContent = label;
      el('b', null, row).textContent = value;
    }

    const actions = el('div', 'inv-tip-actions', this.tip);
    if (item.isWeapon) {
      if (item.mountId) {
        this._tipButton(actions, 'UNEQUIP', () => {
          if (this.inventory.unequip(item.mountId)) this.toast(`${item.name} stowed`, 'good');
          else this.toast('no room in the hold', 'bad');
          this._hideTip();
        });
      } else {
        const mountId = this.inventory.firstFreeMount(item);
        this._tipButton(actions, mountId ? `EQUIP → ${mountId.toUpperCase()}` : 'MOUNTS FULL', () => {
          if (mountId && this.inventory.equip(item, mountId)) this.toast(`${item.name} → ${mountId}`, 'good');
          this._hideTip();
        }, !mountId);
      }
    }
    if (!item.mountId && item.rotatable) {
      this._tipButton(actions, 'ROTATE', () => {
        this.inventory.rotate(item);
        this._hideTip();
      });
    }
    this._tipButton(actions, 'JETTISON', () => {
      this.inventory.remove(item);
      this.toast(`jettisoned ${item.name}`, 'bad');
      this._hideTip();
    }, false, 'is-danger');

    this.tip.classList.add('is-visible');
    // Keep the card on screen.
    const vw = window.innerWidth || 390;
    const vh = window.innerHeight || 844;
    const w = Math.min(240, vw - 24);
    const left = Math.max(12, Math.min(x - w / 2, vw - w - 12));
    const top = Math.max(70, Math.min(y + 18, vh - 260));
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${top}px`;
    this.tip.style.width = `${w}px`;
    this.tipItem = item;
  }

  _tipButton(parent, label, onClick, disabled = false, extra = '') {
    const btn = el('button', `inv-tip-btn ${extra}`.trim(), parent);
    btn.type = 'button';
    btn.textContent = label;
    btn.disabled = !!disabled;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation?.();
      if (!btn.disabled) onClick();
    });
    return btn;
  }

  _hideTip() {
    this.tip.classList.remove('is-visible');
    this.tip.innerHTML = '';
    this.tipItem = null;
  }

  /* ================================================================== misc == */

  /** Transient message: merges, equips, "hold full". */
  toast(text, kind = 'good') {
    this.toastEl.textContent = text;
    this.toastEl.className = `inv-toast is-visible is-${kind}`;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.className = 'inv-toast';
    }, 1700);
    return this;
  }

  destroy() {
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onCancel);
    if (this._offChanged) this._offChanged();
    this.root.innerHTML = '';
  }
}

export default InventoryUI;
