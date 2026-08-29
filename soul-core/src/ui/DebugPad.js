/**
 * DebugPad.js
 * ----------------------------------------------------------------------------
 * A DOM strip of debug actions — the mobile answer to the debug keys.
 *
 * Why DOM and not canvas? For the same reason as the cargo hold: these are
 * *buttons*, and the browser already gives buttons hit-testing, :active
 * feedback and accessibility. They also sit above the canvas, so a tap on one
 * never reaches the virtual joystick (the stick's grab zone covers the lower
 * two thirds of the screen, which is exactly where thumbs live).
 *
 * The pad is a thin shell over `Game._onKey`: every button fires the same code
 * path as its keyboard twin, so there is one implementation of each action and
 * no way for the two to drift apart.
 *
 *   RAIDER -> Digit6   SCRAP -> Digit7   GUNS  -> Digit8
 *   HEAT   -> Digit1   CORR  -> Digit3   FIX   -> Digit0
 *
 * Visible only while `game.debug` is on (`?debug=1`, or ` / F3` on desktop),
 * and collapsible to a small pill so it can get out of the way mid-run.
 */
export class DebugPad {
  /**
   * @param {object} opts
   * @param {import('../core/Game.js').Game} opts.game
   * @param {HTMLElement} [opts.root] container element (#ui-layer by default)
   */
  constructor(opts = {}) {
    this.game = opts.game;
    this.root = opts.root ?? DebugPad._defaultRoot();

    /** Buttons in display order. `key` is the KeyboardEvent.code twin. */
    this.actions = [
      { key: 'Digit8', label: 'GUNS', title: 'One T2 crate of every gun' },
      { key: 'Digit6', label: 'RAIDER', title: 'Spawn a raider off the nose' },
      { key: 'Digit7', label: 'SCRAP', title: 'Drop 10 scrap next to the ship' },
      { key: 'Digit1', label: 'HEAT', title: '+25% heat' },
      { key: 'Digit3', label: 'CORR', title: '+10% corrosion' },
      { key: 'Digit0', label: 'FIX', title: 'Full service' },
    ];

    this.visible = false;
    this.collapsed = false;
    /** @type {Map<string, any>} key -> button element */
    this.buttons = new Map();

    this._build();
    this.setVisible(this.game?.debug ?? false);
  }

  static _defaultRoot() {
    let root = document.getElementById('ui-layer');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ui-layer';
      (document.getElementById('app') ?? document.body).appendChild(root);
    }
    return root;
  }

  /* ----------------------------------------------------------------- build -- */

  _build() {
    const el = (tag, className, parent = null) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (parent) parent.appendChild(node);
      return node;
    };

    this.el = el('div', 'dbg-pad', this.root);

    // Collapsed state: a pill that brings the column back.
    this.pill = el('button', 'dbg-pill', this.el);
    this.pill.type = 'button';
    this.pill.textContent = 'DBG';
    this.pill.setAttribute('aria-label', 'Show debug actions');
    this._onTap(this.pill, () => this.setCollapsed(false));

    this.col = el('div', 'dbg-col', this.el);

    this.collapseBtn = el('button', 'dbg-collapse', this.col);
    this.collapseBtn.type = 'button';
    this.collapseBtn.textContent = '×';
    this.collapseBtn.setAttribute('aria-label', 'Hide debug actions');
    this._onTap(this.collapseBtn, () => this.setCollapsed(true));

    for (const action of this.actions) {
      const btn = el('button', 'dbg-btn', this.col);
      btn.type = 'button';
      btn.textContent = action.label;
      btn.title = action.title;
      btn.setAttribute('aria-label', action.title);
      this._onTap(btn, () => this.press(action.key));
      this.buttons.set(action.key, btn);
    }

    this.setCollapsed(false);
  }

  /**
   * pointerdown (not click): on iOS a `click` waits ~300ms for a possible
   * double-tap, which feels broken on a control you tap repeatedly.
   */
  _onTap(node, fn) {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }

  /* ------------------------------------------------------------------ state -- */

  /** Show/hide the whole pad (tied to `game.debug`). */
  setVisible(on) {
    this.visible = !!on;
    this.el.style.display = this.visible ? '' : 'none';
    return this.visible;
  }

  /** Collapse to the DBG pill / expand back to the column. */
  setCollapsed(on) {
    this.collapsed = !!on;
    this.el.classList.toggle('is-collapsed', this.collapsed);
    return this.collapsed;
  }

  /* ----------------------------------------------------------------- actions -- */

  /**
   * Fire a debug action by key. This is the *only* path the buttons use, so a
   * test (or the console) can drive the pad without synthesising DOM events.
   *
   * @param {string} key KeyboardEvent.code twin, e.g. 'Digit8'
   */
  press(key) {
    if (!this.game) return false;
    // Debug digits are gated on `game.debug` inside _onDebugKey; the pad is
    // only visible when that is already true, so nothing needs forcing here.
    this.game._onKey(key);
    return true;
  }

  destroy() {
    this.el?.remove?.();
    this.buttons.clear();
  }
}
