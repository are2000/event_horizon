/**
 * SpatialHash.js
 * ----------------------------------------------------------------------------
 * Uniform-grid broad-phase for moving entities.
 *
 * The problem: every step, dozens of shells have to ask "is there an enemy
 * near me?", the ship has to ask "is anything touching me?", and a plasma
 * blast has to ask "what is inside this radius?". Answering any of those by
 * scanning every entity is O(n) per query — with 26 enemies, 200 shells and a
 * couple of explosions per second that is ~5000 distance tests a step, 120
 * steps a second, on a phone.
 *
 * The fix is a grid: entities are bucketed by the cell their CENTRE falls in,
 * so a radius query only ever touches the handful of cells the query circle
 * overlaps. Same answer, a fraction of the work — and it degrades gracefully:
 * one crowded cell is still just one short list.
 *
 * Design notes
 *  - Buckets are ARRAYS THAT ARE NEVER FREED. `clear()` sets `length = 0`,
 *    so a steady-state step allocates nothing (the GC must not run mid-frame).
 *  - An entity is inserted into ONE cell (the one containing its centre), so
 *    a multi-cell query can never return the same entity twice. Queries need
 *    no dedupe stamp, which keeps them allocation- and branch-free.
 *  - Keys are numeric (a Map<number, array> beats string keys by a wide
 *    margin); the 4096-cell offset lets coordinates go negative (shells and
 *    raiders legitimately sit just outside the world bounds).
 *  - Out-of-range coordinates are clamped into the edge cells, so a runaway
 *    entity cannot blow up the key space.
 */

/** Cells are addressed in this range: [-4096, 4095] on each axis. */
const CELL_OFFSET = 4096;
const CELL_STRIDE = 8192;
const CELL_MIN = -CELL_OFFSET;
const CELL_MAX = CELL_STRIDE - CELL_OFFSET - 1;

export class SpatialHash {
  /**
   * @param {number} [cellSize] world units per cell edge
   * @param {number} [capacity] expected entity count (only sizes the map)
   */
  constructor(cellSize = 260, capacity = 64) {
    this.cellSize = cellSize > 0 ? cellSize : 260;
    this.invCellSize = 1 / this.cellSize;

    /** @type {Map<number, Array>} key -> bucket. Buckets are never freed:
     *  they are emptied in place every step and reused forever. */
    this.buckets = new Map();
    /** Warm-up supply of empty buckets, so the first frames don't allocate. */
    this._pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) this._pool[i] = [];

    /** Telemetry (debug overlay + tests). */
    this.insertCount = 0;
    this.bucketCount = 0;
    this.maxBucketDepth = 0;
    /** Candidates returned by the most recent query — the number that proves
     *  the broad-phase is actually narrowing anything. */
    this.lastCandidates = 0;
    this.lastCellsScanned = 0;
  }

  /* ----------------------------------------------------------------- keys -- */

  _cell(v) {
    const c = Math.floor(v * this.invCellSize);
    return c < CELL_MIN ? CELL_MIN : (c > CELL_MAX ? CELL_MAX : c);
  }

  _key(cx, cy) {
    return (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
  }

  _bucket(key) {
    let b = this.buckets.get(key);
    if (!b) {
      b = this._pool.length ? this._pool.pop() : [];
      this.buckets.set(key, b);
    }
    return b;
  }

  /* -------------------------------------------------------------- mutation -- */

  /** Empty every bucket WITHOUT freeing them (no garbage per step). */
  clear() {
    for (const b of this.buckets.values()) if (b.length) b.length = 0;
    this.insertCount = 0;
    this.bucketCount = 0;
    this.maxBucketDepth = 0;
    return this;
  }

  /**
   * Insert one entity (anything with .x/.y). Callers usually skip dead ones;
   * the hash does not care.
   * @param {{x:number,y:number}} entity
   */
  insert(entity) {
    const b = this._bucket(this._key(this._cell(entity.x), this._cell(entity.y)));
    b.push(entity);
    this.insertCount++;
    if (b.length > this.maxBucketDepth) this.maxBucketDepth = b.length;
    return this;
  }

  /**
   * Rebuild from a list. Skips dead entities when they expose `.alive`.
   * @param {Array<{x:number,y:number,alive?:boolean}>} list
   */
  rebuild(list) {
    this.clear();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && e.alive !== false) this.insert(e);
    }
    this.bucketCount = this.buckets.size;
    return this;
  }

  /* ----------------------------------------------------------------- query -- */

  /**
   * Everything whose CELL could touch the circle at (x, y, radius).
   * The result is a superset: callers still do the exact distance test.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {Array} [out] reused output array (cleared, not reallocated)
   * @returns {Array} the same array, filled with candidates
   */
  query(x, y, radius, out = []) {
    out.length = 0;
    const minX = this._cell(x - radius);
    const maxX = this._cell(x + radius);
    const minY = this._cell(y - radius);
    const maxY = this._cell(y + radius);

    let cells = 0;
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const b = this.buckets.get(this._key(cx, cy));
        if (!b || b.length === 0) continue;
        cells++;
        for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }

    this.lastCandidates = out.length;
    this.lastCellsScanned = cells;
    return out;
  }

  /** Convenience: does anything at all live inside this circle's cells? */
  anyNear(x, y, radius) {
    const minX = this._cell(x - radius);
    const maxX = this._cell(x + radius);
    const minY = this._cell(y - radius);
    const maxY = this._cell(y + radius);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const b = this.buckets.get(this._key(cx, cy));
        if (b && b.length) return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ info -- */

  /** Snapshot for the debug overlay / tests. */
  stats() {
    return {
      cellSize: this.cellSize,
      buckets: this.buckets.size,
      inserts: this.insertCount,
      maxDepth: this.maxBucketDepth,
      lastCandidates: this.lastCandidates,
      lastCells: this.lastCellsScanned,
    };
  }
}

export default SpatialHash;
