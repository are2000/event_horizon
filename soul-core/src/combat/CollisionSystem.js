/**
 * CollisionSystem.js
 * ----------------------------------------------------------------------------
 * Every "two things touched" question in the combat loop, in one place:
 *
 *   1. a BROAD-PHASE grid over the enemies, rebuilt once per step and shared
 *      with anything that needs it (shells, blasts, the minimap)
 *   2. pack SEPARATION, so raiders arrive as a cloud instead of one blob
 *   3. RAMMING — a raider that reaches the hull bites: hull damage, an instant
 *      chunk of corrosion, and a knockback that shoves both hulls apart
 *
 * ============================================================================
 * WHY THIS IS NOT A ShipSystem
 * ============================================================================
 * The ShipSystems in src/systems/ all run inside `SystemsManager.update()`,
 * which happens BEFORE the entities move: they read gauges and write
 * `modifiers`. Collision is the opposite — it needs the positions the ship and
 * the enemies have JUST integrated. So the Game calls this one explicitly,
 * right after both have moved. Same shape (`update(dt, ctx)`), different slot.
 *
 * ============================================================================
 * WHY A GRID
 * ============================================================================
 * The naive version is O(shells x enemies): 200 shells x 30 enemies is 6000
 * distance tests per step, 120 steps a second, on a phone. With the grid each
 * shell tests only the enemies whose cell it overlaps — typically 0 to 3 — so
 * the same work costs a few hundred tests. `stats()` reports the candidate
 * counts so the win is measurable rather than assumed.
 *
 * Damage is NOT applied here. HullSystem owns hull, CorrosionSystem owns
 * corrosion; this system only decides THAT a ram happened and announces it
 * (`ship:rammed`). Either system can be removed without the other noticing.
 */
import { CONFIG } from '../config.js';
import { SpatialHash } from '../core/SpatialHash.js';

export class CollisionSystem {
  constructor(config = {}) {
    const cell = CONFIG.combat.collision;
    const scav = CONFIG.combat.scavengers;

    this.cellSize = config.cellSize ?? cell.cellSize;
    this.separation = config.separation ?? scav.separation;
    this.knockback = config.knockback ?? scav.knockback;

    /** The shared broad-phase index. Rebuilt every step, never reallocated. */
    this.grid = new SpatialHash(this.cellSize, 96);
    /** Reused candidate lists — separate buffers, because the separation pass
     *  and the ram pass both hold results while emitting events. */
    this._near = [];
    this._ramNear = [];
    /** Biggest enemy radius seen this step — the query margin shells need. */
    this.maxEnemyRadius = 26;

    /** Telemetry (debug overlay + tests). */
    this.ramCount = 0;
    this.lastContacts = 0;
    this.lastSeparations = 0;
  }

