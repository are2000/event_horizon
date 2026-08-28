/**
 * World.js
 * ----------------------------------------------------------------------------
 * The playable sector: bounds, decorative background, static obstacles and a
 * uniform spatial hash for broad-phase collision queries.
 *
 * Everything is generated from a SEED (mulberry32), so the same seed always
 * produces the same sector — required later for seeded roguelite runs and for
 * reproducing bug reports.
 *
 * Rendering is split into three passes so the Game can control draw order:
 *   renderBackground(ctx, camera, viewport, alpha) — SCREEN space (parallax stars)
 *   renderGround(ctx, camera, viewport)            — WORLD space (grid, bounds)
 *   renderObstacles(ctx, camera)                   — WORLD space (asteroids)
 */
import { CONFIG } from '../config.js';
import { clamp, createRng, mod, randRange, TAU } from '../core/MathUtils.js';

const CELL_SIZE = 400; // spatial hash cell, in world units

export class World {
  /**
   * @param {object} [opts]
   * @param {number} [opts.seed]
   * @param {number} [opts.width]
   * @param {number} [opts.height]
   * @param {number} [opts.obstacleCount]
   */
  constructor(opts = {}) {
    this.seed = opts.seed ?? CONFIG.world.seed;
    this.width = opts.width ?? CONFIG.world.width;
    this.height = opts.height ?? CONFIG.world.height;
    this.obstacleCount = opts.obstacleCount ?? CONFIG.world.obstacleCount;
    this.gridSize = opts.gridSize ?? CONFIG.world.gridSize;

    /** Axis-aligned world rectangle. Ships are clamped inside it. */
    this.bounds = { x: 0, y: 0, width: this.width, height: this.height };

    /** @type {Array<{x:number,y:number,radius:number,points:number[],angle:number,seed:number}>} */
    this.obstacles = [];
    this.maxObstacleRadius = 0;

    /** Broad-phase uniform grid: "cx,cy" -> obstacle[]. */
    this.grid = new Map();

    /** Reusable output array (never allocate inside the loop). */
    this._scratch = [];

    this.time = 0;

    this._generate();
  }

  /* ------------------------------------------------------------ generation -- */

  _generate() {
    const rng = createRng(this.seed);
    const { width, height } = this;

    /* --- parallax star layers (screen space, normalised coords) ---------- */
    this.starLayers = CONFIG.world.starLayers.map((cfg) => {
      const stars = new Array(cfg.count);
      for (let i = 0; i < cfg.count; i++) {
        stars[i] = { x: rng(), y: rng(), phase: rng() * TAU };
      }
      return { ...cfg, stars };
    });

    /* --- nebula blobs (world space, pure decoration) --------------------- */
    this.nebulas = [];
    for (let i = 0; i < 5; i++) {
      this.nebulas.push({
        x: randRange(rng, 0, width),
        y: randRange(rng, 0, height),
        radius: randRange(rng, 700, 1600),
        hue: rng() < 0.5 ? '90, 140, 255' : '160, 90, 220',
        alpha: randRange(rng, 0.05, 0.12),
      });
    }

    /* --- asteroids -------------------------------------------------------- */
    const safeRadius = 520; // keep the spawn point clear
    const cx = width * 0.5;
    const cy = height * 0.5;
    let attempts = 0;

    while (this.obstacles.length < this.obstacleCount && attempts < this.obstacleCount * 40) {
      attempts++;
      const radius = randRange(rng, 38, 150);
      const x = randRange(rng, radius + 40, width - radius - 40);
      const y = randRange(rng, radius + 40, height - radius - 40);

      // Never block the spawn point.
      if (Math.hypot(x - cx, y - cy) < safeRadius + radius) continue;

      // Cheap rejection test against existing rocks (keeps sectors readable
      // and prevents overlapping collision volumes).
      let tooClose = false;
      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        if (Math.hypot(o.x - x, o.y - y) < o.radius + radius + 90) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const obstacle = {
        x,
        y,
        radius,
        points: World._makeRockShape(rng, radius),
        angle: randRange(rng, 0, TAU),
        spin: randRange(rng, -0.08, 0.08),
      };
      this.obstacles.push(obstacle);
      if (radius > this.maxObstacleRadius) this.maxObstacleRadius = radius;
      this._insertIntoGrid(obstacle);
    }
  }

