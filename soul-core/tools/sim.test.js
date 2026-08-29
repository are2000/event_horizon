// Headless smoke tests for Soul Core phase 2 (pure simulation, no DOM).
//   node tools/sim.test.js
import { Ship } from '../src/entities/Ship.js';
import { World } from '../src/world/World.js';
import { ParticleSystem } from '../src/fx/ParticleSystem.js';
import { SystemsManager } from '../src/systems/SystemsManager.js';
import { EventBus } from '../src/core/EventBus.js';
import { Camera } from '../src/core/Camera.js';
import { WeightSystem } from '../src/systems/WeightSystem.js';
import { DriveSystem } from '../src/systems/DriveSystem.js';
import { PowerSystem } from '../src/systems/PowerSystem.js';
import { HeatSystem } from '../src/systems/HeatSystem.js';
import { CorrosionSystem } from '../src/systems/CorrosionSystem.js';
import { HullSystem } from '../src/systems/HullSystem.js';
import { CONFIG } from '../src/config.js';

const STEP = CONFIG.loop.fixedStep;
const viewport = {
  width: 400, height: 800, dpr: 2,
  centerX: 200, centerY: 400,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
};

let failures = 0;
const f = (n, d = 1) => n.toFixed(d);
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** Build a ship + the six core systems, wired exactly like Game does. */
function makeRig(worldOpts = { obstacleCount: 0 }, { corrosionRate } = {}) {
  const world = new World({ seed: 7, ...worldOpts });
  const ship = new Ship({ x: world.width / 2, y: world.height / 2 });
  if (corrosionRate !== undefined) ship.stats.corrosionRate = corrosionRate;
  const events = new EventBus();
  const systems = new SystemsManager(ship, events);
  const core = {
    weight: new WeightSystem(),
    drive: new DriveSystem(),
    power: new PowerSystem(),
    heat: new HeatSystem(),
    corrosion: new CorrosionSystem(),
    hull: new HullSystem(),
  };
  for (const key of ['weight', 'drive', 'power', 'heat', 'corrosion', 'hull']) systems.install(core[key]);

  const particles = new ParticleSystem(256);
  const camera = new Camera(viewport);
  camera.setBounds(world.bounds.x, world.bounds.y, world.bounds.width, world.bounds.height);
  camera.snapTo(ship.x, ship.y);

  const input = { axis: { x: 0, y: 0 }, magnitude: 0 };
  const ctx = { input, world, particles, camera, events, systems, time: 0, dt: STEP };
  let t = 0;

  const rig = {
    world, ship, events, systems, particles, camera, input, core, t,
    run(seconds) {
      const steps = Math.round(seconds / STEP);
      for (let i = 0; i < steps; i++) {
        t += STEP;
        ctx.time = t;
        input.magnitude = Math.hypot(input.axis.x, input.axis.y);
        systems.update(STEP);
        ship.update(STEP, ctx);
        world.update(STEP);
        particles.update(STEP);
        camera.update(STEP, { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy });
      }
      rig.t = t;
    },
    aim(x, y) { input.axis.x = x; input.axis.y = y; },
    place(x, y, angle = 0) { ship.teleport(x, y, angle); ship.vx = 0; ship.vy = 0; },
  };
  return rig;
}

/* ============================ 1. flight model ============================= */
{
  const r = makeRig();
  r.aim(1, 0);
  r.run(0.5);
  const v05 = r.ship.speedValue;
  r.run(3.5);
  const v40 = r.ship.speedValue;
  check('accelerates under thrust', v05 > 300, `v(0.5s)=${f(v05)}`);
  check('asymptotes to rated cruise speed', v40 > CONFIG.ship.maxSpeed * 0.9 && v40 < CONFIG.ship.softMaxSpeed,
    `v(4s)=${f(v40)} / target ${CONFIG.ship.maxSpeed}`);

  r.aim(0, 0);
  const vTop = r.ship.speedValue;
  r.run(0.25);
  const vQuarter = r.ship.speedValue;
  r.run(9.75);
  const v10 = r.ship.speedValue;
  check('does NOT stop instantly (inertia)', vQuarter > vTop * 0.8, `${f(vTop)} -> ${f(vQuarter)} after 0.25s`);
  check('eventually coasts to a stop', v10 < vTop * 0.08, `${f(v10)} after 10s`);
}

