// Combat tests: mounts, arc constraints, auto-targeting, lasers.
//   node tools/combat.test.js
import { Ship } from '../src/entities/Ship.js';
import { Enemy } from '../src/entities/Enemy.js';
import { World } from '../src/world/World.js';
import { ParticleSystem } from '../src/fx/ParticleSystem.js';
import { SystemsManager } from '../src/systems/SystemsManager.js';
import { EventBus } from '../src/core/EventBus.js';
import { WeightSystem } from '../src/systems/WeightSystem.js';
import { DriveSystem } from '../src/systems/DriveSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { PowerSystem } from '../src/systems/PowerSystem.js';
import { HeatSystem } from '../src/systems/HeatSystem.js';
import { CorrosionSystem } from '../src/systems/CorrosionSystem.js';
import { HullSystem } from '../src/systems/HullSystem.js';
import { TargetingManager } from '../src/combat/TargetingManager.js';
import { WeaponMount } from '../src/combat/WeaponMount.js';
import { LaserWeapon } from '../src/combat/LaserWeapon.js';
import { CONFIG } from '../src/config.js';
import { DEG, wrapAngle } from '../src/core/MathUtils.js';

const STEP = CONFIG.loop.fixedStep;
const D = (deg) => deg * DEG;
const degOf = (rad) => (rad / DEG);

let failures = 0;
const f = (n, d = 1) => n.toFixed(d);
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
/** True when two angles differ by a whole number of turns. */
const sameAngle = (a, b, tol = 1e-6) => Math.abs(wrapAngle(a - b)) <= tol;

/** Ship + every core system + a controllable enemy list. */
function makeRig(opts = {}) {
  const world = new World({ seed: 11, obstacleCount: 0 });
  const ship = new Ship({ x: 3000, y: 3000 });
  ship.teleport(3000, 3000, 0); // nose along +x for predictable angles
  ship.stats.corrosionRate = 0; // no meltdown noise in weapon tests

  const events = new EventBus();
  const systems = new SystemsManager(ship, events);
  const enemies = [];
  const targeting = new TargetingManager(enemies, { retargetDelay: opts.retargetDelay ?? 0 });
  const particles = new ParticleSystem(256);

  const core = {
    weight: new WeightSystem(),
    drive: new DriveSystem(),
    weapons: new WeaponSystem(),
    power: new PowerSystem(),
    heat: new HeatSystem(),
    corrosion: new CorrosionSystem(),
    hull: new HullSystem(),
  };
  for (const key of ['weight', 'drive', 'weapons', 'power', 'heat', 'corrosion', 'hull']) {
    systems.install(core[key]);
  }
  systems.context = { world, particles, camera: null, events, targeting, enemies, time: 0 };

  const input = { axis: { x: 0, y: 0 }, magnitude: 0 };
  const ctx = { input, world, particles, camera: null, events, systems, time: 0, dt: STEP };
  let t = 0;

  const rig = {
    world, ship, events, systems, particles, targeting, enemies, core, input, t,
    mounts: core.weapons.mounts,
    get left() { return core.weapons.get('left'); },
    get right() { return core.weapons.get('right'); },
    get rear() { return core.weapons.get('rear'); },
    /** Add a dummy at an absolute world position. */
    addEnemy(x, y, o = {}) {
      const e = new Enemy({ x, y, ...o });
      enemies.push(e);
      return e;
    },
    /** Add a dummy relative to the ship, at `dist` along `angleDeg`. */
    addEnemyRel(angleDeg, dist, o = {}) {
      const a = D(angleDeg);
      return rig.addEnemy(ship.x + Math.cos(a) * dist, ship.y + Math.sin(a) * dist, o);
    },
    run(seconds) {
      const steps = Math.round(seconds / STEP);
      for (let i = 0; i < steps; i++) {
        t += STEP;
        ctx.time = t;
        systems.context.time = t;
        systems.update(STEP);
        ship.update(STEP, ctx);
        for (let k = 0; k < enemies.length; k++) enemies[k].update(STEP, ctx);
        particles.update(STEP);
      }
      rig.t = t;
    },
  };
  return rig;
}

const MOUNTS = CONFIG.combat.mounts;
const arcOf = (id) => MOUNTS.find((m) => m.id === id).arc;

