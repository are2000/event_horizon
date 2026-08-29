/**
 * main.js
 * ----------------------------------------------------------------------------
 * Entry point. Creates the Game, exposes a debug handle, and reads a few
 * optional URL parameters:
 *
 *   ?debug=1         enable the debug overlay + the on-screen debug pad
 *                    (the pad is how a *phone* reaches the debug actions,
 *                    since 6 / 7 / 8 / 0 need a keyboard)
 *   ?seed=12345      generate a specific sector
 *   ?rocks=200       asteroid count
 *   ?corrosion=2     corrosion %/s (default 0.35) — use 0 for a sandbox run
 */
import { CONFIG } from './config.js';
import { Game } from './core/Game.js';

function readOptions() {
  const params = new URLSearchParams(window.location.search);

  const num = (name, fallback) => {
    if (!params.has(name)) return fallback;
    const v = Number(params.get(name));
    return Number.isFinite(v) ? v : fallback;
  };

  const corrosionRate = num('corrosion', CONFIG.systems.corrosionRate);

  return {
    debug: params.has('debug') && params.get('debug') !== '0',
    worldOpts: {
      seed: num('seed', CONFIG.world.seed),
      obstacleCount: num('rocks', CONFIG.world.obstacleCount),
    },
    corrosionRate,
  };
}

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) throw new Error('canvas#game element is missing from index.html');

  const opts = readOptions();
  const game = new Game(canvas, opts);
  game.init();

  // Optional URL override for the run timer (?corrosion=0 => free flight).
  if (opts.corrosionRate !== CONFIG.systems.corrosionRate) {
    game.ship.stats.corrosionRate = opts.corrosionRate;
  }

  // Debug handle: poke at the running game from devtools.
  //   SoulCore.status()
  //   SoulCore.core.weight.addCargo(40)      -> watch acceleration die
  //   SoulCore.ship.generateHeat(120)        -> overheat penalties
  //   SoulCore.ship.consumePower(100)        -> brownout
  //   SoulCore.ship.stats.coreCorrosion = 99 -> meltdown next tick
  //   SoulCore.inventory.addDef('plasma', 2) -> drop a T2 plasma in the hold
  //   SoulCore.inventory.debugString()       -> hold / mass / load / hardpoints
  //   SoulCore.openInventory()               -> the cargo hold (or press I)
  //   SoulCore._debugSpawnRaider(200)        -> a live raider, 200wu out
  //   SoulCore.debugPad.press('Digit8')      -> same as the on-screen [GUNS] button
  //   SoulCore.scrap / runScrap / scrapBank  -> the economy
  window.SoulCore = game;

  console.info(
    '%cSoul Core: The Great Decay%c phase 5 ready — %dx%d @%s',
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
