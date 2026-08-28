/**
 * Entity.js
 * ----------------------------------------------------------------------------
 * Base class for everything that lives in the world.
 *
 * Two rules make the rest of the engine simple:
 *  1. Every entity stores its PREVIOUS transform (prevX/prevY/prevAngle) at
 *     the top of update(). The renderer lerps between previous and current
 *     using the loop's interpolation alpha, so a 120Hz simulation renders
 *     smoothly on 60Hz/90Hz/144Hz displays.
 *  2. Entities receive a `context` object in update() instead of reaching for
 *     globals: { input, world, particles, camera, events, time, dt }.
 *     That keeps them unit-testable and lets us run "what if" simulations.
 */
export class Entity {
  /**
   * @param {object} [opts]
   * @param {number} [opts.x]
   * @param {number} [opts.y]
   * @param {number} [opts.angle] radians
   * @param {number} [opts.radius] collision radius in world units
   * @param {string} [opts.type]
   */
  constructor(opts = {}) {
    this.type = opts.type ?? 'entity';
    this.id = Entity._nextId++;

    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.angle = opts.angle ?? 0;
    this.radius = opts.radius ?? 10;

    // Linear + angular velocity (world units / second, radians / second).
    this.vx = 0;
    this.vy = 0;
    this.angularVelocity = 0;

    // Previous transform — for render interpolation (see Loop.js).
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevAngle = this.angle;

    this.alive = true;
    this.visible = true;
    this.age = 0;
  }

  /** Snapshot the transform. Call FIRST inside every subclass update(). */
  savePrevious() {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevAngle = this.angle;
  }

  /** Interpolated x for rendering at loop alpha (0..1). */
  getRenderX(alpha) {
    return this.prevX + (this.x - this.prevX) * alpha;
  }

  getRenderY(alpha) {
    return this.prevY + (this.y - this.prevY) * alpha;
  }

  /** Interpolated angle, taking the shortest arc (never spins backwards). */
  getRenderAngle(alpha) {
    let d = this.angle - this.prevAngle;
    // wrap into (-PI, PI]
    d -= Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2));
    return this.prevAngle + d * alpha;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Push the entity (weapons recoil, shockwaves, tractor beams...). */
  applyImpulse(ix, iy) {
    this.vx += ix;
    this.vy += iy;
  }

  /** Teleport without breaking interpolation (respawn, wrap, teleport pads). */
  teleport(x, y, angle = this.angle) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.angle = this.prevAngle = angle;
  }

  /**
   * @param {number} dt fixed simulation step (seconds)
   * @param {object} ctx shared update context
   */
  update(dt, ctx) {
    this.savePrevious();
    this.age += dt;
  }

  /**
   * Draw in WORLD space (camera transform already applied).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha interpolation factor
   */
  render(ctx, alpha) {
    // Placeholder: a plain circle, so a forgotten override is still visible.
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.arc(this.getRenderX(alpha), this.getRenderY(alpha), this.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  destroy() {
    this.alive = false;
  }
}

Entity._nextId = 1;

export default Entity;