/* ================== 1. mount configuration + arc maths ==================== */
{
  const r = makeRig();
  check('three hardpoints exist (left / right / rear)',
    r.mounts.length === 3 && r.left && r.right && r.rear,
    r.mounts.map((m) => `${m.id}@${m.offsetX},${m.offsetY}`).join(' '));

  check('left mount arc is -90..+30 (spec)',
    arcOf('left').center === -30 && arcOf('left').half === 60, JSON.stringify(arcOf('left')));
  check('right mount arc is -30..+90 (spec)',
    arcOf('right').center === 30 && arcOf('right').half === 60, JSON.stringify(arcOf('right')));
  check('rear mount covers the back hemisphere',
    arcOf('rear').center === 180 && arcOf('rear').half === 90, JSON.stringify(arcOf('rear')));

  // clampToArc, per mount, in degrees
  const clampDeg = (mount, deg) => degOf(mount.clampToArc(D(deg)));
  const L = r.left;
  const R = r.right;
  const B = r.rear;

  check('left clamps a hard-starboard target to its +30 limit',
    near(clampDeg(L, 90), 30, 1e-6), `${f(clampDeg(L, 90))}`);
  check('left clamps a hard-port target to its -90 limit',
    near(clampDeg(L, -140), -90, 1e-6), `${f(clampDeg(L, -140))}`);
  check('left passes an in-arc angle through unchanged',
    near(clampDeg(L, -45), -45, 1e-6), `${f(clampDeg(L, -45))}`);

  check('right clamps a hard-port target to its -30 limit',
    near(clampDeg(R, -90), -30, 1e-6), `${f(clampDeg(R, -90))}`);
  check('right clamps a hard-starboard target to its +90 limit',
    near(clampDeg(R, 150), 90, 1e-6), `${f(clampDeg(R, 150))}`);

  // The rear arc straddles +/-180: this is the case min/max clamping breaks on.
  check('rear clamps "straight ahead" (0) to its +90 limit',
    sameAngle(D(Math.abs(clampDeg(B, 0))), D(90)), `${f(clampDeg(B, 0))}°`);
  check('rear clamps "dead behind" (180) to itself',
    sameAngle(D(clampDeg(B, 180)), D(180)), `${f(clampDeg(B, 180))}°`);
  check('rear clamps "dead behind" (-180) to itself',
    sameAngle(D(clampDeg(B, -180)), D(180)), `${f(clampDeg(B, -180))}° (== 180°)`);
  check('rear passes 135 (port-aft) through unchanged',
    near(clampDeg(B, 135), 135, 1e-6), `${f(clampDeg(B, 135))}`);
  check('rear passes -135 (starboard-aft) through unchanged',
    sameAngle(D(clampDeg(B, -135)), D(-135)), `${f(clampDeg(B, -135))}° (== -135°)`);

  // Arc membership
  check('isLocalInArc matches the documented ranges',
    L.isLocalInArc(D(-90)) && L.isLocalInArc(D(30)) && !L.isLocalInArc(D(31)) &&
    R.isLocalInArc(D(-30)) && R.isLocalInArc(D(90)) && !R.isLocalInArc(D(-31)) &&
    B.isLocalInArc(D(90)) && B.isLocalInArc(D(180)) && B.isLocalInArc(D(-90)) && !B.isLocalInArc(D(0)),
    '');

  // Every achievable angle must be inside the arc (no wrap leakage)
  let allInside = true;
  for (let deg = -720; deg <= 720; deg += 3) {
    for (const m of [L, R, B]) {
      if (!m.isLocalInArc(m.clampToArc(D(deg)))) allInside = false;
    }
  }
  check('clampToArc never returns an out-of-arc angle (full circle sweep)', allInside, '');
}

