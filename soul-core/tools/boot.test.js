// End-to-end boot test: runs the real Game against a stubbed DOM + 2D context.
// Catches wiring typos in the render/input paths that unit tests can't see.

const handlers = new Map();
function addHandler(map, type, fn) {
  if (!map.has(type)) map.set(type, []);
  map.get(type).push(fn);
}
function fire(map, type, event = {}) {
  const list = map.get(type) || [];
  for (const fn of list) fn({ preventDefault() {}, stopPropagation() {}, ...event });
}

const ctx2d = new Proxy({}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return (...args) => {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return { addColorStop() {} };
      if (prop === 'measureText') return { width: 10 };
      if (prop === 'createPattern') return {};
      return undefined;
    };
  },
  set(target, prop, value) { target[prop] = value; return true; },
});

const canvasHandlers = new Map();
const canvas = {
  width: 0, height: 0,
  clientWidth: 390, clientHeight: 844,
  style: {},
  getContext: () => ctx2d,
  addEventListener: (t, fn) => addHandler(canvasHandlers, t, fn),
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
};

const windowHandlers = new Map();
global.window = {
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
  addEventListener: (t, fn) => addHandler(windowHandlers, t, fn),
  removeEventListener: () => {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  location: { search: '' },
  // no visualViewport on purpose: exercises the feature-detection branch
};
global.document = {
  getElementById: (id) => (id === 'game' ? canvas : null),
  addEventListener: () => {},
  documentElement: {},
  body: { classList: { add() {}, remove() {} } },
  hidden: false,
};
global.getComputedStyle = () => ({ getPropertyValue: () => '0px' });
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;


const { Game } = await import('../src/core/Game.js');
const { CONFIG } = await import('../src/config.js');
const { ThrusterHeatSystem } = await import('../src/systems/ThrusterHeatSystem.js');

let failures = 0;
const f = (n, d = 1) => n.toFixed(d);
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}

const game = new Game(canvas, { debug: true });
game.init();
game.systems.install(new ThrusterHeatSystem());

check('boots without throwing', true, '');
check('canvas backing store matches CSS box x DPR',
  canvas.width === Math.round(390 * game.viewport.dpr) && canvas.height === Math.round(844 * game.viewport.dpr),
  `${canvas.width}x${canvas.height} dpr=${f(game.viewport.dpr, 2)}`);
check('DPR is capped for performance', game.viewport.dpr <= CONFIG.viewport.maxDpr, `${f(game.viewport.dpr, 2)}`);
check('title state blocks input', game.input.enabled === false && game.state === 'title', '');

// --- drive the loop by hand ------------------------------------------------
const STEP = CONFIG.loop.fixedStep;
function frames(n, alpha = 0.5) {
  for (let i = 0; i < n; i++) {
    game.update(STEP);
    game.render(alpha, 1 / 60);
  }
}

frames(30); // title screen renders
check('renders the title screen', game.state === 'title' && game.loop.frameCount >= 0, '');

// --- simulated touch on the virtual stick ----------------------------------
const jx = game.joystick.centerX;
const jy = game.joystick.centerY;
check('joystick anchored bottom-centre',
  Math.abs(jx - 195) < 1 && jy > 844 * 0.7, `anchor=${f(jx)},${f(jy)}`);

// Tap starts the run (title -> playing)
fire(canvasHandlers, 'pointerdown', { pointerId: 1, clientX: 195, clientY: 500, target: canvas });
fire(windowHandlers, 'pointerup', { pointerId: 1, clientX: 195, clientY: 500 });
check('tap starts the run', game.state === 'playing' && game.input.enabled, '');

// Drag the stick fully right
fire(canvasHandlers, 'pointerdown', { pointerId: 2, clientX: jx, clientY: jy, target: canvas });
fire(windowHandlers, 'pointermove', { pointerId: 2, clientX: jx + 200, clientY: jy });
frames(1);
check('stick produces a full-strength axis', game.input.axis.x > 0.98, `axis=${f(game.input.axis.x, 2)},${f(game.input.axis.y, 2)}`);
check('stick magnitude is clamped to 1', game.input.magnitude <= 1.0001, `${f(game.input.magnitude, 3)}`);

const x0 = game.ship.x;
frames(240); // 2 seconds of thrust
check('ship flies right under touch input', game.ship.x - x0 > 500, `dx=${f(game.ship.x - x0)}`);
check('thrust gauges respond (heat system)', game.ship.resources.heat > 0.1, `heat=${f(game.ship.resources.heat, 2)}`);
check('exhaust particles spawned', game.particles.liveCount > 0, `${game.particles.liveCount}`);

