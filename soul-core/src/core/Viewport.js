/**
 * Viewport.js
 * ----------------------------------------------------------------------------
 * Owns the canvas element and the mapping between:
 *   device pixels (canvas.width / canvas.height — the backing store)
 *   CSS pixels   (everything in this codebase draws in CSS px)
 *   world units  (see Camera)
 *
 * Responsibilities
 *  - resize the backing store to the CSS box × devicePixelRatio (capped, so a
 *    3x phone doesn't try to shade 8 million pixels per frame)
 *  - survive iOS/Android quirks: URL-bar resize, orientation change, the
 *    visualViewport scaling when the on-screen keyboard or a gesture fires
 *  - expose safe-area insets (notch / home indicator) to the UI layer
 *
 * Everything the game draws uses CSS-pixel coordinates; the DPR is applied
 * once, as the base transform at the top of every frame.
 */
import { CONFIG } from '../config.js';

export class Viewport {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;

    // `alpha: false` lets the compositor skip blending the canvas; we always
    // paint a full-screen background anyway. `desynchronized` reduces input
    // latency where supported and is ignored where it isn't.
    this.ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });

    this.maxDpr = opts.maxDpr ?? CONFIG.viewport.maxDpr;
    this.maxPixels = opts.maxPixels ?? CONFIG.viewport.maxPixels;

    // CSS-pixel logical size (this is the coordinate space the game uses).
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.portrait = true;

    // Cached bounding rect — avoids a layout-thrashing getBoundingClientRect()
    // on every pointer event (we get a lot of those: 120Hz touch sampling).
    this.rect = { left: 0, top: 0, width: 1, height: 1 };

    this.safeArea = { top: 0, right: 0, bottom: 0, left: 0 };

    /** @type {((v:Viewport)=>void)[]} */
    this._resizeHandlers = [];
  }

  /** Register a callback fired after every successful resize. */
  onResize(handler) {
    this._resizeHandlers.push(handler);
  }

  /**
   * Re-measure and (if needed) resize the canvas backing store.
   * Cheap to call often — it early-outs when nothing changed.
   */
  resize() {
    const cssW = Math.max(1, Math.round(this.canvas.clientWidth || window.innerWidth));
    const cssH = Math.max(1, Math.round(this.canvas.clientHeight || window.innerHeight));

    // Pick a device-pixel-ratio: never above maxDpr, and never so high that
    // the backing store blows past our pixel budget (fill-rate is the #1
    // performance killer on mobile GPUs).
    let dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const pixels = cssW * cssH * dpr * dpr;
    if (pixels > this.maxPixels) {
      dpr = Math.max(1, dpr * Math.sqrt(this.maxPixels / pixels));
    }

    this.width = cssW;
    this.height = cssH;
    this.dpr = dpr;
    this.portrait = cssH >= cssW;
    this.rect = this.canvas.getBoundingClientRect();
    this.safeArea = Viewport.readSafeArea();

    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }

    for (const h of this._resizeHandlers) h(this);
    return this;
  }

  /** Read `--safe-*` custom properties published by style.css. */
  static readSafeArea() {
    const read = (name, fallback = 0) => {
      if (typeof getComputedStyle !== 'function') return fallback;
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
      const v = parseFloat(raw);
      return Number.isFinite(v) ? v : fallback;
    };
    return {
      top: read('--safe-top'),
      right: read('--safe-right'),
      bottom: read('--safe-bottom'),
      left: read('--safe-left'),
    };
  }

  get centerX() {
    return this.width * 0.5;
  }

  get centerY() {
    return this.height * 0.5;
  }

  get aspect() {
    return this.width / this.height;
  }

  /**
   * Begin a frame: reset the transform to "1 unit == 1 CSS px" and return the
   * 2D context. Every layer (background, world, HUD) starts from here.
   */
  beginFrame() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    return ctx;
  }

  /** Drop any camera transform — back to screen space for HUD drawing. */
  resetTransform() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Fill the whole canvas (used as the per-frame background clear). */
  clear(color = CONFIG.palette.background) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Convert a pointer event position (clientX/clientY) into canvas CSS px.
   * Writes into `out` to avoid per-event allocations.
   */
  toCanvasPoint(clientX, clientY, out = { x: 0, y: 0 }) {
    out.x = clientX - this.rect.left;
    out.y = clientY - this.rect.top;
    return out;
  }
}

export default Viewport;