/* ====================== 2. gradual rotation, not instant ================== */
{
  const r = makeRig();
  const L = r.left;
  const target = r.addEnemyRel(-80, 220); // hard to port, inside the -90..+30 arc

  const before = L.localAngle;
  r.run(STEP); // one single step
  const afterOne = L.localAngle;
  const maxStep = L.turnRate * STEP + 1e-9;

  check('mount rotates at a limited rate (not instantly)',
    Math.abs(wrapAngle(afterOne - before)) > 0 && Math.abs(wrapAngle(afterOne - before)) <= maxStep,
    `moved ${f(degOf(Math.abs(wrapAngle(afterOne - before))), 3)}° in one step (max ${f(degOf(maxStep), 3)}°)`);

  r.run(0.5); // 3.6 rad/s covers the 50° it needs well inside half a second
  check('mount reaches the target bearing over time',
    near(degOf(L.localAngle), -80, 1.5), `${f(degOf(L.localAngle))}° (want ~-80°)`);
  check('and locks onto the target', L.target === target, '');
  check('aim error collapses once it is on target',
    degOf(L.aimError) < CONFIG.combat.laser.fireTolerance / DEG, `${f(degOf(L.aimError), 2)}°`);

  /* --- an out-of-arc enemy is not a target at all -------------------------- */
  // (Only the right mount is installed here, so nothing else can shoot it.)
  const r2 = makeRig();
  r2.core.weapons.mounts = [r2.right];
  const R2 = r2.right;
  const behind = r2.addEnemyRel(180, 240); // dead astern: outside -30..+90
  let stayedInside = true;
  let firedAtIllegal = false;
  for (let i = 0; i < 240; i++) {
    r2.run(STEP);
    if (!R2.isLocalInArc(R2.localAngle)) stayedInside = false;
    if (R2.weapon.firing) firedAtIllegal = true;
  }
  check('an out-of-arc enemy is never locked', R2.target === null, '');
  check('mount never points outside its arc', stayedInside, `${f(degOf(R2.localAngle))}°`);
  check('mount refuses to fire at a target outside its arc', !firedAtIllegal, '');
  check('the out-of-arc target is left untouched', behind.hull === behind.maxHull, `hull=${f(behind.hull)}`);
  check('with nothing in arc the mount rests at its arc centre',
    near(degOf(R2.localAngle), degOf(R2.arcCenter), 0.5),
    `${f(degOf(R2.localAngle))}° vs centre ${f(degOf(R2.arcCenter))}°`);

  /* --- an enemy that drifts out of arc loses the lock ---------------------- */
  const r3 = makeRig();
  r3.core.weapons.mounts = [r3.right];
  const drifting = r3.addEnemyRel(85, 240); // just inside the +90 limit
  r3.run(0.6);
  check('a target near the arc edge is engaged', r3.right.target === drifting && r3.right.weapon.firing,
    `local=${f(degOf(r3.right.localAngle))}° firing=${r3.right.weapon.firing}`);
  // Swing the hull so that target falls behind the arc.
  r3.ship.angle = D(-40);
  r3.run(0.5);
  check('turning the hull out of arc drops the lock', r3.right.target === null, '');
  check('and the weapon goes cold', r3.right.weapon.firing === false, '');

  /* --- just outside the arc is still refused ------------------------------- */
  const r4 = makeRig();
  r4.core.weapons.mounts = [r4.right];
  const justOutside = r4.addEnemyRel(100, 240); // 100 > +90 limit
  r4.run(0.8);
  check('an enemy 10 degrees past the limit is refused',
    r4.right.target === null && justOutside.hull === justOutside.maxHull, `hull=${f(justOutside.hull)}`);
}

/* ============================ 3. auto-targeting =========================== */
{
  const r = makeRig();
  // Nearest-in-arc wins, not nearest-overall.
  const farAhead = r.addEnemyRel(0, 400);
  const nearBehind = r.addEnemyRel(180, 120);
  r.run(STEP);
  check('front mounts ignore a closer target behind them',
    r.left.target === farAhead && r.right.target === farAhead,
    `left->${r.left.target ? r.left.target.id : '-'} right->${r.right.target ? r.right.target.id : '-'}`);
  check('rear mount ignores a closer target in front of it',
    r.rear.target === nearBehind, `rear->${r.rear.target ? r.rear.target.id : '-'}`);

  // Range limit
  const r2 = makeRig();
  const outOfRange = r2.addEnemyRel(0, CONFIG.combat.laser.range + 150);
  r2.run(STEP);
  check('targets beyond weapon range are ignored',
    r2.left.target === null && outOfRange.hull === outOfRange.maxHull, '');

  // Dead targets are ignored
  const r3 = makeRig();
  const dead = r3.addEnemyRel(0, 200);
  dead.alive = false;
  const alive = r3.addEnemyRel(10, 300);
  r3.run(STEP);
  check('dead enemies are never targeted', r3.left.target === alive, '');

  // Each mount prefers a different threat
  const r4 = makeRig();
  const port = r4.addEnemyRel(-60, 250);
  const stbd = r4.addEnemyRel(60, 250);
  r4.run(0.6);
  check('mounts lock different targets when the field allows',
    r4.left.target === port && r4.right.target === stbd,
    `left->#${r4.left.target?.id} right->#${r4.right.target?.id}`);

  // ...and share when there is only one
  const r5 = makeRig();
  const only = r5.addEnemyRel(0, 250);
  r5.run(0.6);
  check('mounts converge on a lone target',
    r5.left.target === only && r5.right.target === only, '');

  // Targeting rules survive the hull turning: arcs are relative to the ship.
  const r6 = makeRig();
  const ahead = r6.addEnemyRel(0, 260);
  r6.run(0.4);
  check('target ahead is engaged while facing it', r6.left.target === ahead, '');
  r6.ship.angle = Math.PI; // spin the hull 180 degrees
  r6.run(0.4);
  check('turning away drops the lock (arc is hull-relative)',
    r6.left.target === null && r6.right.target === null && r6.rear.target === ahead,
    `left->${r6.left.target ? 'lock' : '-'} rear->${r6.rear.target ? 'lock' : '-'}`);

  // Mode: weakest-first
  const r7 = makeRig();
  const healthy = r7.addEnemyRel(-5, 200);
  const hurt = r7.addEnemyRel(-5, 380);
  hurt.hull = 8;
  r7.targeting.mode = 'weakest';
  r7.run(STEP);
  check('targeting mode is swappable (weakest)', r7.left.target === hurt, '');
}

