// End-to-end boot test: runs the real Game against a stubbed DOM + 2D context.
// Catches wiring typos in the render/input/HUD paths unit tests can't see.
//   node tools/boot.test.js

const handlers = new Map();
function addHandler(map, type, fn) {
  if (!map.has(type)) map.set(type, []);
  map.get(type).push(fn);
}
function fire(map, type, event = {}) {
  const list = map.get(type) || [];
  for (const fn of list) fn({ preventDefault() {}, stopPropagation() {}, ...event });
}

/** When true, every canvas call is recorded so tests can assert on drawing. */
let recording = false;
let drawCalls = [];

const ctx2d = new Proxy({}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return (...args) => {
      if (recording) {
        drawCalls.push({
          m: prop,
          args,
          fill: target.fillStyle,
          stroke: target.strokeStyle,
          alpha: target.globalAlpha,
          composite: target.globalCompositeOperation,
        });
      }
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return { addColorStop() {} };
      if (prop === 'measureText') return { width: 10 };
      if (prop === 'createPattern') return {};
      return undefined;
    };
  },
  set(target, prop, value) { target[prop] = value; return true; },
});

/** Render one frame with drawing recorded. */
function captureFrame(alpha = 0) {
  drawCalls = [];
  recording = true;
  game.render(alpha, 1 / 60);
  recording = false;
  return drawCalls;
}
const texts = (calls) => calls.filter((c) => c.m === 'fillText').map((c) => ({
  text: String(c.args[0]), x: c.args[1], y: c.args[2], fill: c.fill,
}));
const fillColors = (calls) => calls.filter((c) => c.m === 'fill').map((c) => String(c.fill));

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

let failures = 0;
const f = (n, d = 1) => n.toFixed(d);
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}

const game = new Game(canvas, { debug: true });
game.init();

check('boots without throwing', true, '');
check('canvas backing store matches CSS box x DPR',
  canvas.width === Math.round(390 * game.viewport.dpr) && canvas.height === Math.round(844 * game.viewport.dpr),
  `${canvas.width}x${canvas.height} dpr=${f(game.viewport.dpr, 2)}`);
check('DPR is capped for performance', game.viewport.dpr <= CONFIG.viewport.maxDpr, `${f(game.viewport.dpr, 2)}`);
check('title state blocks input', game.input.enabled === false && game.state === 'title', '');

/* ---------------------------- systems wired -------------------------------- */
check('six core systems are installed',
  ['weight', 'drive', 'power', 'heat', 'corrosion', 'hull'].every((id) => game.systems.get(id) !== null),
  game.systems.systems.map((s) => s.id).join(','));
check('systems get a reference to the manager + bus',
  game.core.hull.manager === game.systems && typeof game.core.hull.events.on === 'function', '');
check('ship starts with the documented stats',
  game.ship.stats.maxWeight > 0 && game.ship.stats.maxPower > 0 && game.ship.stats.maxHeat > 0 &&
  game.ship.stats.maxHull > 0 && game.ship.stats.coolingRate > 0 &&
  game.ship.stats.coreCorrosion === 0 && game.ship.stats.hull === game.ship.stats.maxHull,
  `hull=${game.ship.stats.hull} power=${game.ship.stats.power} cool=${game.ship.stats.coolingRate}`);

/* ------------------------------- the loop ---------------------------------- */
const STEP = CONFIG.loop.fixedStep;
function frames(n, alpha = 0.5) {
  for (let i = 0; i < n; i++) {
    game.update(STEP);
    game.render(alpha, 1 / 60);
  }
}
frames(30);
check('renders the title screen with the HUD', game.state === 'title', '');
check('no systems tick on the title screen',
  game.ship.stats.coreCorrosion === 0 && game.ship.stats.heat === 0, '');

/* ------------------------------ touch input -------------------------------- */
const jx = game.joystick.centerX;
const jy = game.joystick.centerY;
check('joystick anchored bottom-centre', Math.abs(jx - 195) < 1 && jy > 844 * 0.7, `anchor=${f(jx)},${f(jy)}`);

fire(canvasHandlers, 'pointerdown', { pointerId: 1, clientX: 195, clientY: 500, target: canvas });
fire(windowHandlers, 'pointerup', { pointerId: 1, clientX: 195, clientY: 500 });
check('tap starts the run', game.state === 'playing' && game.input.enabled, '');

