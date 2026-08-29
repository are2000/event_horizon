/**
 * KineticCannon.js
 * ----------------------------------------------------------------------------
 * A slab-thrower: the slowest, heaviest-hitting single shot in the game, and
 * the only gun that physically shoves the ship that fired it.
 *
 *   Laser   : continuous, cheap, needs sustained aim
 *   Cannon  : shells, fast enough to hit what you're pointed at
 *   Kinetic : one enormous slug at 420 wu/s — you must LEAD the target, and
 *             every shot kicks the hull backwards
 *   Plasma  : splash, and it cooks your own core
 *
 * Recoil is the interesting part. The muzzle impulse is applied to the ship as
 * a velocity change opposite the shot, scaled by how heavy the ship currently
 * is:
 *
 *   kick = recoil * duty * (1 - recoilWeightRelief * weight/maxWeight)
 *
 * Two consequences the player actually feels:
 *   - firing a full broadside of these while drifting will steer you, which
 *     makes recoil a movement tool as well as a cost
 *   - a loaded hauler barely notices, so the weight system pays you back for
 *     being heavy instead of only punishing you
 *
 * It is a CannonWeapon subclass: everything about firing (cooldown, power
 * gating, arc discipline, muzzle position) is inherited — only the numbers and
 * the recoil line are new.
 */
import { CONFIG } from '../config.js';
import { CannonWeapon } from './CannonWeapon.js';

export class KineticCannon extends CannonWeapon {
  static id = 'kinetic';

  static get defaults() {
    return CONFIG.combat.kinetic;
  }

  static shellKind = 'slug';

  constructor(config = {}) {
    super({
      id: KineticCannon.id,
      name: 'Kinetic Cannon',
      barrelLength: 20,
      barrelWidth: 9,
      brake: true,
      ...CONFIG.combat.kinetic,
      ...config,
    });
  }
}

export default KineticCannon;
