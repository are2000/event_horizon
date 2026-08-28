/**
 * MathUtils.js
 * ----------------------------------------------------------------------------
 * Small, allocation-free math helpers shared by every system.
 * Everything here is pure and side-effect free.
 */

export const TAU = Math.PI * 2;
export const PI = Math.PI;
export const DEG = Math.PI / 180;

/** Clamp v into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Inverse lerp: where is v between a and b? (clamped to 0..1) */
export function invLerp(a, b, v) {
  if (a === b) return 0;
  return clamp((v - a) / (b - a), 0, 1);
}

/**
 * Frame-rate independent exponential smoothing.
 *
 * The naive `a += (b - a) * 0.1` is wrong: it moves twice as fast at 120fps
 * as it does at 60fps. This version is exact for any dt, which matters a lot
 * for a physics game running a fixed 120Hz step behind a variable render rate.
 *
 * @param {number} a current value
 * @param {number} b target value
 * @param {number} lambda rate (1/s) — higher = snappier
 * @param {number} dt delta time in seconds
 */
export function damp(a, b, lambda, dt) {
  return b + (a - b) * Math.exp(-lambda * dt);
}

/** Positive modulo (JS `%` keeps the sign of the dividend). */
export function mod(a, n) {
  return ((a % n) + n) % n;
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  return a - TAU * Math.floor((a + PI) / TAU);
}

/** Shortest signed rotation from `from` to `to`. */
export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

/** Exponential smoothing for angles (shortest path, no spin-out). */
export function dampAngle(a, b, lambda, dt) {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

/** Rotate an angle toward a target at a fixed angular speed (rad/s). */
export function rotateToward(a, b, maxDelta) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

/** Move `current` toward `target` by at most `maxDelta`. */
export function approach(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export function length(x, y) {
  return Math.sqrt(x * x + y * y);
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function distanceSq(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Smooth Hermite interpolation between 0 and 1. */
export function smoothstep(edge0, edge1, x) {
  const t = invLerp(edge0, edge1, x);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ random -- */

/**
 * mulberry32 — tiny deterministic PRNG.
 * Deterministic worlds matter for a roguelite: same seed => same layout,
 * which makes bug reports reproducible and "seeded runs" possible.
 */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

/* ------------------------------------------------------------------ canvas -- */

/**
 * Rounded rectangle path (ctx.roundRect is not everywhere yet).
 * Must be followed by ctx.fill() / ctx.stroke().
 */
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** CSS-ish font shorthand builder used by the HUD. */
export function font(size, weight = 600, family = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace') {
  return `${weight} ${size}px ${family}`;
}
