/**
 * main.js
 * ----------------------------------------------------------------------------
 * Entry point. Creates the Game, exposes a debug handle, and reads a few
 * optional URL parameters:
 *
 *   ?debug=1         enable the debug overlay from the start
 *   ?seed=12345      generate a specific sector
 *   ?rocks=200       asteroid count
 *   ?heat=1          install the example ThrusterHeatSystem (see systems/)
 */
import { CONFIG } from './config.js';
import { Game } from './core/Game.js';
import { ThrusterHeatSystem } from './systems/ThrusterHeatSystem.js';

function readOptions() {
  const params = new URLSearchParams(window.location.search);

  const num = (name, fallback) => {
    if (!params.has(name)) return fallback;
    const v = Number(params.get(name));
    return Number.isFinite(v) ? v : fallback;
  };

  return {
    debug: params.has('debug') && params.get('debug') !== '0',
    worldOpts: {
      seed: num('seed', CONFIG.world.seed),
      obstacleCount: num('rocks', CONFIG.world.obstacleCount),
    },
    installExampleHeat: params.has('heat') && params.get('heat') !== '0',
  };
}

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) throw new Error('canvas#game element is missing from index.html');

  const opts = readOptions();
  const game = new Game(canvas, opts);

  // Example system — the pattern every future system will follow.
  // Opt-in for now so Phase 1 stays a pure flight prototype.
  if (opts.installExampleHeat) {
    game.systems.install(new ThrusterHeatSystem({ heatPerSecond: 0.22 }));
  }

  game.init();

  // Debug handle: poke at the running game from devtools.
  //   SoulCore.ship.resources.heat = 1
  //   SoulCore.systems.install(new MySystem())
  window.SoulCore = game;

  console.info(
    '%cSoul Core: The Great Decay%c phase 1 ready — %dx%d @%s',
    'color:#35e0ff;font-weight:bold',
    'color:#cfe0ff',
    game.viewport.width,
    game.viewport.height,
    game.viewport.dpr.toFixed(2),
  );
}

try {
  boot();
} catch (err) {
  console.error('[SoulCore] boot failed', err);
  const box = document.getElementById('fatal');
  const msg = document.getElementById('fatal-msg');
  if (box && msg) {
    box.hidden = false;
    msg.textContent = String((err && err.message) || err);
  }
}
