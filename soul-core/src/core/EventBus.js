/**
 * EventBus.js
 * ----------------------------------------------------------------------------
 * Minimal synchronous pub/sub.
 *
 * Why an event bus in a small game? Because the systems we are about to add
 * (Weight, Heat, Power, Corrosion, weapons, pickups, run/modifier rolls) all
 * need to react to *other* systems without holding references to them:
 *
 *   bus.on('ship:impact', ({ speed }) => corrosion.add(speed * 0.001));
 *   bus.on('power:drain', ({ amount }) => heat.add(amount * 0.4));
 *
 * Keeping that coupling in one place is what stops Ship.js from turning into
 * a 3000-line god object by Phase 3.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /**
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe — call it to remove the listener
   */
  on(event, handler) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  /** Subscribe for a single emission. */
  once(event, handler) {
    const un = this.on(event, (payload) => {
      un();
      handler(payload);
    });
    return un;
  }

  off(event, handler) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.listeners.delete(event);
  }

  /** Remove every listener for an event (or for everything, if omitted). */
  clear(event) {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }

  /**
   * Emit synchronously. A throwing listener is logged but never breaks the
   * emitter — one broken system must not freeze the game loop.
   */
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy so listeners that unsubscribe during emit are handled safely.
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${event}" threw:`, err);
      }
    }
  }
}

export default EventBus;
