/**
 * HullSystem.js
 * ----------------------------------------------------------------------------
 * HULL — the single owner of damage. Everything that can hurt the ship routes
 * through `ship.damage()` from here, so armour, shields, damage resistances
 * and death handling all have exactly one place to live.
 *
 * Sources today:
 *   • impacts   : listens for 'ship:impact' on the event bus (asteroids, walls)
 *   • thermal   : the hull cooks while the core is redlined
 *   • ramming   : listens for 'ship:rammed' — a raider that reached the hull
 *
 * At 0 hull the ship emits 'ship:destroyed' and the Game ends the run.
 *
 * This is also the demonstration of event-driven systems: the Ship only knows
 * "I hit something at speed X", it does not know or care that damage exists.
 */
import { ShipSystem } from './ShipSystem.js';
import { CONFIG } from '../config.js';

export class HullSystem extends ShipSystem {
  static id = 'hull';

  constructor(config = {}) {
    super({ id: HullSystem.id, ...config });
    this._offImpact = null;
    this._offRam = null;
    this.rams = 0; // telemetry
  }

  onAttach(ship) {
    // Subscribe through the manager's bus, and keep the unsubscribe handle so
    // a hot-uninstalled system can never leak a listener into the next run.
    this._offImpact = this.events?.on('ship:impact', (e) => this._onImpact(e)) ?? null;
    this._offRam = this.events?.on('ship:rammed', (e) => this._onRam(e)) ?? null;
  }

  onDetach() {
    if (this._offImpact) this._offImpact();
    if (this._offRam) this._offRam();
    this._offImpact = null;
    this._offRam = null;
  }

  /**
   * A raider got through. CollisionSystem decides WHEN; this decides how much
   * hull it costs, so armour/resistance mods still have one home.
   */
  _onRam(e) {
    if (!this.ship || !this.ship.alive) return;
    this.rams++;
    this.ship.damage(e.damage);
    this.events?.emit('ship:damaged', {
      amount: e.damage, source: 'ram', ship: this.ship, enemy: e.enemy,
    });
    if (this.ship.stats.hull <= 0) {
      this.events?.emit('ship:destroyed', { ship: this.ship, source: 'ram' });
    }
  }

  _onImpact(e) {
    const cfg = CONFIG.systems;
    if (e.speed < cfg.impactDamageMinSpeed) return; // gentle bump, no harm

    const amount = cfg.impactDamage * e.strength;
    this.ship.damage(amount);
    this.events?.emit('ship:damaged', { amount, source: 'impact', ship: this.ship, speed: e.speed });

    if (this.ship.stats.hull <= 0) {
      this.events?.emit('ship:destroyed', { ship: this.ship, source: 'impact' });
    }
  }

  update(dt, ship) {
    // Thermal damage: the plating is the heat sink of last resort.
    if (!ship.isOverheating || !ship.alive) return;
    const severity = 0.5 + 0.5 * ship.overheatSeverity;
    ship.damage(CONFIG.systems.thermalDamagePerSecond * severity * dt);

    if (ship.stats.hull <= 0) {
      this.events?.emit('ship:destroyed', { ship, source: 'thermal' });
    }
  }

  reset() {
    this.rams = 0;
  }
}

export default HullSystem;