fire(canvasHandlers, 'pointerdown', { pointerId: 2, clientX: jx, clientY: jy, target: canvas });
fire(windowHandlers, 'pointermove', { pointerId: 2, clientX: jx + 200, clientY: jy });
frames(1);
check('stick produces a full-strength axis', game.input.axis.x > 0.98, `axis=${f(game.input.axis.x, 2)}`);

const x0 = game.ship.x;
frames(240); // 2 seconds of thrust
check('ship flies right under touch input', game.ship.x - x0 > 500, `dx=${f(game.ship.x - x0)}`);
check('drive consumes power', game.ship.stats.power < CONFIG.systems.maxPower - 5,
  `power=${f(game.ship.stats.power)}`);
check('drive generates heat', game.ship.stats.heat > 5, `heat=${f(game.ship.stats.heat)}`);
check('corrosion is already creeping', game.ship.stats.coreCorrosion > 0,
  `${f(game.ship.stats.coreCorrosion, 3)}%`);
check('exhaust particles spawned', game.particles.liveCount > 0, `${game.particles.liveCount}`);

fire(windowHandlers, 'pointerup', { pointerId: 2, clientX: jx + 200, clientY: jy });
const vRelease = game.ship.speedValue;
frames(60);
check('ship keeps drifting after release', game.ship.speedValue > vRelease * 0.6,
  `${f(vRelease)} -> ${f(game.ship.speedValue)}`);
const hotBefore = game.ship.stats.heat;
frames(120); // another second of coasting
check('heat radiates away while coasting', game.ship.stats.heat < hotBefore, `${f(hotBefore)} -> ${f(game.ship.stats.heat)}`);
check('power recharges while coasting', game.ship.stats.power > 10, `${f(game.ship.stats.power)}`);

/* ------------------------------- weight ------------------------------------ */
fire(canvasHandlers, 'pointerdown', { pointerId: 3, clientX: jx, clientY: jy, target: canvas });
fire(windowHandlers, 'pointermove', { pointerId: 3, clientX: jx + 200, clientY: jy });
frames(2);
const accelEmpty = game.ship.currentAccel;
game.ship.stats.weight = game.ship.stats.maxWeight * 0.5;
frames(2);
const accelHalf = game.ship.currentAccel;
check('live weight change halves acceleration on the fly',
  Math.abs(accelHalf - accelEmpty * 0.5) < 5, `${f(accelEmpty)} -> ${f(accelHalf)}`);

game.ship.stats.weight = game.ship.stats.maxWeight;
frames(2);
check('a full hold produces zero thrust', game.ship.currentAccel === 0, `${f(game.ship.currentAccel)}`);

fire(windowHandlers, 'keydown', { code: 'KeyJ' }); // jettison
check('J jettisons a quarter of the hold',
  game.ship.stats.weight < game.ship.stats.maxWeight, `${f(game.ship.stats.weight)}`);
fire(windowHandlers, 'keyup', { code: 'KeyJ' });
fire(windowHandlers, 'pointerup', { pointerId: 3, clientX: jx + 200, clientY: jy });
frames(1);

/* ------------------------------- overheat ---------------------------------- */
game.ship.stats.weight = 0;
game.ship.generateHeat(game.ship.stats.maxHeat * 1.6);
frames(2);
check('overheating is detected', game.ship.isOverheating, `heat=${f(game.ship.stats.heat)}`);
check('overheating penalises thrust', game.systems.modifiers.thrustMul < 0.8,
  `thrustMul=${f(game.systems.modifiers.thrustMul, 3)}`);
check('HUD keeps rendering while redlined', (() => { frames(20); return true; })(), '');
game.ship.stats.heat = 0;

/* ------------------------------- meltdown ---------------------------------- */
let endEvents = 0;
let endReason = null;
game.events.on('run:end', (e) => { endEvents++; endReason = e.reason; });
game.ship.stats.coreCorrosion = 99.9;
game.ship.stats.corrosionRate = 2;
const particlesBefore = game.particles.liveCount;
frames(30);
check('meltdown ends the run', game.state === 'gameover' && endReason === 'meltdown', `${endReason}`);
check('run:end fired exactly once', endEvents === 1, `${endEvents}`);
check('meltdown freezes the gauges', game.ship.stats.coreCorrosion === 100, '');
check('meltdown spawns an explosion', game.particles.liveCount > particlesBefore + 100,
  `${game.particles.liveCount} particles`);
check('input is disabled on game over', game.input.enabled === false, '');
check('the wreck is hidden (debris only)', game.ship.visible === false, '');
check('camera shook on the explosion', game.camera.shakeAmount > 0, `${f(game.camera.shakeAmount, 1)}`);
check('game-over screen renders', (() => { frames(40); return true; })(), '');

