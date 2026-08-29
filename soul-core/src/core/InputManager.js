/**
 * InputManager.js
 * ----------------------------------------------------------------------------
 * The single place that knows about fingers, mice and keyboards.
 *
 * Everything downstream reads `input.axis` (an {x, y} vector with magnitude
 * 0..1). That indirection is what makes the rest of the game testable and
 * portable: swapping the virtual stick for a gamepad, replaying a recorded
 * run, or driving the ship from AI is a one-line change here.
 *
 * Touch details that matter on mobile:
 *  - Pointer Events unify mouse/touch/pen, and give us stable pointerIds for
 *    multi-touch (essential once a fire button shares the screen).
 *  - `touch-action: none` (CSS) + preventDefault on touch* stop the browser
 *    from scrolling/zooming mid-drag.
 *  - `gesturestart`/`contextmenu`/`dblclick` are killed so iOS Safari can't
 *    interrupt a run.
 *
 * Events emitted on the bus:
 *   'input:down'  {x, y, pointerId}  — canvas-space press (menus/taps)
 *   'input:up'    {x, y, pointerId}
 *   'input:tap'   {x, y}             — short press with almost no movement
 *   'input:key'   {code, down}       — raw key state changes
 */
import { VirtualJoystick } from '../ui/VirtualJoystick.js';
import { clamp, length } from './MathUtils.js';

export class InputManager {
  /**
   * @param {import('./Viewport.js').Viewport} viewport
   * @param {import('./EventBus.js').EventBus} events
   * @param {object} [opts]
   */
  constructor(viewport, events, opts = {}) {
    this.viewport = viewport;
    this.events = events;

    /** The stick owns touch movement; keyboard is merged on top. */
    this.joystick = opts.joystick ?? new VirtualJoystick(viewport);

    /** Master switch (false on the title screen / while paused). */
    this.enabled = true;

    /** Combined, normalised movement axis. Reused object — do not retain. */
    this.axis = { x: 0, y: 0 };
    this.magnitude = 0;

    /** @type {Set<string>} currently held KeyboardEvent.code values */
    this.keys = new Set();
    this._keyVector = { x: 0, y: 0 };

    /** Active pointers (id -> {x, y, startX, startY, startTime}). */
    this.pointers = new Map();

    this._tapMaxDuration = 0.25; // seconds
    this._tapMaxDistance = 14; // CSS px

    this._bound = false;
    this._p = { x: 0, y: 0 }; // scratch

    // Bind once so we can add/remove listeners cleanly.
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._prevent = (e) => e.preventDefault();
  }

  /* ------------------------------------------------------------- lifecycle -- */

  attach() {
    if (this._bound) return this;
    const canvas = this.viewport.canvas;

    canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    // move/up live on window so dragging off-canvas still tracks.
    window.addEventListener('pointermove', this._onPointerMove, { passive: false });
    window.addEventListener('pointerup', this._onPointerUp, { passive: false });
    window.addEventListener('pointercancel', this._onPointerUp, { passive: false });

    // iOS Safari extras that would otherwise steal the gesture.
    canvas.addEventListener('touchstart', this._prevent, { passive: false });
    canvas.addEventListener('touchmove', this._prevent, { passive: false });
    canvas.addEventListener('touchend', this._prevent, { passive: false });
    canvas.addEventListener('contextmenu', this._prevent, { passive: false });
    canvas.addEventListener('dblclick', this._prevent, { passive: false });
    canvas.addEventListener('gesturestart', this._prevent, { passive: false });

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    this._bound = true;
    return this;
  }

  detach() {
    if (!this._bound) return this;
    const canvas = this.viewport.canvas;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    canvas.removeEventListener('touchstart', this._prevent);
    canvas.removeEventListener('touchmove', this._prevent);
    canvas.removeEventListener('touchend', this._prevent);
    canvas.removeEventListener('contextmenu', this._prevent);
    canvas.removeEventListener('dblclick', this._prevent);
    canvas.removeEventListener('gesturestart', this._prevent);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._bound = false;
    return this;
  }

  /** Called by the Game on resize ( joystick geometry depends on layout ). */
  onResize() {
    this.joystick.layout();
  }

  /* ---------------------------------------------------------------- pointer -- */

  _onPointerDown(e) {
    if (e.target !== this.viewport.canvas && e.pointerType === 'mouse') return;
    e.preventDefault();

    const p = this.viewport.toCanvasPoint(e.clientX, e.clientY, this._p);
    const x = p.x;
    const y = p.y;

    this.pointers.set(e.pointerId, {
      x,
      y,
      startX: x,
      startY: y,
      startTime: performance.now() / 1000,
    });

    this.events.emit('input:down', { x, y, pointerId: e.pointerId });

    if (this.enabled) {
      this.joystick.begin(e.pointerId, x, y);
    }
  }

  _onPointerMove(e) {
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();

    const p = this.viewport.toCanvasPoint(e.clientX, e.clientY, this._p);
    rec.x = p.x;
    rec.y = p.y;

    this.joystick.move(e.pointerId, p.x, p.y);
  }

  _onPointerUp(e) {
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();
    this.pointers.delete(e.pointerId);
    this.joystick.end(e.pointerId);

    const p = this.viewport.toCanvasPoint(e.clientX, e.clientY, this._p);
    const dt = performance.now() / 1000 - rec.startTime;
    const dist = length(p.x - rec.startX, p.y - rec.startY);
    if (dt <= this._tapMaxDuration && dist <= this._tapMaxDistance) {
      this.events.emit('input:tap', { x: p.x, y: p.y, pointerId: e.pointerId });
    }
    this.events.emit('input:up', { x: p.x, y: p.y, pointerId: e.pointerId });
  }

  /* --------------------------------------------------------------- keyboard -- */

  _onKeyDown(e) {
    // Let the browser keep its own shortcuts (cmd+R, devtools...).
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    this.keys.add(e.code);
    this.events.emit('input:key', { code: e.code, down: true, event: e });
    // Arrow keys / space would scroll the page on desktop.
    if (SCROLL_KEYS.has(e.code)) e.preventDefault();
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
    this.events.emit('input:key', { code: e.code, down: false, event: e });
  }

  /** Focus loss: drop every held key so the ship doesn't fly off forever. */
  _onBlur() {
    this.keys.clear();
    this.pointers.clear();
    this.joystick.end(this.joystick.pointerId);
  }

  isKeyDown(code) {
    return this.keys.has(code);
  }

  /* ------------------------------------------------------------------ tick -- */

  /**
   * Recompute the combined axis. Call once per fixed step (before entities).
   * @param {number} dt
   */
  update(dt) {
    this.joystick.update(dt);

    let x = 0;
    let y = 0;
    if (this.enabled) {
      x = this.joystick.vectorX;
      y = this.joystick.vectorY;

      // Keyboard (desktop testing) is merged on top and wins if the stick is
      // idle, so you can drive with WASD without touching the screen.
      const kv = this._readKeyboard();
      if (kv.x !== 0 || kv.y !== 0) {
        x = kv.x;
        y = kv.y;
      }
    }

    // Defensive clamp: downstream physics assumes |axis| <= 1.
    const mag = length(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }

    this.axis.x = x;
    this.axis.y = y;
    this.magnitude = clamp(mag, 0, 1);
    return this.axis;
  }

  _readKeyboard() {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;

    // Normalise diagonals so they aren't 1.41x faster.
    const mag = length(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    const v = this._keyVector;
    v.x = x;
    v.y = y;
    return v;
  }

  /** True if the player has produced any movement input at all. */
  get isMoving() {
    return this.magnitude > 0.01;
  }
}

const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);

export default InputManager;
