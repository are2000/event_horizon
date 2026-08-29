/**
 * WeaponSystem.js
 * ----------------------------------------------------------------------------
 * Owns the ship's hardpoints and drives them once per fixed step.
 *
 * It is a ShipSystem like Weight/Heat/Power/Corrosion, so it slots into the
 * same pipeline — but instead of touching `modifiers` it drives the combat
 * layer:
 *
 *   TargetingManager ──► WeaponMount (arc + rotation) ──► Weapon (cost + damage)
 *
 * Shared state arrives through `this.manager.context` (the object Game fills
 * with { world, particles, events, targeting, enemies, time }), which keeps the
 * systems decoupled: WeaponSystem never reaches for a global.
 *
 * Adding a new hardpoint or weapon type is config + one class, no edits here.
 */
import { CONFIG } from '../config.js';
import { ShipSystem } from './ShipSystem.js';
import { WeaponMount } from '../combat/WeaponMount.js';
import { LaserWeapon } from '../combat/LaserWeapon.js';
import { CannonWeapon } from '../combat/CannonWeapon.js';
import { KineticCannon } from '../combat/KineticCannon.js';
import { PlasmaCannon } from '../combat/PlasmaCannon.js';

/**
 * Weapon registry: config name -> class. Adding a gun is one entry here plus
 * a block in CONFIG.combat — nothing in this file changes.
 *
 *   laser   continuous beam, paid per second
 *   cannon  fast shells, paid per shot
 *   kinetic slow slugs, huge damage, RECOIL
 *   plasma  splash damage, cooks the core
 */
const WEAPON_TYPES = {
  laser: LaserWeapon,
  cannon: CannonWeapon,
  kinetic: KineticCannon,
  plasma: PlasmaCannon,
};

export class WeaponSystem extends ShipSystem {
  static id = 'weapons';

  /** @param {object} [config] overrides CONFIG.combat */
  constructor(config = {}) {
    super({ id: WeaponSystem.id, ...config });
    this.config = { ...CONFIG.combat, ...config };

    /** One shared "already claimed" set, cleared every step. */
    this.reserved = new Set();

    /** @type {WeaponMount[]} */
    this.mounts = (this.config.mounts ?? CONFIG.combat.mounts).map(
      (m) => new WeaponMount({ ...m, weapon: m.weapon ?? this.createWeapon(m.weaponType ?? 'laser') }),
    );

    this.kills = 0;
    this.shotsFired = 0;
    this._offKill = null;
  }

  /**
   * @param {string} typeKey registry key ('laser', ...)
   * @param {object} [config] weapon-specific overrides
   */
  createWeapon(typeKey, config = {}) {
    const Cls = WEAPON_TYPES[typeKey];
    if (!Cls) {
      console.warn(`[WeaponSystem] unknown weapon type "${typeKey}"`);
      return null;
    }
    return new Cls(config);
  }

  get(id) {
    return this.mounts.find((m) => m.id === id) ?? null;
  }

  /** Convenient named accessors used by the HUD / console. */
  get left() {
    return this.get('left');
  }

  get right() {
    return this.get('right');
  }

  get rear() {
    return this.get('rear');
  }

  attach(ship) {
    super.attach(ship);
    for (const mount of this.mounts) mount.attach(ship);
    return this;
  }

  /** How many mounts are actively shooting right now (0..N). */
  get firingCount() {
    let n = 0;
    for (const m of this.mounts) if (m.weapon && m.weapon.firing) n++;
    return n;
  }

  /** Total power the weapons are asking for this step (units/s). */
  get powerDraw() {
    let sum = 0;
    for (const m of this.mounts) {
      if (m.weapon && m.weapon.firing) sum += m.weapon.powerDraw ?? 0;
    }
    return sum;
  }

  onAttach() {
    this._offKill = this.events?.on('enemy:destroyed', () => {
      this.kills++;
    }) ?? null;
  }

  onDetach() {
    if (this._offKill) this._offKill();
    this._offKill = null;
  }

  /** @param {number} dt fixed step @param {import('../entities/Ship.js').Ship} ship */
  update(dt, ship) {
    const c = this.manager ? this.manager.context : null;
    if (!c || !c.targeting) return; // no combat context: mounts idle

    this.reserved.clear();
    for (let i = 0; i < this.mounts.length; i++) {
      this.mounts[i].update(dt, {
        ship,
        targeting: c.targeting,
        particles: c.particles,
        projectiles: c.projectiles,
        camera: c.camera, // big guns kick the camera as well as the hull
        events: this.events,
        reserved: this.reserved,
        time: c.time ?? 0,
      });
    }
  }

  /**
   * Draw turrets + beams in WORLD space. Call after the ship is drawn.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} alpha
   */
  render(ctx, alpha) {
    for (let i = 0; i < this.mounts.length; i++) this.mounts[i].render(ctx, alpha);
    for (let i = 0; i < this.mounts.length; i++) {
      const w = this.mounts[i].weapon;
      if (w) w.render(ctx, alpha);
    }
  }

  /** Debug/HUD snapshot of every mount. */
  status() {
    return this.mounts.map((m) => ({
      id: m.id,
      state: m.state,
      localDeg: ((m.localAngle * 180) / Math.PI).toFixed(0),
      arcDeg: `${((m.arcCenter - m.arcHalf) * 180 / Math.PI).toFixed(0)}..${((m.arcCenter + m.arcHalf) * 180 / Math.PI).toFixed(0)}`,
      errDeg: ((m.aimError * 180) / Math.PI).toFixed(1),
      target: m.target ? `#${m.target.id}` : '-',
    }));
  }

  reset() {
    for (const m of this.mounts) m.reset();
    this.kills = 0;
    this.shotsFired = 0;
    this.reserved.clear();
  }
}

export default WeaponSystem;