/* ========================== 4. laser firing =============================== */
{
  const r = makeRig();
  // -60 degrees: inside the LEFT arc (-90..+30), outside the RIGHT (-30..+90),
  // so exactly one mount engages and the DPS number is checkable.
  const target = r.addEnemyRel(-60, 240);
  const hull0 = target.hull;

  r.run(1.0);
  check('the laser damages a locked target',
    target.hull < hull0 - 20, `hull ${f(hull0)} -> ${f(target.hull)}`);

  const expected = CONFIG.combat.laser.dps * (1 - CONFIG.combat.laser.spinUpTime * 0.5);
  check('damage rate is close to the configured DPS',
    Math.abs((hull0 - target.hull) - expected) < CONFIG.combat.laser.dps * 0.35,
    `dealt ${f(hull0 - target.hull)} vs dps ${CONFIG.combat.laser.dps}`);

  check('firing draws power from the capacitor',
    r.left.weapon.energyDrawn > 0 && r.left.weapon.duty > 0.99,
    `drawn=${f(r.left.weapon.energyDrawn, 2)} units, duty=${f(r.left.weapon.duty, 2)}`);
  check('firing generates heat',
    r.ship.stats.heat > 0, `heat=${f(r.ship.stats.heat)}`);
  check('the weapon system reports its draw',
    r.core.weapons.powerDraw === CONFIG.combat.laser.powerDraw && r.core.weapons.firingCount === 1,
    `${r.core.weapons.powerDraw} units/s, ${r.core.weapons.firingCount} firing`);
  check('beam terminates on the target surface, not past it', (() => {
    const w = r.left.weapon;
    const d = Math.hypot(w.hitX - r.ship.x, w.hitY - r.ship.y);
    return d > 0 && d < 220;
  })(), '');

  // Kill -> event + kill counter
  let destroyed = 0;
  r.events.on('enemy:destroyed', () => destroyed++);
  r.run(4);
  check('dummies die and announce it',
    destroyed >= 1 && target.alive === false, `${destroyed} kills`);
  check('weapon system counts kills', r.core.weapons.kills >= 1, `${r.core.weapons.kills}`);

  // Respawn is a property of the dummy itself — test it directly.
  const events2 = new EventBus();
  let killEvents = 0;
  events2.on('enemy:destroyed', () => killEvents++);
  const dummy = new Enemy({ x: 0, y: 0, respawnDelay: 1.5 });
  dummy.takeDamage(dummy.maxHull + 10, { source: 'test' }, events2);
  check('a destroyed dummy announces it and stays down',
    dummy.alive === false && killEvents === 1, `hull=${f(dummy.hull)}`);
  for (let i = 0; i < Math.round(1.2 / STEP); i++) dummy.update(STEP, { events: events2 });
  check('it is still wreckage before the timer expires', dummy.alive === false, '');
  for (let i = 0; i < Math.round(0.6 / STEP); i++) dummy.update(STEP, { events: events2 });
  check('it respawns at full hull after respawnDelay',
    dummy.alive === true && dummy.hull === dummy.maxHull, `hull=${f(dummy.hull)}`);
  const noRespawn = new Enemy({ x: 0, y: 0, respawnDelay: 0 });
  noRespawn.takeDamage(999, {}, events2);
  for (let i = 0; i < 240; i++) noRespawn.update(STEP, {});
  check('respawnDelay 0 means permanently dead', noRespawn.alive === false, '');
}