/* ------------------------------- restart ----------------------------------- */
const oldSeed = game.world.seed;
fire(canvasHandlers, 'pointerdown', { pointerId: 9, clientX: 195, clientY: 400, target: canvas });
fire(windowHandlers, 'pointerup', { pointerId: 9, clientX: 195, clientY: 400 });
check('tap restarts the run', game.state === 'playing' && game.input.enabled, game.state);
check('restart generates a fresh sector', game.world.seed !== oldSeed, `${oldSeed} -> ${game.world.seed}`);
check('restart restores hull/power and clears corrosion + heat',
  game.ship.stats.hull === game.ship.stats.maxHull &&
  game.ship.stats.power === game.ship.stats.maxPower &&
  game.ship.stats.coreCorrosion === 0 && game.ship.stats.heat === 0 &&
  game.ship.stats.weight === 0, JSON.stringify(game.status()));
check('restart clears the meltdown latch', game.core.corrosion.melted === false, '');
check('restart repoints the HUD (minimap) at the new sector',
  game._renderInfo.world === game.world && game.updateContext.world === game.world, '');
check('the ship is visible again', game.ship.visible === true && game.ship.alive === true, '');

/* --------------------------- destroyed by damage --------------------------- */
game.ship.damage(game.ship.stats.maxHull * 2);
game.core.hull.events.emit('ship:destroyed', { ship: game.ship, source: 'debug' });
frames(2);
check('hull loss also ends the run', game.state === 'gameover' && game.endReason === 'destroyed', game.endReason);
frames(20);
fire(windowHandlers, 'keydown', { code: 'KeyR' });
check('R restarts from the game-over screen', game.state === 'playing', game.state);

/* ------------------------------- keyboard ---------------------------------- */
fire(windowHandlers, 'keydown', { code: 'KeyW' });
frames(1);
check('WASD drives the ship on desktop', game.input.axis.y < -0.9, `axis.y=${f(game.input.axis.y, 2)}`);
fire(windowHandlers, 'keyup', { code: 'KeyW' });
frames(1);
check('key release zeroes the axis', game.input.magnitude < 0.001, '');

/* ---------------------------- pause / debug keys --------------------------- */
fire(windowHandlers, 'keydown', { code: 'KeyP' });
const xPaused = game.ship.x;
frames(60);
check('P pauses and freezes the simulation', game.paused && game.ship.x === xPaused, '');
fire(windowHandlers, 'keydown', { code: 'KeyP' });
check('P resumes', game.paused === false, '');

fire(windowHandlers, 'keydown', { code: 'Digit2' });
check('debug key adds cargo mass', game.ship.stats.weight > 0, `${f(game.ship.stats.weight)}`);
fire(windowHandlers, 'keydown', { code: 'Digit1' });
check('debug key adds heat', game.ship.stats.heat > 0, `${f(game.ship.stats.heat)}`);
fire(windowHandlers, 'keydown', { code: 'Digit4' });
check('debug key drains power', game.ship.stats.power < game.ship.stats.maxPower, `${f(game.ship.stats.power)}`);
fire(windowHandlers, 'keydown', { code: 'Digit0' });
check('debug key services the ship',
  game.ship.stats.heat === 0 && game.ship.stats.weight === 0 &&
  game.ship.stats.power === game.ship.stats.maxPower && game.ship.stats.hull === game.ship.stats.maxHull, '');

/* --------------------------- resize / orientation -------------------------- */
canvas.clientWidth = 844;
canvas.clientHeight = 390;
fire(windowHandlers, 'resize', {});
frames(2);
check('handles rotation to landscape',
  game.viewport.width === 844 && game.joystick.centerY < 390, `vp=${game.viewport.width}x${game.viewport.height}`);
canvas.clientWidth = 390;
canvas.clientHeight = 844;
fire(windowHandlers, 'resize', {});
frames(2);

/* --------------------- stress: every gauge in every state ------------------ */
let renderError = null;
try {
  for (const fill of [0, 0.5, 1]) {
    game.ship.stats.heat = game.ship.stats.maxHeat * 2 * fill;
    game.ship.stats.corrosionRate = fill * 5;
    game.ship.stats.weight = game.ship.stats.maxWeight * fill;
    game.ship.stats.power = game.ship.stats.maxPower * (1 - fill);
    game.ship.stats.hull = game.ship.stats.maxHull * (1 - fill * 0.9);
    for (let i = 0; i < 120; i++) {
      game.update(STEP);
      game.render((i % 10) / 10, 1 / 60);
    }
  }
} catch (e) {
  renderError = e;
}
check('360 frames across every gauge state render cleanly', renderError === null,
  renderError ? String(renderError) : '');

