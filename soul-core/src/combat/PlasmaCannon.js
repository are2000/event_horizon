/**
 * PlasmaCannon.js
 * ----------------------------------------------------------------------------
 * An area weapon. The bolt itself is unremarkable; what matters is what
 * happens when it stops: a detonation that catches everything inside
 * `splashRadius`, with damage falling off toward the rim.
 *
 * The price is heat. At 38 heat per shot (~42/s sustained against 11/s of
 * stock cooling) a plasma cannon redlines the core in about three seconds of
 * continuous fire — and it is meant to. The gun is a burst weapon by
 * construction: you get two or three shots, then you have to survive the
 * cooldown. That is the trade against the kinetic, which runs cool and slow.
 *
 * The blast also does two things beyond damage:
 *   - it KNOCKS everything caught in it outwards (`splashKnockback`), which
 *     turns a crowded pack into a scattered one — and buys you the second you
 *     need to turn inside them
 *   - it draws an expanding ring at exactly the blast radius (BlastFx), so the
 *     player learns the size of the explosion by watching it
 *
 * Again: a CannonWeapon subclass. The detonation itself lives in
 * ProjectilePool, because a shell has to keep working after its gun is gone.
 */
import { CONFIG } from '../config.js';
import { CannonWeapon } from './CannonWeapon.js';

export class PlasmaCannon extends CannonWeapon {
  static id = 'plasma';

  static get defaults() {
    return CONFIG.combat.plasma;
  }

  static shellKind = 'plasma';

  constructor(config = {}) {
    super({
      id: PlasmaCannon.id,
      name: 'Plasma Cannon',
      barrelLength: 17,
      barrelWidth: 8,
      brake: false,
      ...CONFIG.combat.plasma,
      ...config,
    });
  }

  /**
   * Sustained damage is a lie for this gun — a splash hit is worth more than a
   * direct one. Report direct + splash so the tooltip doesn't undersell it.
   */
  get dps() {
    const direct = this.damage * this.shotsPerSecond;
    const splash = this.splashDamage * this.shotsPerSecond;
    return Math.round((direct + splash * 0.7) * 10) / 10;
  }
}

export default PlasmaCannon;