/* ============ 5. power starvation and heat through the weapons ============ */
{
  const r = makeRig();
  r.addEnemyRel(-50, 240, { hull: 400 });
  r.addEnemyRel(50, 240, { hull: 400 });

  r.run(0.6);
  check('two mounts engage two targets', r.core.weapons.firingCount === 2,
    `${r.core.weapons.firingCount} firing`);
  const heatTwo = r.ship.stats.heat;

  // Empty the capacitor: two beams are roughly sustainable (regenerating
  // 13/s against 14/s of draw), three are not — the third must starve.
  r.ship.stats.power = 0;
  r.run(1.2);
  check('power is never overdrawn below zero', r.ship.stats.power >= 0, `${f(r.ship.stats.power, 2)}`);
  // Two T1 lasers draw 14/s against 16/s of recharge: sustainable, but only
  // just — a drained capacitor crawls back instead of snapping to full.
  check('two beams are only just sustainable on a drained capacitor',
    r.ship.stats.power < 12, `power=${f(r.ship.stats.power, 2)} after 1.2s from empty`);

  const rStarve = makeRig();
  rStarve.addEnemyRel(-50, 240, { hull: 400 });
  rStarve.addEnemyRel(50, 240, { hull: 400 });
  rStarve.addEnemyRel(180, 240, { hull: 400 });
  const powerBefore = rStarve.ship.stats.power;
  rStarve.run(2.5);
  check('a full broadside drains the capacitor faster than it recharges',
    rStarve.ship.stats.power < powerBefore - 10,
    `${f(powerBefore)} -> ${f(rStarve.ship.stats.power)} (3 x ${CONFIG.combat.laser.powerDraw}/s vs +${CONFIG.systems.powerRegen}/s)`);
  rStarve.ship.stats.power = 0; // pull the plug mid-broadside
  rStarve.run(1.5);
  const starved = rStarve.mounts.filter((m) => m.weapon.duty < 0.9).length;
  check('a full broadside cannot be sustained on an empty capacitor',
    rStarve.ship.stats.power < 5 && starved >= 1,
    `power=${f(rStarve.ship.stats.power, 2)} starved=${starved}/3`);
  check('starved beams do reduced damage, not free damage',
    rStarve.mounts.every((m) => m.weapon.duty <= 1.0001), '');

  // Sustained fire heats the core past its ceiling.
  const r3 = makeRig();
  r3.ship.stats.power = CONFIG.systems.maxPower;
  r3.addEnemyRel(-50, 240, { hull: 900 });
  r3.addEnemyRel(50, 240, { hull: 900 });
  r3.addEnemyRel(180, 240, { hull: 900 }); // rear mount too: full broadside
  r3.run(5);
  check('all three mounts engage a broadside', r3.core.weapons.firingCount >= 3,
    `${r3.core.weapons.firingCount} firing`);
  check('a full broadside redlines the core',
    r3.ship.isOverheating, `heat=${f(r3.ship.stats.heat)} / ${r3.ship.stats.maxHeat}`);
  check('heat from firing is bounded by the redline ceiling',
    r3.ship.stats.heat <= r3.ship.stats.maxHeat * CONFIG.systems.heatCeiling + 1e-6, '');
  check('overheating while firing still leaves the ship alive',
    r3.ship.stats.hull > 0, `hull=${f(r3.ship.stats.hull)}`);
}