/* ====================== 2. WEIGHT -> acceleration ========================= */
{
  const cfg = CONFIG.systems;
  const thrust = CONFIG.ship.engineThrust;

  const measure = (weight) => {
    const r = makeRig();
    r.ship.stats.weight = weight;
    r.aim(1, 0);
    r.run(0.5); // let the throttle ramp up (throttle is smoothed)
    return { accel: r.ship.currentAccel, turn: r.ship.turnRate * r.systems.modifiers.turnRateMul };
  };

  const empty = measure(0);
  const half = measure(cfg.maxWeight * 0.5);
  const full = measure(cfg.maxWeight);

  // SPEC: Actual Acceleration = EngineThrust * (1 - currentWeight / maxWeight)
  check('empty hold -> full engine thrust', near(empty.accel, thrust, 1), `${f(empty.accel)} vs ${thrust}`);
  check('50% load -> half acceleration', near(half.accel, thrust * 0.5, 1), `${f(half.accel)} vs ${f(thrust * 0.5)}`);
  check('100% load -> zero acceleration (spec formula)', full.accel === 0, `${f(full.accel)}`);
  check('turn rate scales with the same load factor',
    near(half.turn, empty.turn * 0.5, 0.01) && full.turn === 0,
    `empty=${f(empty.turn, 2)} half=${f(half.turn, 2)} full=${f(full.turn, 2)}`);

  // And it must actually show up in the sim, not just the modifiers.
  const rFull = makeRig();
  rFull.ship.stats.weight = cfg.maxWeight;
  rFull.aim(1, 0);
  rFull.run(3);
  check('a fully laden ship cannot get moving', rFull.ship.speedValue < 1, `v=${f(rFull.ship.speedValue, 2)}`);

  const timeToSpeed = (weight, target = 300) => {
    const rig = makeRig();
    rig.ship.stats.weight = weight;
    rig.aim(1, 0);
    let t = 0;
    while (rig.ship.speedValue < target && t < 10) { rig.run(STEP); t += STEP; }
    return t;
  };
  const tEmpty = timeToSpeed(0);
  const tHalf = timeToSpeed(cfg.maxWeight * 0.5);
  check('half load takes ~2x as long to get up to speed', tHalf > tEmpty * 1.6,
    `empty=${f(tEmpty, 2)}s half=${f(tHalf, 2)}s`);

  // Cargo API
  const r = makeRig();
  const loaded = r.core.weight.addCargo(40);
  check('addCargo loads the hold', loaded === 40 && r.ship.stats.weight === 40, `${f(r.ship.stats.weight)}`);
  let overflowed = 0;
  r.events.on('cargo:overflow', (e) => { overflowed += e.amount; });
  r.core.weight.addCargo(999);
  check('cargo is clamped at capacity + emits overflow',
    r.ship.stats.weight === cfg.maxWeight && overflowed > 0, `overflow=${f(overflowed)}`);
  const dropped = r.core.weight.jettison(60);
  check('jettison dumps mass', dropped === 60 && r.ship.stats.weight === 40, `${f(r.ship.stats.weight)}`);
}

/* ===================== 3. POWER: consumption + brownout =================== */
{
  const r = makeRig();
  const cfg = CONFIG.systems;
  check('capacitor starts full', r.ship.powerRatio === 1, '');

  r.aim(1, 0);
  r.run(4);
  const drained = r.ship.stats.power;
  check('thrusting drains the capacitor', drained < cfg.maxPower - 5, `power=${f(drained)}`);

  // Hold full throttle long past empty: the drive should brown out.
  r.run(14);
  check('capacitor bottoms out', r.ship.stats.power < 3, `power=${f(r.ship.stats.power, 2)}`);
  check('empty capacitor browns the drive out', r.core.drive.brownout > 0.25,
    `brownout=${f(r.core.drive.brownout, 2)} (duty ~${f(1 - r.core.drive.brownout, 2)})`);
  check('brownout cuts thrust (drive only gets what the reactor can supply)',
    r.systems.modifiers.thrustMul < 0.85 && r.systems.modifiers.thrustMul > 0.4,
    `thrustMul=${f(r.systems.modifiers.thrustMul, 3)}`);

  // Coasting recharges.
  r.aim(0, 0);
  r.run(3);
  check('coasting recharges the capacitor', r.ship.stats.power > 20, `power=${f(r.ship.stats.power)}`);

  // consumePower() API semantics: never overdraft.
  const r2 = makeRig();
  const got = r2.ship.consumePower(r2.ship.stats.maxPower * 2);
  check('consumePower never overdrafts', got === r2.ship.stats.maxPower && r2.ship.stats.power === 0, `got=${f(got)}`);
}