  /**
   * @param {number} dt fixed step
   * @param {object} ctx { ship, enemies, particles, events, camera, state }
   */
  update(dt, ctx) {
    const enemies = ctx.enemies;
    const ship = ctx.ship;
    if (!enemies || !enemies.length) {
      this.grid.clear();
      this.lastContacts = 0;
      this.lastSeparations = 0;
      return;
    }

    /* 1. INDEX -------------------------------------------------------------- */
    this.grid.rebuild(enemies);
    let maxR = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.alive && e.radius > maxR) maxR = e.radius;
    }
    this.maxEnemyRadius = maxR || 26;

    /* 2. SEPARATION --------------------------------------------------------- */
    // Only movers need it; the dummies never overlap by construction.
    let separations = 0;
    const near = this._near;
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (!a.alive || !a.applyImpulse) continue;
      const list = this.grid.query(a.x, a.y, a.radius * 2 + maxR, near);
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b === a || !b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const dSq = dx * dx + dy * dy;
        if (dSq >= min * min || dSq < 1e-6) continue;

        const d = Math.sqrt(dSq);
        const overlap = (min - d) / min; // 0..1
        // Push both apart, but only the mover is steered hard — a dummy that
        // gets bumped barely shifts.
        const push = overlap * this.separation * 260 * dt;
        a.applyImpulse(-(dx / d) * push, -(dy / d) * push);
        if (b.applyImpulse && b !== a) b.applyImpulse((dx / d) * push * 0.35, (dy / d) * push * 0.35);
        separations++;
      }
    }
    this.lastSeparations = separations;

    /* 3. RAMMING ------------------------------------------------------------ */
    this.lastContacts = 0;
    if (!ship || !ship.alive || ctx.state !== 'playing') return;

    const contacts = this.grid.query(ship.x, ship.y, ship.radius + maxR + 4, this._ramNear);
    for (let i = 0; i < contacts.length; i++) {
      const e = contacts[i];
      if (!e.alive || !e.enemyType || e.enemyType === 'dummy') continue;

      const dx = e.x - ship.x;
      const dy = e.y - ship.y;
      const min = ship.radius + e.radius;
      const dSq = dx * dx + dy * dy;
      if (dSq >= min * min) continue;

      const d = Math.sqrt(dSq) || 0.001;
      this.lastContacts++;
      this._separate(ship, e, dx / d, dy / d, min - d);

      // Bite, then back off: the cooldown is what stops a grappling raider
      // from draining the whole hull in a fifth of a second.
      if (e.ramCooldown > 0) continue;
      e.ramCooldown = e.ramCooldownTime ?? CONFIG.combat.scavengers.ramCooldown;

      this._bite(ship, e, dx / d, dy / d, ctx);
    }
  }

  /**
   * Shove the two hulls apart and kill the closing velocity. Half positional
   * (so they cannot ever overlap) and half impulse (so it LOOKS like a hit).
   */
  _separate(ship, enemy, nx, ny, overlap) {
    if (overlap > 0) {
      const half = overlap * 0.5 + 0.01;
      ship.x -= nx * half;
      ship.y -= ny * half;
      enemy.x += nx * half;
      enemy.y += ny * half;
    }
    const kick = this.knockback;
    ship.applyImpulse(-nx * kick, -ny * kick);
    enemy.applyImpulse(nx * kick * 0.8, ny * kick * 0.8);
  }

  /** The damaging part: announced, not applied (see the header). */
  _bite(ship, enemy, nx, ny, ctx) {
    this.ramCount++;
    const damage = enemy.contactDamage ?? CONFIG.combat.scavengers.contactDamage;
    const corrosion = enemy.corrosionDamage ?? CONFIG.combat.scavengers.corrosionDamage;

    ctx.events?.emit('ship:rammed', {
      ship,
      enemy,
      damage,
      corrosion,
      x: (ship.x + enemy.x) * 0.5,
      y: (ship.y + enemy.y) * 0.5,
      nx: -nx,
      ny: -ny,
    });

    ctx.particles?.burst(14, {
      x: (ship.x + enemy.x) * 0.5,
      y: (ship.y + enemy.y) * 0.5,
      angle: Math.atan2(-ny, -nx),
      spread: 1.4,
      speed: 260, life: 0.4, size: 3.2,
      color: '#ff6b8a', drag: 3, jitter: 12,
    });
    ctx.camera?.addShake(4.5);
  }

  /* ----------------------------------------------------------------- query -- */

  /**
   * The index itself is the shared API: `system.grid` is handed to the
   * projectile pool (and anything else that needs "what is near here") so the
   * sector is indexed once per step and every consumer pays only for queries.
   */

  clear() {
    this.grid.clear();
    this.ramCount = 0;
    this.lastContacts = 0;
    this.lastSeparations = 0;
  }

  /** Snapshot for the debug overlay / tests. */
  stats() {
    const g = this.grid.stats();
    return {
      cellSize: g.cellSize,
      cells: g.buckets,
      indexed: g.inserts,
      maxDepth: g.maxDepth,
      candidates: g.lastCandidates,
      contacts: this.lastContacts,
      separations: this.lastSeparations,
      rams: this.ramCount,
      maxEnemyRadius: Math.round(this.maxEnemyRadius),
    };
  }
}

export default CollisionSystem;