// Release the stick: the ship must keep drifting
fire(windowHandlers, 'pointerup', { pointerId: 2, clientX: jx + 200, clientY: jy });
frames(1);
check('releasing the stick zeroes the axis', game.input.magnitude < 0.001, '');
const vRelease = game.ship.speedValue;
frames(60); // 0.5s
check('ship keeps drifting after release', game.ship.speedValue > vRelease * 0.6,
  `${f(vRelease)} -> ${f(game.ship.speedValue)}`);

// Dead zone: a tiny drag must not move the ship
fire(canvasHandlers, 'pointerdown', { pointerId: 3, clientX: jx, clientY: jy, target: canvas });
fire(windowHandlers, 'pointermove', { pointerId: 3, clientX: jx + 3, clientY: jy });
frames(1);
check('dead zone ignores thumb jitter', game.input.magnitude < 0.001, `mag=${f(game.input.magnitude, 3)}`);
fire(windowHandlers, 'pointerup', { pointerId: 3, clientX: jx + 3, clientY: jy });

// Multi-touch: a second finger must not steal the stick
fire(canvasHandlers, 'pointerdown', { pointerId: 4, clientX: jx, clientY: jy - 100, target: canvas });
fire(windowHandlers, 'pointermove', { pointerId: 4, clientX: jx + 120, clientY: jy - 100 });
frames(1);
const held = game.input.magnitude;
fire(canvasHandlers, 'pointerdown', { pointerId: 5, clientX: 20, clientY: 200, target: canvas });
frames(1);
check('multi-touch safe (first finger keeps control)', Math.abs(game.input.magnitude - held) < 0.001,
  `${f(held, 2)} -> ${f(game.input.magnitude, 2)}`);
fire(windowHandlers, 'pointerup', { pointerId: 4 });
fire(windowHandlers, 'pointerup', { pointerId: 5 });

// --- keyboard --------------------------------------------------------------
fire(windowHandlers, 'keydown', { code: 'KeyW' });
frames(1);
check('WASD drives the ship on desktop', game.input.axis.y < -0.9, `axis.y=${f(game.input.axis.y, 2)}`);
fire(windowHandlers, 'keyup', { code: 'KeyW' });
frames(1);
check('key release zeroes the axis', game.input.magnitude < 0.001, '');

// --- debug keys / pause ----------------------------------------------------
fire(windowHandlers, 'keydown', { code: 'KeyP' });
check('P pauses', game.paused === true, '');
const xPaused = game.ship.x;
frames(60);
check('paused simulation is frozen', game.ship.x === xPaused, '');
fire(windowHandlers, 'keydown', { code: 'KeyP' });
check('P resumes', game.paused === false, '');

fire(windowHandlers, 'keydown', { code: 'Digit2' });
check('debug key raises the weight gauge', game.ship.resources.weight > 0, `${f(game.ship.resources.weight, 2)}`);
fire(windowHandlers, 'keydown', { code: 'Digit0' });
check('debug key resets gauges', game.ship.resources.weight === 0 && game.ship.resources.heat === 0, '');

// --- resize / orientation --------------------------------------------------
canvas.clientWidth = 844;
canvas.clientHeight = 390; // rotated to landscape
fire(windowHandlers, 'resize', {});
frames(2);
check('handles rotation to landscape',
  game.viewport.width === 844 && game.joystick.radius <= CONFIG.joystick.maxRadius &&
  game.joystick.centerY < 390, `vp=${game.viewport.width}x${game.viewport.height} stick=${f(game.joystick.radius)}`);
canvas.clientWidth = 390;
canvas.clientHeight = 844;
fire(windowHandlers, 'resize', {});
frames(2);

// --- render every layer with debug on, for many frames ---------------------
let renderError = null;
try {
  game.ship.resources.heat = 1;
  game.ship.resources.corrosion = 1;
  game.ship.resources.weight = 1;
  game.ship.resources.power = 0.2;
  for (let i = 0; i < 300; i++) {
    game.update(STEP);
    game.render((i % 10) / 10, 1 / 60);
  }
  game.respawn();
  game.render(0, 1 / 60);
} catch (e) {
  renderError = e;
}
check('300 debug frames render without error', renderError === null, renderError ? String(renderError) : '');

// --- blur safety -----------------------------------------------------------
fire(windowHandlers, 'keydown', { code: 'KeyD' });
fire(windowHandlers, 'blur', {});
frames(1);
check('blur drops held keys', game.input.magnitude < 0.001, '');

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures ? 1 : 0);