/* ======================= 4. HEAT: generation + cooling ==================== */
{
  const r = makeRig();
  const cfg = CONFIG.systems;

  r.aim(1, 0);
  r.run(4);
  check('thrusting generates heat', r.ship.stats.heat > 5, `heat=${f(r.ship.stats.heat)}`);

  r.aim(0, 0);
  r.run(0.5); // let the (smoothed) throttle fall to zero first
  const beforeCool = r.ship.stats.heat;
  r.run(1);
  const cooled = beforeCool - r.ship.stats.heat;
  check('heat dissipates at coolingRate', near(cooled, cfg.coolingRate, 0.6),
    `${f(cooled, 2)}/s vs coolingRate ${cfg.coolingRate}`);
  r.run(6);
  check('heat returns to zero when coasting', r.ship.stats.heat === 0, `${f(r.ship.stats.heat, 2)}`);

  // Overheat: push past maxHeat and confirm the movement penalty.
  const thrustBefore = r.systems.modifiers.thrustMul;
  r.ship.generateHeat(r.ship.stats.maxHeat * 1.05); // just past the redline
  r.systems.update(STEP);
  check('generateHeat pushes past maxHeat', r.ship.isOverheating, `heat=${f(r.ship.stats.heat)}`);
  check('overheating applies a movement penalty', r.systems.modifiers.thrustMul < thrustBefore - 0.1,
    `${f(thrustBefore, 2)} -> ${f(r.systems.modifiers.thrustMul, 2)}`);

  const mild = r.systems.modifiers.thrustMul;
  r.ship.generateHeat(r.ship.stats.maxHeat * (cfg.heatCeiling - 1)); // deep redline
  r.systems.update(STEP);
  check('deeper redline = harsher penalty', r.systems.modifiers.thrustMul < mild - 0.05,
    `${f(mild, 2)} -> ${f(r.systems.modifiers.thrustMul, 2)}`);
  check('heat is clamped to the redline ceiling',
    r.ship.stats.heat <= r.ship.stats.maxHeat * cfg.heatCeiling + 1e-6, `${f(r.ship.stats.heat)}`);

  // Overheating must be *felt*, not just measured: compare the launch from rest.
  const hot = makeRig();
  hot.ship.generateHeat(hot.ship.stats.maxHeat * 1.5);
  hot.aim(1, 0);
  hot.run(0.5);
  const cold = makeRig();
  cold.aim(1, 0);
  cold.run(0.5);
  check('an overheating ship accelerates slower', hot.ship.speedValue < cold.ship.speedValue * 0.9,
    `hot=${f(hot.ship.speedValue)} cold=${f(cold.ship.speedValue)}`);
}

/* ==================== 5. CORROSION -> meltdown ============================ */
{
  const cfg = CONFIG.systems;
  const r = makeRig();
  r.run(10);
  check('corrosion creeps up over time', near(r.ship.stats.coreCorrosion, cfg.corrosionRate * 10, 0.2),
    `${f(r.ship.stats.coreCorrosion, 2)}% after 10s (rate ${cfg.corrosionRate}/s)`);

  // Overheating accelerates the decay.
  const hot = makeRig();
  hot.ship.generateHeat(hot.ship.stats.maxHeat * cfg.heatCeiling);
  hot.run(10);
  check('overheating accelerates corrosion',
    hot.ship.stats.coreCorrosion > r.ship.stats.coreCorrosion * 1.5,
    `hot=${f(hot.ship.stats.coreCorrosion, 2)}% vs cool=${f(r.ship.stats.coreCorrosion, 2)}%`);
  hot.ship.stats.heat = 0;
  hot.run(5);
  check('cooling down slows corrosion back to base rate',
    hot.core.corrosion.currentRate < cfg.corrosionRate * 1.05, `${f(hot.core.corrosion.currentRate, 3)}/s`);

  // Meltdown fires once, at 100%.
  let meltdowns = 0;
  let warnings = 0;
  const r2 = makeRig();
  r2.events.on('ship:meltdown', () => meltdowns++);
  r2.events.on('corrosion:warning', () => warnings++);
  r2.ship.stats.corrosionRate = 20;
  r2.run(10);
  check('meltdown fires exactly once at 100%', meltdowns === 1, `${meltdowns} events`);
  check('corrosion is clamped at 100', r2.ship.stats.coreCorrosion === 100, `${f(r2.ship.stats.coreCorrosion)}`);
  check('warning fires before meltdown', warnings === 1, `${warnings}`);
  check('meltdown latches (no repeat events)', r2.core.corrosion.melted === true, '');
}

