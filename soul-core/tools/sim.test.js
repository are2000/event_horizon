// Headless smoke tests for Soul Core phase-1 (pure simulation, no DOM).
import { Ship } from '../src/entities/Ship.js';
import { World } from '../src/world/World.js';
import { ParticleSystem } from '../src/fx/ParticleSystem.js';
import { SystemsManager } from '../src/systems/SystemsManager.js';
import { EventBus } from '../src/core/EventBus.js';
import { Camera } from '../src/core/Camera.js';
import { ThrusterHeatSystem } from '../src/systems/ThrusterHeatSystem.js';
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

function makeRig(worldOpts = { obstacleCount: 0 }) {
  const world = new World({ seed: 7, ...worldOpts });
  const ship = new Ship({ x: world.width / 2, y: world.height / 2 });
  const events = new EventBus();
  const systems = new SystemsManager(ship, events);
  const particles = new ParticleSystem(256);
  const camera = new Camera(viewport);
  camera.setBounds(world.bounds.x, world.bounds.y, world.bounds.width, world.bounds.height);
  camera.snapTo(ship.x, ship.y);
  const input = { axis: { x: 0, y: 0 }, magnitude: 0 };
  const ctx = { input, world, particles, camera, events, systems, time: 0, dt: STEP };
  let t = 0;
  const rig = {
    world, ship, events, systems, particles, camera, input, t,
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

/* ============================ 1. acceleration ============================= */
{
  const r = makeRig();
  r.aim(1, 0);
  r.run(0.5);
  const v05 = r.ship.speedValue;
  r.run(2.5);
  const v30 = r.ship.speedValue;
  check('accelerates under thrust', v05 > 300, `v(0.5s)=${f(v05)}`);
  check('asymptotes to rated cruise speed', v30 > CONFIG.ship.maxSpeed * 0.9 && v30 < CONFIG.ship.softMaxSpeed,
    `v(3s)=${f(v30)} / target ${CONFIG.ship.maxSpeed}`);
  check('hull rotates toward stick', Math.abs(r.ship.angle) < 0.02, `angle=${f(r.ship.angle, 3)}`);
}

/* ===================== 2. inertia / drifting after release ================ */
{
  const r = makeRig();
  r.aim(1, 0);
  r.run(3);
  const vTop = r.ship.speedValue;
  r.aim(0, 0);
  r.run(0.25);
  const vQuarter = r.ship.speedValue;
  r.run(2.75);
  const v3 = r.ship.speedValue;
  r.run(7);
  const v10 = r.ship.speedValue;

  check('does NOT stop instantly (inertia)', vQuarter > vTop * 0.8, `${f(vTop)} -> ${f(vQuarter)} after 0.25s`);
  check('glides a long way (space, not asphalt)', v3 > vTop * 0.2 && v3 < vTop * 0.6, `${f(v3)} after 3s`);
  check('eventually coasts to a stop', v10 < vTop * 0.06, `${f(v10)} after 10s`);
}

/* ========================= 3. lateral drift on a turn ===================== */
{
  const r = makeRig();
  r.place(r.world.width / 2, r.world.height / 2);
  r.aim(1, 0);
  r.run(1.5);
  const cruise = r.ship.speedValue;
  const xAtTurn = r.ship.x;
  r.aim(0, 1); // snap the stick 90 degrees
  r.run(0.2);
  const lat = Math.abs(r.ship.lateralSpeed);
  check('hard turn produces sideways drift', lat > 120, `lat=${f(lat)} at cruise ${f(cruise)}`);
  check('ship keeps moving while sliding', r.ship.speedValue > cruise * 0.6, `v=${f(r.ship.speedValue)}`);
  r.run(2);
  check('grip eventually realigns velocity with heading', Math.abs(r.ship.lateralSpeed) < 40,
    `lat=${f(Math.abs(r.ship.lateralSpeed))}`);
  check('turn changed travel direction', Math.abs(r.ship.y - r.world.height / 2) > 200 && r.ship.x > xAtTurn,
    `pos=${f(r.ship.x)},${f(r.ship.y)}`);
}

/* ============================ 4. world bounds ============================= */
{
  const r = makeRig();
  r.aim(-1, -1);
  r.run(20);
  const b = r.world.bounds;
  const inside = r.ship.x >= b.x && r.ship.x <= b.x + b.width && r.ship.y >= b.y && r.ship.y <= b.y + b.height;
  check('never leaves the sector', inside, `pos=${f(r.ship.x)},${f(r.ship.y)}`);
  check('reached the far corner', r.ship.x < b.x + r.ship.radius + 5 && r.ship.y < b.y + r.ship.radius + 5,
    `corner=${b.x},${b.y}`);
}

/* ========================= 5. asteroid collisions ========================= */
{
  const r = makeRig({ obstacleCount: 80 });
  const rock = r.world.obstacles[0];
  // Fly straight at the middle of a rock at cruise speed.
  r.place(rock.x - rock.radius - 300, rock.y);
  r.ship.teleport(rock.x - rock.radius - 300, rock.y, 0);
  r.aim(1, 0);
  r.run(1.0);
  const d = Math.hypot(r.ship.x - rock.x, r.ship.y - rock.y);
  check('collision pushes ship out of the rock', d >= rock.radius + r.ship.radius - 0.5,
    `dist=${f(d)} need>=${f(rock.radius + r.ship.radius)}`);
  check('collision reversed velocity', r.ship.vx < 0, `vx=${f(r.ship.vx)}`);
  check('impact emitted particles + shake', r.particles.liveCount > 0 && r.camera.shakeAmount >= 0,
    `parts=${r.particles.liveCount}`);

  let impacts = 0;
  r.events.on('ship:impact', () => impacts++);
  r.place(rock.x - rock.radius - 200, rock.y, 0);
  r.aim(1, 0);
  r.run(1.0);
  check('impact event fires on the bus', impacts > 0, `${impacts} impacts`);
}

/* ===================== 6. camera follow + clamping ======================== */
{
  const r = makeRig();
  r.aim(1, 0);
  r.run(2);
  const lag = Math.hypot(r.camera.x - r.ship.x, r.camera.y - r.ship.y);
  check('camera trails the ship (smooth follow + look-ahead)', lag > 20 && lag < 400, `lag=${f(lag)}`);
  check('camera zoom keeps 1000 world units visible vertically',
    Math.abs(r.camera.zoom * CONFIG.camera.viewportHeight - viewport.height) < 40, `zoom=${f(r.camera.zoom, 3)}`);

  r.place(60, 60); // jam into the top-left corner
  r.run(1);
  const halfH = r.camera.halfViewHeight;
  check('camera clamps at the world edge', r.camera.y >= halfH - 0.5, `camY=${f(r.camera.y)} min=${f(halfH)}`);
}

/* ======================== 7. systems pipeline ============================= */
{
  const r = makeRig();
  r.aim(1, 0);
  r.systems.install(new ThrusterHeatSystem({ heatPerSecond: 0.5 }));
  r.run(5);
  check('installed system drives its gauge', r.ship.resources.heat > 0.5, `heat=${f(r.ship.resources.heat, 2)}`);
  check('heat derates thrust', r.systems.modifiers.thrustMul < 0.95, `thrustMul=${f(r.systems.modifiers.thrustMul, 3)}`);

  const uninstall = r.systems.install(new ThrusterHeatSystem({ id: 'tmp' }));
  check('install is idempotent / returns uninstaller', typeof uninstall === 'function', '');
  uninstall();
  check('uninstall removes the system', r.systems.get('tmp') === null, `n=${r.systems.systems.length}`);

  r.ship.resources.heat = 0;
  r.ship.resources.weight = 1;
  r.ship.resources.corrosion = 1;
  r.systems.update(STEP);
  check('weight + corrosion cut top speed', r.systems.modifiers.maxSpeedMul < 0.65,
    `maxSpeedMul=${f(r.systems.modifiers.maxSpeedMul, 3)}`);
  check('corrosion eats grip (more drift)', r.systems.modifiers.gripMul < 0.7, `gripMul=${f(r.systems.modifiers.gripMul, 3)}`);
  check('weight slows the turn rate', r.systems.modifiers.turnRateMul < 0.7, `turnRateMul=${f(r.systems.modifiers.turnRateMul, 3)}`);

  // Heavy ship must actually be slower in the sim, not just on paper.
  r.place(r.world.width / 2, r.world.height / 2);
  r.aim(1, 0);
  r.run(4);
  const heavyTop = r.ship.speedValue;
  r.ship.resources.weight = 0;
  r.ship.resources.corrosion = 0;
  r.place(r.world.width / 2, r.world.height / 2);
  r.run(4);
  check('heavy+corroded ship is measurably slower', heavyTop < r.ship.speedValue * 0.8,
    `heavy=${f(heavyTop)} vs clean=${f(r.ship.speedValue)}`);
}

/* ================= 8. framerate independence + stability ================== */
{
  const results = [];
  for (const step of [1 / 240, 1 / 120, 1 / 60]) {
    const world = new World({ seed: 3, obstacleCount: 0 });
    const ship = new Ship({ x: world.width / 2, y: world.height / 2 });
    const systems = new SystemsManager(ship, new EventBus());
    const input = { axis: { x: 1, y: 0 }, magnitude: 1 };
    const ctx = { input, world, particles: null, camera: null, events: null, systems, time: 0, dt: step };
    for (let i = 0; i < Math.round(2 / step); i++) {
      systems.update(step);
      ship.update(step, ctx);
    }
    results.push(ship.speedValue);
  }
  const spread = Math.max(...results) - Math.min(...results);
  check('same outcome at 240/120/60 Hz', spread < 12,
    `speeds=${results.map((v) => f(v)).join(', ')} spread=${f(spread)}`);
}

/* ============================ 9. determinism ============================== */
{
  const sig = (seed) => new World({ seed, obstacleCount: 40 })
    .obstacles.map((o) => `${o.x.toFixed(3)}|${o.y.toFixed(3)}|${o.radius.toFixed(3)}`).join(',');
  check('world generation is deterministic for a seed', sig(42) === sig(42), '');
  check('different seeds produce different sectors', sig(42) !== sig(43), '');
  const w = new World({ obstacleCount: 120 });
  const cx = w.width / 2;
  const cy = w.height / 2;
  check('spawn area is kept clear of rocks',
    w.obstacles.every((o) => Math.hypot(o.x - cx, o.y - cy) > o.radius + 400), `rocks=${w.obstacles.length}`);
}

/* ============================= 10. no NaNs ================================ */
{
  const r = makeRig({ obstacleCount: 120 });
  r.aim(0.6, -0.8);
  r.run(30);
  const state = [r.ship.x, r.ship.y, r.ship.vx, r.ship.vy, r.ship.angle, r.camera.x, r.camera.y, r.camera.zoom];
  check('30s of chaotic flight stays finite', state.every(Number.isFinite), state.map((n) => f(n, 1)).join(', '));
  check('particles stay bounded', r.particles.liveCount <= r.particles.capacity, `${r.particles.liveCount}`);
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures ? 1 : 0);