/* ===================== 6. mounts are modular / swappable ================== */
{
  // A mount can carry a different weapon instance entirely.
  const custom = new LaserWeapon({ dps: 100, range: 900, id: 'laser-heavy', name: 'Heavy Laser' });
  const mount = new WeaponMount({ id: 'spine', label: 'S', offset: { x: 10, y: 0 }, arc: { center: 0, half: 20 }, turnRate: 1.5, weapon: custom });
  const ship = new Ship({ x: 0, y: 0 });
  ship.teleport(0, 0, 0);
  mount.attach(ship);
  check('a mount accepts any Weapon subclass', mount.weapon === custom && custom.ship === ship, '');
  check('custom weapon keeps its own stats', custom.dps === 100 && custom.range === 900, '');
  check('narrow arc is honoured',
    near(degOf(mount.clampToArc(D(80))), 20, 1e-6) && near(degOf(mount.clampToArc(D(-80))), -20, 1e-6), '');

  // Weapon registry
  const r = makeRig();
  const made = r.core.weapons.createWeapon('laser', { dps: 5 });
  check('weapon registry builds from a config key', made instanceof LaserWeapon && made.dps === 5, '');
  check('unknown weapon types are handled', r.core.weapons.createWeapon('railgun') === null, '');

  // Mounts reset cleanly for a new run
  r.addEnemyRel(0, 200);
  r.run(0.5);
  r.core.weapons.reset();
  check('reset clears locks, charge and kills',
    r.left.target === null && r.left.weapon.charge === 0 && r.core.weapons.kills === 0 &&
    near(degOf(r.left.localAngle), degOf(r.left.arcCenter), 1e-6), '');
}

/* ================ 7. framerate independence + full run ==================== */
{
  const results = [];
  for (const step of [1 / 240, 1 / 120, 1 / 60]) {
    const world = new World({ seed: 5, obstacleCount: 0 });
    const ship = new Ship({ x: 3000, y: 3000 });
    ship.teleport(3000, 3000, 0);
    ship.stats.corrosionRate = 0;
    const events = new EventBus();
    const systems = new SystemsManager(ship, events);
    const enemies = [new Enemy({ x: 3200, y: 3000 })];
    const targeting = new TargetingManager(enemies, { retargetDelay: 0 });
    const core = {
      weight: new WeightSystem(), drive: new DriveSystem(), weapons: new WeaponSystem(),
      power: new PowerSystem(), heat: new HeatSystem(), corrosion: new CorrosionSystem(), hull: new HullSystem(),
    };
    for (const k of ['weight', 'drive', 'weapons', 'power', 'heat', 'corrosion', 'hull']) systems.install(core[k]);
    systems.context = { world, particles: null, camera: null, events, targeting, enemies, time: 0 };
    const ctx = { input: { axis: { x: 0, y: 0 }, magnitude: 0 }, world, particles: null, camera: null, events, systems, time: 0, dt: step };
    for (let i = 0; i < Math.round(2 / step); i++) {
      systems.update(step);
      ship.update(step, ctx);
      enemies[0].update(step, ctx);
    }
    results.push({ hull: enemies[0].hull, power: ship.stats.power, heat: ship.stats.heat });
  }
  const spread = (k) => Math.max(...results.map((r) => r[k])) - Math.min(...results.map((r) => r[k]));
  check('laser damage is framerate independent', spread('hull') < 3, `spread=${f(spread('hull'), 2)} hull`);
  check('weapon power draw is framerate independent', spread('power') < 1.5, `spread=${f(spread('power'), 2)}`);
  check('weapon heat is framerate independent', spread('heat') < 2, `spread=${f(spread('heat'), 2)}`);

  // Full field: spawn dummies the way the Game does and fight for a while.
  const world = new World({ seed: 3, obstacleCount: 40 });
  const field = Enemy.spawnField({
    world, count: CONFIG.combat.enemies.count, seed: 3,
    avoid: { x: world.width / 2, y: world.height / 2 },
  });
  check('the dummy field spawns', field.length > 10, `${field.length} dummies`);
  check('no dummy sits on the spawn point',
    field.every((e) => Math.hypot(e.x - world.width / 2, e.y - world.height / 2) >= CONFIG.combat.enemies.minDistanceFromSpawn),
    '');
  check('dummies never spawn inside asteroids', (() => {
    const near = [];
    return field.every((e) => {
      world.queryNearby(e.x, e.y, e.radius + world.maxObstacleRadius, near);
      return near.every((o) => Math.hypot(o.x - e.x, o.y - e.y) >= o.radius + e.radius);
    });
  })(), '');
  check('the field is deterministic for a seed',
    Enemy.spawnField({ world, count: 12, seed: 99 }).map((e) => e.x).join() ===
    Enemy.spawnField({ world, count: 12, seed: 99 }).map((e) => e.x).join(), '');
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures ? 1 : 0);