/* ======================== 6. HULL: damage + death ========================= */
{
  const cfg = CONFIG.systems;
  const r = makeRig({ obstacleCount: 80 });
  const rock = r.world.obstacles[0];

  let destroyed = 0;
  let damaged = 0;
  r.events.on('ship:destroyed', () => destroyed++);
  r.events.on('ship:damaged', () => damaged++);

  r.place(rock.x - rock.radius - 320, rock.y, 0);
  r.aim(1, 0);
  r.run(1.2);
  check('crashing damages the hull', r.ship.stats.hull < cfg.maxHull, `hull=${f(r.ship.stats.hull)}`);
  check('damage events fire', damaged > 0, `${damaged}`);
  check('collision still resolves physically',
    Math.hypot(r.ship.x - rock.x, r.ship.y - rock.y) >= rock.radius + r.ship.radius - 0.5, '');

  // Slow bumps are harmless: drift into a rock, don't fly into it.
  const soft = makeRig({ obstacleCount: 80 });
  const rock2 = soft.world.obstacles[1];
  soft.place(rock2.x - rock2.radius - 90, rock2.y, 0);
  soft.ship.vx = 90; // a gentle nudge, well under impactDamageMinSpeed
  soft.run(3);
  // The bounce reversed our velocity, which proves contact happened.
  const bounced = soft.ship.vx < 0;
  check('a gentle bump is survivable (and still collides)',
    soft.ship.stats.hull === cfg.maxHull && bounced,
    `hull=${f(soft.ship.stats.hull)} bounced=${bounced} vx=${f(soft.ship.vx)}`);

  // Thermal damage while redlined.
  const hot = makeRig();
  hot.ship.generateHeat(hot.ship.stats.maxHeat * cfg.heatCeiling);
  hot.run(2);
  check('redlining burns the hull',
    hot.ship.stats.hull < cfg.maxHull && hot.ship.stats.hull > cfg.maxHull - 12,
    `hull=${f(hot.ship.stats.hull)} after 2s`);

  // Hull reaching zero ends the ship.
  const dead = makeRig();
  dead.ship.damage(cfg.maxHull + 10);
  check('hull clamps at 0 and marks the ship dead',
    dead.ship.stats.hull === 0 && dead.ship.alive === false, `hull=${f(dead.ship.stats.hull)}`);

  const dying = makeRig();
  dying.events.on('ship:destroyed', () => destroyed++);
  dying.ship.stats.hull = 1;
  dying.ship.generateHeat(dying.ship.stats.maxHeat * cfg.heatCeiling);
  dying.run(2);
  check('hull reaching 0 emits ship:destroyed', destroyed >= 1, `${destroyed}`);
}

/* ==================== 7. systems interact, not fight ====================== */
{
  const r = makeRig();
  r.ship.stats.weight = CONFIG.systems.maxWeight * 0.4; // 0.6 load factor
  r.ship.generateHeat(r.ship.stats.maxHeat * 1.5); // partial redline
  r.ship.consumePower(r.ship.stats.maxPower); // empty capacitor
  r.aim(1, 0);
  r.run(1);
  const m = r.systems.modifiers;
  check('weight x brownout x overheat all stack',
    m.thrustMul < 0.6 * 0.6 * 0.9 && m.thrustMul > 0,
    `thrustMul=${f(m.thrustMul, 3)}`);
  check('systems.explain() names every contributor',
    /weight/.test(r.systems.explain('thrustMul')) &&
    /drive/.test(r.systems.explain('thrustMul')) &&
    /heat/.test(r.systems.explain('thrustMul')),
    r.systems.explain('thrustMul'));
  check('no gauge escapes its range',
    r.ship.stats.heat >= 0 && r.ship.stats.power >= 0 &&
    r.ship.stats.hull >= 0 && r.ship.stats.coreCorrosion <= 100, '');
}