/* ------------------------------ HUD contract ------------------------------ */
{
  const p = CONFIG.palette;
  game.state = 'playing';
  game.ship.visible = true;
  // Non-zero so every bar has something to paint (empty gauges draw no fill).
  game.ship.stats.heat = 40;
  game.ship.stats.coreCorrosion = 25;
  game.ship.stats.weight = 0;
  game.ship.stats.power = game.ship.stats.maxPower;
  game.ship.stats.hull = game.ship.stats.maxHull;

  let calls = captureFrame();
  let labels = texts(calls);
  let colors = fillColors(calls);

  const wanted = [
    ['HULL', p.gaugeHull],
    ['POWER', p.gaugePower],
    ['HEAT', p.gaugeHeat],
    ['CORROSION', p.gaugeCorrosion],
  ];
  for (const [label, color] of wanted) {
    const row = labels.find((l) => l.text === label);
    const bar = colors.includes(color);
    check(`HUD draws the ${label} bar in ${color}`,
      !!row && bar && row.y < game.viewport.height * 0.25,
      row ? `label at ${f(row.x)},${f(row.y)}` : 'label missing');
  }

  const barRows = wanted.map(([label]) => labels.find((l) => l.text === label)).filter(Boolean);
  check('the four gauges are stacked in order at the top of the screen',
    barRows.length === 4 &&
    barRows[0].y < barRows[1].y && barRows[1].y < barRows[2].y && barRows[2].y < barRows[3].y &&
    barRows[3].y < 200,
    barRows.map((r) => f(r.y)).join(' < '));
  check('all four gauge labels share the same left edge (aligned)',
    new Set(barRows.map((r) => f(r.x))).size === 1, barRows.map((r) => f(r.x)).join(','));
  check('mass readout is shown (weight is a stat, not a bar)',
    labels.some((l) => l.text === 'MASS'), '');
  check('an empty gauge draws no fill at all', (() => {
    game.ship.stats.heat = 0;
    game.ship.stats.coreCorrosion = 0;
    const c = fillColors(captureFrame());
    game.ship.stats.heat = 40;
    game.ship.stats.coreCorrosion = 25;
    return !c.includes(p.gaugeHeat) && !c.includes(p.gaugeCorrosion);
  })(), '');

  // Overheating: the heat bar switches to the critical colour + warning text.
  game.ship.stats.heat = game.ship.stats.maxHeat * 1.4;
  calls = captureFrame();
  labels = texts(calls);
  colors = fillColors(calls);
  check('heat bar turns critical past maxHeat',
    colors.includes(p.gaugeCritical) && !colors.includes(p.gaugeHeat), '');
  check('OVERHEAT warning is displayed',
    labels.some((l) => /CORE OVERHEAT/.test(l.text)), '');

  // Meltdown warning.
  game.ship.stats.heat = 0;
  game.ship.stats.coreCorrosion = 90;
  calls = captureFrame();
  labels = texts(calls);
  check('MELTDOWN IMMINENT warning at high corrosion',
    labels.some((l) => /MELTDOWN IMMINENT/.test(l.text)), '');
  game.ship.stats.coreCorrosion = 0;

  // Overload warning at full hold.
  game.ship.stats.weight = game.ship.stats.maxWeight;
  calls = captureFrame();
  check('OVERLOAD / zero-thrust warning at full hold',
    texts(calls).some((l) => /HOLD FULL|OVERLOAD/.test(l.text)), '');
  game.ship.stats.weight = 0;

  // Game-over overlay text.
  game._endRun('meltdown');
  calls = captureFrame();
  check('game-over screen shows the meltdown banner + restart prompt',
    texts(calls).some((l) => l.text === 'CORE MELTDOWN') &&
    texts(calls).some((l) => /TAP TO RESTART/.test(l.text)), '');
  game.restart();
  check('recovered back to a playable state after the HUD probes', game.state === 'playing', game.state);
}

/* ------------------------------- blur safety ------------------------------- */
fire(windowHandlers, 'keydown', { code: 'KeyD' });
fire(windowHandlers, 'blur', {});
frames(1);
check('blur drops held keys', game.input.magnitude < 0.001, '');

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures ? 1 : 0);