  /** Irregular convex-ish polygon: radius jitter + per-vertex noise. */
  static _makeRockShape(rng, radius) {
    const n = 7 + Math.floor(rng() * 5);
    const points = new Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = radius * randRange(rng, 0.72, 1.12);
      points[i * 2] = Math.cos(a) * r;
      points[i * 2 + 1] = Math.sin(a) * r;
    }
    return points;
  }

  _insertIntoGrid(o) {
    const minX = Math.floor((o.x - o.radius) / CELL_SIZE);
    const maxX = Math.floor((o.x + o.radius) / CELL_SIZE);
    const minY = Math.floor((o.y - o.radius) / CELL_SIZE);
    const maxY = Math.floor((o.y + o.radius) / CELL_SIZE);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const key = cx + ',' + cy;
        let cell = this.grid.get(key);
        if (!cell) {
          cell = [];
          this.grid.set(key, cell);
        }
        cell.push(o);
      }
    }
  }

  /**
   * Broad-phase query: fills `out` with obstacles whose AABB overlaps the
   * search circle. Exact distance tests happen in Ship.
   * @returns {Array} the same `out` array, for chaining
   */
  queryNearby(x, y, radius, out = []) {
    out.length = 0;
    const minX = Math.floor((x - radius) / CELL_SIZE);
    const maxX = Math.floor((x + radius) / CELL_SIZE);
    const minY = Math.floor((y - radius) / CELL_SIZE);
    const maxY = Math.floor((y + radius) / CELL_SIZE);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const cell = this.grid.get(cx + ',' + cy);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const o = cell[i];
          // Avoid duplicates: an obstacle spanning several cells is visited
          // once per cell, so de-dupe by identity.
          if (out.indexOf(o) === -1) out.push(o);
        }
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ tick -- */

  /** @param {number} dt fixed step */
  update(dt) {
    this.time += dt;
    // Slow asteroid tumble — sells "we are in space" for almost zero cost.
    for (let i = 0; i < this.obstacles.length; i++) {
      this.obstacles[i].angle += this.obstacles[i].spin * dt;
    }
  }

  /* ---------------------------------------------------------------- render -- */

  /**
   * Parallax starfield. Drawn in SCREEN space: star positions are normalised
   * and wrapped modulo the viewport, so an infinite field costs a fixed number
   * of points no matter how big the sector is.
   */
  renderBackground(ctx, camera, viewport, alpha = 1) {
    const W = viewport.width;
    const H = viewport.height;
    const camX = camera.getRenderX(alpha);
    const camY = camera.getRenderY(alpha);
    const z = camera.zoom;
    const t = this.time;
    const pad = 6;

    for (let li = 0; li < this.starLayers.length; li++) {
      const layer = this.starLayers[li];
      const spanX = W + pad;
      const spanY = H + pad;
      const offX = -camX * layer.parallax * z;
      const offY = -camY * layer.parallax * z;
      const size = layer.size;

      ctx.fillStyle = layer.color;
      for (let i = 0; i < layer.stars.length; i++) {
        const s = layer.stars[i];
        const sx = mod(s.x * spanX + offX, spanX) - pad * 0.5;
        const sy = mod(s.y * spanY + offY, spanY) - pad * 0.5;
        // Twinkle: subtle, and driven by per-star phase so it never pulses
        // in unison. globalAlpha is a cheap state change on mobile GPUs.
        ctx.globalAlpha = layer.alpha * (0.62 + 0.38 * Math.sin(t * layer.twinkle + s.phase));
        ctx.fillRect(sx, sy, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Grid + nebulae + boundary, in WORLD space. */
  renderGround(ctx, camera, viewport) {
    const p = CONFIG.palette;
    const view = camera.getVisibleRect(this.gridSize);

    /* --- nebula blobs ---------------------------------------------------- */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.nebulas.length; i++) {
      const n = this.nebulas[i];
      if (!camera.isCircleVisible(n.x, n.y, n.radius)) continue;
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
      g.addColorStop(0, `rgba(${n.hue}, ${n.alpha})`);
      g.addColorStop(1, `rgba(${n.hue}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    /* --- navigation grid -------------------------------------------------- */
    const step = this.gridSize;
    const startX = Math.floor(view.x / step) * step;
    const startY = Math.floor(view.y / step) * step;
    const endX = view.x + view.w;
    const endY = view.y + view.h;
    // Keep line width visually constant regardless of zoom.
    const thin = 1 / camera.zoom;

    ctx.lineWidth = thin;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      const major = Math.round(x / step) % 5 === 0;
      if (major) continue;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += step) {
      const major = Math.round(y / step) % 5 === 0;
      if (major) continue;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.strokeStyle = p.grid;
    ctx.stroke();

    ctx.lineWidth = thin * 1.6;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      if (Math.round(x / step) % 5 !== 0) continue;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += step) {
      if (Math.round(y / step) % 5 !== 0) continue;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.strokeStyle = p.gridMajor;
    ctx.stroke();

    /* --- sector boundary (the "you shall not pass" line) ------------------ */
    const b = this.bounds;
    ctx.lineWidth = 4 / camera.zoom;
    ctx.strokeStyle = p.bounds;
    ctx.globalAlpha = 0.55;
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.globalAlpha = 1;
  }

  /** Asteroids, culled to the view. WORLD space. */
  renderObstacles(ctx, camera) {
    const p = CONFIG.palette;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (!camera.isCircleVisible(o.x, o.y, o.radius)) continue;

      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle);

      const pts = o.points;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
      ctx.closePath();

      ctx.fillStyle = p.asteroid;
      ctx.fill();
      ctx.lineWidth = 2 / camera.zoom;
      ctx.strokeStyle = p.asteroidEdge;
      ctx.stroke();

      // Crater dots: a couple of darker circles give the placeholder rock
      // some surface detail for ~0 cost.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.beginPath();
      ctx.arc(o.radius * 0.25, -o.radius * 0.15, o.radius * 0.18, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-o.radius * 0.3, o.radius * 0.25, o.radius * 0.12, 0, TAU);
      ctx.fill();

      ctx.restore();
    }
  }

  /* ----------------------------------------------------------------- util -- */

  /** Clamp a circle inside the world bounds. Returns true if it was moved. */
  clampCircle(entity) {
    const b = this.bounds;
    const r = entity.radius;
    let moved = false;
    if (entity.x < b.x + r) {
      entity.x = b.x + r;
      moved = true;
    } else if (entity.x > b.x + b.width - r) {
      entity.x = b.x + b.width - r;
      moved = true;
    }
    if (entity.y < b.y + r) {
      entity.y = b.y + r;
      moved = true;
    } else if (entity.y > b.y + b.height - r) {
      entity.y = b.y + b.height - r;
      moved = true;
    }
    return moved;
  }

  /** World-space point -> 0..1 progress across the sector (minimap later). */
  normalize(x, y, out = { x: 0, y: 0 }) {
    out.x = clamp(x / this.width, 0, 1);
    out.y = clamp(y / this.height, 0, 1);
    return out;
  }
}

export default World;