/* ================ 8. framerate independence + determinism ================= */
{
  const results = [];
  for (const step of [1 / 240, 1 / 120, 1 / 60]) {
    const world = new World({ seed: 3, obstacleCount: 0 });
    const ship = new Ship({ x: world.width / 2, y: world.height / 2 });
    const systems = new SystemsManager(ship, new EventBus());
    systems.install(new WeightSystem());
    systems.install(new DriveSystem());
    systems.install(new PowerSystem());
    systems.install(new HeatSystem());
    systems.install(new CorrosionSystem());
    systems.install(new HullSystem());
    const input = { axis: { x: 1, y: 0 }, magnitude: 1 };
    const ctx = { input, world, particles: null, camera: null, events: null, systems, time: 0, dt: step };
    for (let i = 0; i < Math.round(2 / step); i++) {
      systems.update(step);
      ship.update(step, ctx);
    }
    results.push({ v: ship.speedValue, heat: ship.stats.heat, corr: ship.stats.coreCorrosion });
  }
  const spread = (k) => Math.max(...results.map((r) => r[k])) - Math.min(...results.map((r) => r[k]));
  check('same flight at 240/120/60 Hz', spread('v') < 12, `spread=${f(spread('v'))} u/s`);
  check('same heat at 240/120/60 Hz', spread('heat') < 1.5, `spread=${f(spread('heat'), 2)}`);
  check('same corrosion at 240/120/60 Hz', spread('corr') < 0.05, `spread=${f(spread('corr'), 3)}%`);

  const sig = (seed) => new World({ seed, obstacleCount: 40 })
    .obstacles.map((o) => `${o.x.toFixed(3)}|${o.y.toFixed(3)}`).join(',');
  check('world generation is deterministic for a seed', sig(42) === sig(42), '');
  check('different seeds produce different sectors', sig(42) !== sig(43), '');
}

/* ===================== 9. explode / reset / long run ====================== */
{
  const r = makeRig({ obstacleCount: 120 });
  r.aim(0.6, -0.8);
  r.run(60); // a full minute of chaotic flight
  const state = [r.ship.x, r.ship.y, r.ship.vx, r.ship.vy, r.ship.angle,
    r.camera.x, r.camera.y, r.ship.stats.heat, r.ship.stats.coreCorrosion];
  check('60s of chaotic flight stays finite', state.every(Number.isFinite), '');
  check('base corrosion rate is a slow burn (~21% a minute)',
    r.ship.stats.coreCorrosion > 15 && r.ship.stats.coreCorrosion < 70,
    `${f(r.ship.stats.coreCorrosion)}% after 60s`);
  check('particles stay bounded', r.particles.liveCount <= r.particles.capacity, `${r.particles.liveCount}`);

  // A fast-decay run reaches meltdown inside a minute (the real game-over path).
  const fast = makeRig({ obstacleCount: 40 }, { corrosionRate: 3 });
  let ended = 0;
  fast.events.on('ship:meltdown', () => ended++);
  fast.aim(1, 0);
  fast.run(45);
  check('a full run ends in meltdown', ended === 1 && fast.ship.stats.coreCorrosion === 100,
    `${f(fast.ship.stats.coreCorrosion)}% after 45s at 3%/s`);

  // Ship.reset() = factory fresh, ratings preserved.
  r.ship.stats.maxPower = 250; // pretend it's a meta upgrade
  r.ship.reset(10, 20);
  check('reset restores hull/power and clears the gauges',
    r.ship.stats.hull === r.ship.stats.maxHull &&
    r.ship.stats.power === 250 &&
    r.ship.stats.coreCorrosion === 0 &&
    r.ship.stats.heat === 0 &&
    r.ship.stats.weight === 0 &&
    r.ship.x === 10 && r.ship.alive === true,
    '');
  check('reset keeps purchased ratings', r.ship.stats.maxPower === 250, '');
  r.systems.reset();
  check('systems.reset() clears meltdown latch', r.core.corrosion.melted === false, '');
  r.aim(1, 0);
  r.run(2);
  check('a reset ship flies again', r.ship.speedValue > 100, `v=${f(r.ship.speedValue)}`);
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures ? 1 : 0);
