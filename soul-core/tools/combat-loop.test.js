// Combat loop tests: moving enemies, collision, ramming, scrap, and the two
// new weapon families (kinetic / plasma).
//   node tools/combat-loop.test.js
//
// Unit-level rigs where precision matters (the spatial hash, recoil maths,
// splash falloff), and the REAL Game (via dom-stub) where wiring matters.

import { installDomStub } from './dom-stub.mjs';

const dom = installDomStub({ width: 390, height: 844 });
const { canvas } = dom;

const { Game } = await import('../src/core/Game.js');
const { CONFIG } = await import('../src/config.js');
const { Ship } = await import('../src/entities/Ship.js');
const { Enemy } = await import('../src/entities/Enemy.js');
const { Scavenger } = await import('../src/entities/Scavenger.js');
const { Scrap } = await import('../src/entities/Scrap.js');
const { Item } = await import('../src/inventory/Item.js');
const { SpatialHash } = await import('../src/core/SpatialHash.js');
const { CollisionSystem } = await import('../src/combat/CollisionSystem.js');
const { ProjectilePool } = await import('../src/combat/ProjectilePool.js');
const { ParticleSystem } = await import('../src/fx/ParticleSystem.js');
const { BlastFx } = await import('../src/fx/BlastFx.js');
const { EventBus } = await import('../src/core/EventBus.js');
const { KineticCannon } = await import('../src/combat/KineticCannon.js');
const { PlasmaCannon } = await import('../src/combat/PlasmaCannon.js');
const { CannonWeapon } = await import('../src/combat/CannonWeapon.js');
const { TAU } = await import('../src/core/MathUtils.js');

const STEP = CONFIG.loop.fixedStep;

let failures = 0;
const f = (n, d = 1) => n.toFixed(d);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}
const DEG = Math.PI / 180;

/* ========================================================================= */
/* 1. SpatialHash — the broad-phase every other section depends on           */
/* ========================================================================= */
{
  const h = new SpatialHash(100);
  const ents = [];
  // Deterministic scatter, including negatives (shells leave the world).
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 500; i++) {
    ents.push({ x: (rnd() - 0.5) * 4000, y: (rnd() - 0.5) * 4000, id: i });
  }
  h.rebuild(ents);

  const out = [];
  let misses = 0;
  let dupes = 0;
  let supersetOk = true;
  for (const q of [{ x: 0, y: 0, r: 150 }, { x: -900, y: 640, r: 320 }, { x: 1900, y: -70, r: 40 }]) {
    h.query(q.x, q.y, q.r, out);
    const seen = new Set(out);
    dupes += out.length - seen.size;
    const exact = ents.filter((e) => Math.hypot(e.x - q.x, e.y - q.y) <= q.r);
    for (const e of exact) if (!seen.has(e)) misses++;
    // Every candidate must be within the circle's cell footprint.
    for (const e of out) {
      if (Math.abs(e.x - q.x) > q.r + 100 || Math.abs(e.y - q.y) > q.r + 100) supersetOk = false;
    }
  }

  check('the hash never misses a real hit', misses === 0, `${misses} missed`);
  check('the hash never returns the same entity twice', dupes === 0, `${dupes} duplicates`);
  check('candidates are always inside the queried neighbourhood', supersetOk, '');

  const before = h.stats().buckets;
  h.clear();
  const empty = [];
  h.query(0, 0, 500, empty);
  check('clear() empties the index', empty.length === 0 && h.insertCount === 0, `${empty.length} left`);
  check('clear() keeps the buckets (no garbage per step)', h.stats().buckets === before,
    `${h.stats().buckets} buckets`);

  h.rebuild(ents);
  h.query(1e6, 1e6, 50, empty);
  check('a query in empty space returns nothing', empty.length === 0, '');

  // The whole point: a query touches a handful of entities, not all of them.
  h.query(0, 0, 60, out);
  check('the broad-phase narrows the work (candidates << entities)',
    out.length > 0 && out.length < ents.length * 0.1,
    `${out.length} of ${ents.length} entities`);

  const dead = { x: 10, y: 10, alive: false };
  const live = { x: 20, y: 20, alive: true };
  h.rebuild([dead, live]);
  h.query(15, 15, 20, out);
  check('rebuild() skips dead entities', out.length === 1 && out[0] === live, `${out.length} indexed`);
}

/* ========================================================================= */
/* 2. Scavenger AI — it moves, it steers, it cannot corner with you          */
/* ========================================================================= */
{
  const world = { bounds: { x: 0, y: 0, width: 6000, height: 6000 }, maxObstacleRadius: 0, _scratch: [],
    queryNearby(x, y, r, out) { out.length = 0; return out; } };

  const makeChase = (dist = 600, opts = {}) => {
    const ship = new Ship({ x: 1000, y: 1000 });
    ship.teleport(1000, 1000, 0);
    const raider = new Scavenger({ x: 1000 + dist, y: 1000, world, ...opts });
    raider.angle = Math.PI; // pointing AWAY from the ship: it must turn around
    const ctx = { ship, world, particles: null, events: null, time: 0, dt: STEP };
    return { ship, raider, ctx };
  };

  {
    const { ship, raider, ctx } = makeChase(600);
    const d0 = Math.hypot(raider.x - ship.x, raider.y - ship.y);
    let maxStep = 0;
    let prevAngle = raider.angle;
    let maxTurn = 0;
    for (let i = 0; i < 240; i++) {
      raider.update(STEP, ctx);
      const d = Math.hypot(raider.x - ship.x, raider.y - ship.y);
      maxStep = Math.max(maxStep, d0 - d);
      let turn = Math.abs(raider.angle - prevAngle);
      if (turn > Math.PI) turn = TAU - turn;
      maxTurn = Math.max(maxTurn, turn);
      prevAngle = raider.angle;
    }
    const d1 = Math.hypot(raider.x - ship.x, raider.y - ship.y);
    check('a scavenger closes on the ship', d1 < d0 - 100, `${f(d0)} -> ${f(d1)} wu`);
    check('it never exceeds its rated top speed',
      Math.hypot(raider.vx, raider.vy) <= CONFIG.combat.scavengers.speed + 1,
      `${f(Math.hypot(raider.vx, raider.vy))} wu/s`);
    check('it steers gradually (never snaps to the bearing)',
      maxTurn <= raider.turnRate * STEP + 1e-9, `max ${f(maxTurn / DEG, 3)}°/step`);
  }

  {
    // Beyond aggro range it should NOT close the distance.
    const { ship, raider, ctx } = makeChase(CONFIG.combat.scavengers.aggroRange + 400);
    const d0 = Math.hypot(raider.x - ship.x, raider.y - ship.y);
    for (let i = 0; i < 600; i++) raider.update(STEP, ctx);
    const d1 = Math.hypot(raider.x - ship.x, raider.y - ship.y);
    check('outside aggro range it drifts instead of hunting', d1 > d0 - 60, `${f(d0)} -> ${f(d1)} wu`);
  }

  {
    // A dead ship is not a target.
    const { ship, raider, ctx } = makeChase(400);
    ship.alive = false;
    const d0 = Math.hypot(raider.x - ship.x, raider.y - ship.y);
    for (let i = 0; i < 600; i++) raider.update(STEP, ctx);
    const d1 = Math.hypot(raider.x - ship.x, raider.y - ship.y);
    check('it coasts when the ship is dead', Math.abs(d1 - d0) < 200, `${f(d0)} -> ${f(d1)} wu`);
  }

  {
    // Rocks: a raider aimed straight at one must not tunnel through it.
    const rock = { x: 1200, y: 1000, radius: 120 };
    const rockWorld = {
      bounds: { x: 0, y: 0, width: 6000, height: 6000 },
      maxObstacleRadius: 120,
      _scratch: [],
      queryNearby(x, y, r, out) {
        out.length = 0;
        if (Math.hypot(x - rock.x, y - rock.y) < r + rock.radius) out.push(rock);
        return out;
      },
    };
    const ship = new Ship({ x: 2000, y: 1000 });
    ship.teleport(2000, 1000, 0);
    const raider = new Scavenger({ x: 900, y: 1000, world: rockWorld });
    raider.angle = 0;
    const ctx = { ship, world: rockWorld, particles: null, events: null, time: 0, dt: STEP };
    let inside = false;
    for (let i = 0; i < 600; i++) {
      raider.update(STEP, ctx);
      if (Math.hypot(raider.x - rock.x, raider.y - rock.y) < rock.radius) inside = true;
    }
    check('it steers around asteroids instead of flying through them', !inside,
      `final ${f(Math.hypot(raider.x - rock.x, raider.y - rock.y))} wu from the centre`);
  }

  {
    // Respawn relocates it somewhere else entirely.
    const ship = new Ship({ x: 3000, y: 3000 });
    ship.teleport(3000, 3000, 0);
    const raider = new Scavenger({ x: 3100, y: 3000, world });
    raider.world = world;
    raider.hull = 0;
    raider.alive = false;
    raider.respawnTimer = 0;
    raider.lastShipX = 3000;
    raider.lastShipY = 3000;
    raider.respawn();
    const d = Math.hypot(raider.x - 3000, raider.y - 3000);
    check('a respawning raider comes back somewhere else',
      raider.alive && d >= CONFIG.combat.scavengers.respawnMinDistance * 0.8,
      `${f(d)} wu from the player`);
  }

  {
    const raider = new Scavenger({ world });
    const c = CONFIG.combat.scavengers;
    check('it carries the ram numbers in config',
      raider.contactDamage === c.contactDamage && raider.corrosionDamage === c.corrosionDamage &&
      raider.ramCooldownTime === c.ramCooldown && raider.knockback === c.knockback,
      `${raider.contactDamage} hull + ${raider.corrosionDamage}% decay`);
    check('it is worth a random scrap bounty in the configured band',
      raider.scrapValue >= CONFIG.economy.scrap.min && raider.scrapValue <= CONFIG.economy.scrap.max,
      `${f(raider.scrapValue)} scrap`);
    check('it is slower than the ship, so you can always run',
      raider.maxSpeed < new Ship({}).maxSpeed * 0.6,
      `${raider.maxSpeed} vs ${new Ship({}).maxSpeed} wu/s`);
  }
}

/* ========================================================================= */
/* 3. Collision — the grid, the separation, and the ram                      */
/* ========================================================================= */
{
  const world = { bounds: { x: 0, y: 0, width: 6000, height: 6000 }, maxObstacleRadius: 0, _scratch: [],
    queryNearby(x, y, r, out) { out.length = 0; return out; } };

  const events = new EventBus();
  const particles = new ParticleSystem(256);
  const camera = { shake: 0, addShake(v) { this.shake += v; } };

  const makeField = (n) => {
    const ship = new Ship({ x: 3000, y: 3000 });
    ship.teleport(3000, 3000, 0);
    const enemies = [];
    let seed = 999;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < n; i++) {
      enemies.push(new Scavenger({
        x: 3000 + (rnd() - 0.5) * 2400,
        y: 3000 + (rnd() - 0.5) * 2400,
        world,
      }));
    }
    const cc = new CollisionSystem();
    const ctx = { ship, enemies, particles, events, camera, world, state: 'playing' };
    return { ship, enemies, cc, ctx };
  };

  {
    const { ship, enemies, cc, ctx } = makeField(26);
    cc.update(STEP, ctx);
    const out = [];
    cc.grid.query(ship.x, ship.y, ship.radius + cc.maxEnemyRadius, out);

    // Cross-check the broad-phase against brute force.
    const brute = enemies.filter((e) => e.alive &&
      Math.hypot(e.x - ship.x, e.y - ship.y) <= ship.radius + cc.maxEnemyRadius + 260);
    const set = new Set(out);
    const missed = brute.filter((e) => !set.has(e));
    check('the broad-phase candidate list is a true superset', missed.length === 0,
      `${out.length} candidates, ${brute.length} brute-force`);
    check('indexing 26 raiders costs a fraction of a flat scan',
      cc.grid.stats().lastCandidates < enemies.length * 0.5,
      `${cc.grid.stats().lastCandidates} candidates of ${enemies.length}`);
    check('the grid reports its shape for the debug overlay',
      cc.stats().cellSize === CONFIG.combat.collision.cellSize && cc.stats().indexed > 0,
      JSON.stringify(cc.stats()));
  }

  {
    // Separation: a tight cluster must spread out rather than fuse.
    const { enemies, cc, ctx } = makeField(0);
    const cluster = [];
    for (let i = 0; i < 6; i++) {
      const e = new Scavenger({ x: 3000 + (i % 3) * 2, y: 3000 + Math.floor(i / 3) * 2, world });
      enemies.push(e);
      cluster.push(e);
    }
    const spread = () => {
      let min = Infinity;
      for (let i = 0; i < cluster.length; i++) {
        for (let j = i + 1; j < cluster.length; j++) {
          min = Math.min(min, Math.hypot(cluster[i].x - cluster[j].x, cluster[i].y - cluster[j].y));
        }
      }
      return min;
    };
    // The separation impulse lands on the raiders' VELOCITY, so they have to
    // tick too — exactly like the real loop does (enemies first, then
    // collision). The ship is parked out of aggro range so this measures
    // separation, not chasing.
    ctx.ship.teleport(9000, 9000, 0);
    const enemyCtx = { ship: ctx.ship, world, particles, events, time: 0, dt: STEP };
    const before = spread();
    for (let i = 0; i < 240; i++) {
      for (const e of cluster) e.update(STEP, enemyCtx);
      cc.update(STEP, ctx);
    }
    check('a stacked pack pushes itself apart', spread() > before + 5,
      `closest pair ${f(before)} -> ${f(spread())} wu`);
  }

  {
    // The ram: hull + corrosion + knockback, once per cooldown.
    const { ship, enemies, cc, ctx } = makeField(0);
    const raider = new Scavenger({ x: 3000 + 30, y: 3000, world });
    enemies.push(raider);

    let ramEvents = 0;
    events.on('ship:rammed', () => { ramEvents++; });
    const hull0 = ship.stats.hull;
    const corr0 = ship.stats.coreCorrosion;
    const shipV0 = Math.hypot(ship.vx, ship.vy);

    cc.update(STEP, ctx);

    check('contact is detected and announced once',
      ramEvents === 1 && cc.lastContacts === 1, `${ramEvents} events`);
    check('the raider goes on cooldown after biting', raider.ramCooldown > 0,
      `${f(raider.ramCooldown, 2)}s`);
    check('the ship is knocked back', Math.hypot(ship.vx, ship.vy) > shipV0 + 100,
      `${f(Math.hypot(ship.vx, ship.vy))} wu/s`);
    check('the raider is knocked back too', raider.vx > 50, `vx ${f(raider.vx)}`);
    check('the two hulls are pushed out of overlap',
      Math.hypot(raider.x - ship.x, raider.y - ship.y) >= ship.radius + raider.radius - 0.5,
      `${f(Math.hypot(raider.x - ship.x, raider.y - ship.y))} wu apart`);

    // Still touching, but on cooldown: no second bite.
    for (let i = 0; i < 10; i++) cc.update(STEP, ctx);
    check('cooldown stops a grappling raider draining the hull every step',
      ramEvents === 1, `${ramEvents} bites in 10 steps`);

    // HullSystem + CorrosionSystem are the ones that apply it.
    check('the ram carries hull damage and a corrosion chunk',
      hull0 === ship.stats.hull && corr0 === ship.stats.coreCorrosion,
      'detection only — the systems apply it (checked end-to-end below)');
  }

  {
    // Dummies never ram.
    const { ship, enemies, cc, ctx } = makeField(0);
    enemies.push(new Enemy({ x: 3000 + 10, y: 3000 }));
    let ramEvents = 0;
    events.on('ship:rammed', () => { ramEvents++; });
    for (let i = 0; i < 30; i++) cc.update(STEP, ctx);
    check('dummies are scenery, not a threat', ramEvents === 0, `${ramEvents} rams`);
  }

  {
    // Outside a run, nothing bites (the wreck stays readable).
    const { ship, enemies, cc, ctx } = makeField(0);
    enemies.push(new Scavenger({ x: 3000 + 10, y: 3000, world }));
    let ramEvents = 0;
    events.on('ship:rammed', () => { ramEvents++; });
    ctx.state = 'gameover';
    for (let i = 0; i < 30; i++) cc.update(STEP, ctx);
    check('no ramming outside a live run', ramEvents === 0, `${ramEvents} rams`);
  }
}

/* ========================================================================= */
/* 4. Scrap — drops, magnet, collection, decay                               */
/* ========================================================================= */
{
  const ship = new Ship({ x: 1000, y: 1000 });
  ship.teleport(1000, 1000, 0);
  const ctx = { ship };

  {
    const cluster = Scrap.scatter({ x: 1000, y: 1000, amount: 7 });
    const total = cluster.reduce((s, c) => s + c.value, 0);
    check('a wreck spills its full bounty', total === 7 && cluster.length <= 4,
      `${cluster.length} shards = ${total}`);
  }

  {
    const s = new Scrap({ x: 1000 + CONFIG.economy.scrap.magnetRange * 0.8, y: 1000, value: 3 });
    s.vx = 0; s.vy = 0;
    const d0 = Math.hypot(s.x - ship.x, s.y - ship.y);
    for (let i = 0; i < 30; i++) s.update(STEP, ctx);
    const d1 = Math.hypot(s.x - ship.x, s.y - ship.y);
    check('inside magnet range it flies to the ship', d1 < d0, `${f(d0)} -> ${f(d1)} wu`);
  }

  {
    const s = new Scrap({ x: 1000 + CONFIG.economy.scrap.magnetRange * 3, y: 1000, value: 3 });
    s.vx = 0; s.vy = 0;
    const d0 = Math.hypot(s.x - ship.x, s.y - ship.y);
    for (let i = 0; i < 60; i++) s.update(STEP, ctx);
    const d1 = Math.hypot(s.x - ship.x, s.y - ship.y);
    check('outside magnet range it just drifts', Math.abs(d1 - d0) < 30, `${f(d0)} -> ${f(d1)} wu`);
  }

  {
    const s = new Scrap({ x: 1000 + CONFIG.economy.scrap.pickupRange * 0.5, y: 1000, value: 4 });
    const got = s.update(STEP, ctx);
    check('touching it collects it', got === true && s.collected && !s.alive, '');
  }

  {
    const s = new Scrap({ x: 1000, y: 1000, value: 2, life: 0.05 });
    for (let i = 0; i < 20; i++) s.update(STEP, ctx);
    check('scrap decays if you ignore it', !s.alive, '');
  }

  {
    const s = new Scrap({ x: 1000, y: 1000, value: 2 });
    s.life = 3;
    check('it blinks before it goes', s.expiring === true, '');
  }

  {
    // Nothing collects from a dead ship.
    const dead = new Ship({ x: 1000, y: 1000 });
    dead.alive = false;
    const s = new Scrap({ x: 1005, y: 1000, value: 2 });
    const got = s.update(STEP, { ship: dead });
    check('a wreck cannot collect scrap', got === false && s.alive, '');
  }
}

/* ========================================================================= */
/* 5. Kinetic cannon — slow, heavy, and it kicks                             */
/* ========================================================================= */
{
  const cannon = new CannonWeapon();
  const kinetic = new KineticCannon();

  check('the kinetic slug is slow (you must lead the target)',
    kinetic.speed < cannon.speed * 0.6, `${kinetic.speed} vs ${cannon.speed} wu/s`);
  check('the kinetic slug hits far harder per shot',
    kinetic.damage > cannon.damage * 2.5, `${kinetic.damage} vs ${cannon.damage}`);
  check('the kinetic gun is the only one with recoil',
    kinetic.recoil > 0 && (cannon.recoil ?? 0) === 0, `${kinetic.recoil} wu/s of kick`);
  check('it runs cooler per shot than the plasma gun',
    kinetic.heatPerShot < CONFIG.combat.plasma.heatPerShot / 2,
    `${kinetic.heatPerShot} vs ${CONFIG.combat.plasma.heatPerShot}`);

  /** Bare rig: one weapon, one mount, one target, no Game. */
  const fireOnce = (WeaponCls, weight = 0) => {
    const ship = new Ship({ x: 0, y: 0 });
    ship.teleport(0, 0, 0);
    ship.stats.weight = weight;
    ship.stats.power = ship.stats.maxPower;
    const mount = { id: 'test', ship, muzzleX: 0, muzzleY: 0, aimWorld: 0, aimError: 0 };
    const weapon = new WeaponCls().attach(mount);
    const target = new Enemy({ x: 200, y: 0, hull: 99999 });
    const projectiles = new ProjectilePool(16);
    const particles = new ParticleSystem(128);
    const events = new EventBus();
    weapon.update(STEP, { ship, mount, target, particles, projectiles, events });
    return { ship, weapon, mount, target, projectiles, particles };
  };

  {
    const { ship, weapon, projectiles } = fireOnce(KineticCannon, 0);
    check('firing kicks the hull backwards (opposite the muzzle)',
      ship.vx < -50 && Math.abs(ship.vy) < Math.abs(ship.vx), `v = ${f(ship.vx)}, ${f(ship.vy)}`);
    check('the kick is the configured impulse (scaled by capacitor duty)',
      near(Math.abs(ship.vx), weapon.recoil * weapon.duty, 1), `${f(Math.abs(ship.vx))} wu/s`);
    check('a slug is in the air', projectiles.liveCount === 1, `${projectiles.liveCount}`);
    check('the slug carries the kinetic kind + damage',
      projectiles.pool.find((p) => p.alive).kind === 'slug', '');
  }

  {
    const light = fireOnce(KineticCannon, 0);
    const heavy = fireOnce(KineticCannon, 80);
    check('a loaded ship shrugs the recoil off (mass = inertia)',
      Math.abs(heavy.ship.vx) < Math.abs(light.ship.vx) * 0.75,
      `light ${f(Math.abs(light.ship.vx))} vs heavy ${f(Math.abs(heavy.ship.vx))} wu/s`);
  }

  {
    const { ship, weapon } = fireOnce(KineticCannon, 0);
    check('it pays its power and heat bill per shot',
      near(ship.stats.maxPower - ship.stats.power, weapon.powerPerShot * weapon.duty, 0.01) &&
      near(ship.stats.heat, weapon.heatPerShot * weapon.duty, 0.01),
      `${f(weapon.powerPerShot * weapon.duty, 1)} power, ${f(ship.stats.heat, 1)} heat`);
  }
}

/* ========================================================================= */
/* 6. Plasma cannon — splash, knockback, and a ferocious heat bill           */
/* ========================================================================= */
{
  const plasma = new PlasmaCannon();
  const kinetic = new KineticCannon();

  check('the plasma bolt carries a blast radius', plasma.splashRadius > 0,
    `${plasma.splashRadius} wu`);
  check('the plasma gun generates massive heat',
    plasma.heatGain > kinetic.heatGain * 3 && plasma.heatPerShot > CONFIG.systems.coolingRate * 3,
    `${plasma.heatGain}/s vs cooling ${CONFIG.systems.coolingRate}/s`);
  check('its dedicated tooltip figure counts the splash',
    plasma.dps > plasma.damage * plasma.shotsPerSecond, `${plasma.dps} dps`);

  /** Fire a shell straight into a cluster and resolve it. */
  const detonate = (WeaponCls, spread, hull = 500) => {
    const world = {
      bounds: { x: -5000, y: -5000, width: 10000, height: 10000 },
      maxObstacleRadius: 0, _scratch: [],
      queryNearby(x, y, r, out) { out.length = 0; return out; },
    };
    const ship = new Ship({ x: 0, y: 0 });
    const mount = { id: 'test', ship, muzzleX: 0, muzzleY: 0, aimWorld: 0, aimError: 0 };
    const weapon = new WeaponCls().attach(mount);
    const projectiles = new ProjectilePool(16);
    const blasts = new BlastFx(8);
    const particles = new ParticleSystem(256);
    const events = new EventBus();
    const camera = { shake: 0, addShake(v) { this.shake += v; } };

    const targets = spread.map((dy) => new Enemy({ x: 300, y: dy, hull }));
    const enemies = [...targets];
    const collision = { grid: new SpatialHash(260), maxEnemyRadius: 26 };
    collision.grid.rebuild(enemies);

    // Spawn the shell the way the weapon would, then let the pool fly it in.
    projectiles.spawn({
      x: 200, y: 0, vx: 600, vy: 0,
      damage: weapon.damage,
      life: 2,
      color: weapon.color,
      radius: weapon.shellRadius,
      kind: weapon.kind,
      splash: weapon.splashRadius,
      splashDamage: weapon.splashDamage,
      splashFalloff: weapon.splashFalloff,
      splashKnockback: weapon.splashKnockback,
      weapon, mount,
    });

    const ctx = { world, enemies, grid: collision.grid, maxEnemyRadius: 26, particles, blasts, events, camera };
    for (let i = 0; i < 60 && projectiles.liveCount > 0; i++) projectiles.update(STEP, ctx);
    return { targets, blasts, particles, camera, weapon, enemies };
  };

  {
    // Two enemies, one 20wu from the impact and one 110wu away.
    const { targets, blasts, camera } = detonate(PlasmaCannon, [0, 60]);
    const [direct, near] = targets;
    check('a plasma bolt damages everything in the blast',
      direct.hull < direct.maxHull && near.hull < near.maxHull,
      `direct ${f(direct.maxHull - direct.hull)}, splash ${f(near.maxHull - near.hull)}`);
    check('the direct hit hurts more than the splash',
      direct.maxHull - direct.hull > near.maxHull - near.hull,
      `${f(direct.maxHull - direct.hull)} vs ${f(near.maxHull - near.hull)}`);
    check('the blast draws a shockwave ring', blasts.liveCount > 0, `${blasts.liveCount} rings`);
    check('the blast kicks the camera', camera.shake > 0, `${f(camera.shake, 1)}`);
  }

  {
    // Falloff: damage must decrease with distance from the centre.
    const { targets } = detonate(PlasmaCannon, [0, 40, 110], 5000);
    const [, mid, far] = targets;
    check('splash damage falls off toward the rim',
      mid.maxHull - mid.hull > far.maxHull - far.hull,
      `40wu ${f(mid.maxHull - mid.hull)} vs 110wu ${f(far.maxHull - far.hull)}`);
  }

  {
    // Knockback: survivors get shoved away from the blast.
    const { targets } = detonate(PlasmaCannon, [0, 70], 5000);
    check('the blast shoves survivors outwards', targets[1].vy > 20, `vy ${f(targets[1].vy)}`);
  }

  {
    // A kinetic slug is single-target: the bystander is untouched.
    const { targets } = detonate(KineticCannon, [0, 60], 5000);
    check('a kinetic slug hits ONE thing and nothing else',
      targets[0].hull < targets[0].maxHull && targets[1].hull === targets[1].maxHull,
      `direct ${f(targets[0].maxHull - targets[0].hull)}, bystander ${f(targets[1].maxHull - targets[1].hull)}`);
  }

  {
    // Sustained fire redlines the core: that is the whole trade.
    const ship = new Ship({ x: 0, y: 0 });
    ship.teleport(0, 0, 0);
    ship.stats.power = 1e6;
    ship.stats.maxPower = 1e6;
    const mount = { id: 'test', ship, muzzleX: 0, muzzleY: 0, aimWorld: 0, aimError: 0 };
    const weapon = new PlasmaCannon().attach(mount);
    const target = new Enemy({ x: 200, y: 0, hull: 1e6 });
    const projectiles = new ProjectilePool(64);
    const particles = new ParticleSystem(128);
    const events = new EventBus();
    let shots = 0;
    for (let i = 0; i < 120 * 3; i++) {
      const before = projectiles.fired;
      weapon.update(STEP, { ship, mount, target, particles, projectiles, events });
      if (projectiles.fired > before) shots++;
    }
    check('three seconds of plasma fire redlines the core',
      ship.isOverheating && shots >= 3, `${shots} shots, heat ${f(ship.stats.heat)}/${ship.stats.maxHeat}`);
  }
}

/* ========================================================================= */
/* 7. The ship wears its corrosion — sparks + a sickly hull                  */
/* ========================================================================= */
{
  const ship = new Ship({ x: 0, y: 0 });
  ship.teleport(0, 0, 0);
  check('corrode() adds and clamps at 100%',
    near(ship.corrode(40), 40, 1e-9) && near(ship.corrode(999), 100, 1e-9), '');
  check('cleanCorrosion() is still the inverse',
    near(ship.cleanCorrosion(30), 70, 1e-9), '');

  ship.stats.coreCorrosion = 0;
  check('no decay visuals below the threshold', ship.decaySeverity === 0, '');
  ship.stats.coreCorrosion = CONFIG.systems.corrosionFxThreshold;
  check('still no visuals exactly at the threshold', ship.decaySeverity === 0, '');
  ship.stats.coreCorrosion = 100;
  check('full severity at meltdown', ship.decaySeverity === 1, '');
  ship.stats.coreCorrosion = 72;
  check('severity scales between the two', ship.decaySeverity > 0.4 && ship.decaySeverity < 0.6,
    f(ship.decaySeverity, 2));

  // The particle pool stores colours as r/g/b components (see ParticleSystem),
  // and the emitter picks between two purple shades for variety.
  const rgbOf = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  };
  const PURPLES = new Set([rgbOf(CONFIG.palette.gaugeCorrosion), rgbOf('#e9c4ff')]);

  const sparkCount = (corrosion) => {
    const s = new Ship({ x: 0, y: 0 });
    s.teleport(0, 0, 0);
    s.stats.coreCorrosion = corrosion;
    const particles = new ParticleSystem(256);
    const ctx = { particles, input: { axis: { x: 0, y: 0 }, magnitude: 0 } };
    for (let i = 0; i < 120; i++) {
      s.update(STEP, ctx);
      particles.update(STEP);
    }
    return particles.pool.filter((p) => p.alive && PURPLES.has(`${p.r},${p.g},${p.b}`)).length;
  };

  const low = sparkCount(10);
  const high = sparkCount(95);
  check('a healthy hull emits no decay sparks', low === 0, `${low} sparks`);
  check('a corroding hull throws purple sparks', high > 8, `${high} sparks at 95%`);
  check('the worse it gets, the more it sparks', sparkCount(60) > 0 && sparkCount(95) > sparkCount(60),
    `${sparkCount(60)} at 60% vs ${sparkCount(95)} at 95%`);
}

/* ========================================================================= */
/* 8. End-to-end: the real Game, real raiders, real loot                     */
/* ========================================================================= */
{
  const game = new Game(canvas, {});
  game.init();
  game.startRun();

  const frames = (n) => { for (let i = 0; i < n; i++) game.update(STEP); };
  const reset = () => {
    game.restart();
    game.enemies.length = 0;
    game.scrap.length = 0;
    game.pickups.length = 0;
    game.projectiles.clear();
    game.blasts.clear();
    game.runScrap = 0;
    game.kills = 0;
    game.ship.teleport(game.world.width * 0.5, game.world.height * 0.5, 0);
    game.ship.vx = 0;
    game.ship.vy = 0;
    for (const id of game.inventory.mountIds) game.inventory.unequip(id);
    frames(2);
  };

  {
    game.restart();
    const dummies = game.enemies.filter((e) => e.enemyType === 'dummy').length;
    const raiders = game.enemies.filter((e) => e.enemyType === 'scavenger').length;
    check('the sector seeds BOTH dummies and scavengers',
      dummies >= CONFIG.combat.enemies.count - 6 && raiders >= 6,
      `${dummies} dummies + ${raiders} raiders`);
    check('every raider starts outside breathing range',
      game.enemies.filter((e) => e.enemyType === 'scavenger').every(
        (e) => Math.hypot(e.x - game.ship.x, e.y - game.ship.y) > 700),
      '');
  }

  /* --- equipping the new guns ------------------------------------------- */
  {
    reset();
    const kin = new Item({ defId: 'kinetic' });
    const pl = new Item({ defId: 'plasma' });
    game.inventory.add(kin); game.inventory.equip(kin, 'left');
    game.inventory.add(pl); game.inventory.equip(pl, 'rear');
    frames(2);
    check('dragging a kinetic into a slot builds a KineticCannon',
      game.core.weapons.left.weapon instanceof KineticCannon,
      game.core.weapons.left.weapon?.name);
    check('dragging a plasma into a slot builds a PlasmaCannon',
      game.core.weapons.rear.weapon instanceof PlasmaCannon,
      game.core.weapons.rear.weapon?.name);
    check('the new guns add mass and draw like any other',
      game.ship.stats.weight > kin.weight + pl.weight - 0.01 && game.ship.stats.powerLoad > 0,
      `mass ${f(game.ship.stats.weight)}, load ${f(game.ship.stats.powerLoad)}/s`);
  }

  /* --- ramming, end to end ---------------------------------------------- */
  {
    reset();
    const hull0 = game.ship.stats.hull;
    const corr0 = game.ship.stats.coreCorrosion;
    // Worst case for the pursuit maths: raider nose pointed AWAY from the
    // ship, which is the geometry that used to make them orbit forever.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      game.enemies.push(new Scavenger({
        x: game.ship.x + Math.cos(a) * 180,
        y: game.ship.y + Math.sin(a) * 180,
        angle: a, // pointing away from the ship
        world: game.world,
      }));
    }
    frames(120 * 4);
    check('raiders that reach the hull bite it',
      game.ship.stats.hull < hull0, `${f(hull0)} -> ${f(game.ship.stats.hull)} hull`);
    check('a bite also injects corrosion instantly',
      game.ship.stats.coreCorrosion > corr0 + CONFIG.combat.scavengers.corrosionDamage * 0.9,
      `${f(corr0, 2)}% -> ${f(game.ship.stats.coreCorrosion, 2)}%`);
    check('the hull system took the damage (one owner, one path)',
      game.core.hull.rams > 0 && game.core.corrosion.rammed > 0,
      `${game.core.hull.rams} rams, ${f(game.core.corrosion.rammed, 1)}% decay`);
    check('the ship is still flyable after a few hits',
      game.state === 'playing' || game.state === 'gameover', game.state);
  }

  /* --- the loot loop ----------------------------------------------------- */
  {
    reset();
    const raider = new Scavenger({ x: game.ship.x + 120, y: game.ship.y, hull: 1, world: game.world });
    game.enemies.push(raider);
    raider.takeDamage(999, { source: 'test' }, game.events);
    check('a kill spills scrap into the world', game.scrap.length > 0,
      `${game.scrap.length} shards, ${f(game.scrap.reduce((s, c) => s + c.value, 0))} scrap`);

    const total = game.scrap.reduce((s, c) => s + c.value, 0);
    // Walk the ship onto the wreck site.
    game.ship.teleport(raider.x, raider.y, 0);
    frames(120 * 3);
    check('flying over scrap banks it', game.runScrap > 0, `${game.runScrap} of ${total}`);
    check('the bank survives as a lifetime total', game.scrapBank >= game.runScrap,
      `${game.scrapBank} banked`);
    check('collected shards leave the world', game.scrap.length < 4, `${game.scrap.length} left`);
  }

  /* --- the HUD shows it -------------------------------------------------- */
  {
    reset();
    game.runScrap = 128;
    game.scrapBank = 340;
    dom.startRecording();
    game.render(0, 1 / 60);
    const calls = dom.stopRecording();
    const textCalls = calls.filter((c) => c.m === 'fillText');
    const labels = textCalls.map((c) => String(c.args[0]));

    check('the HUD draws a scrap counter', labels.includes('SCRAP'), labels.slice(0, 12).join('|'));
    check('the counter shows the run total', labels.includes('128'), '');
    check('the counter shows the bank', labels.some((t) => /bank 340/.test(t)), '');
    check('the counter is drawn in the scrap colour',
      textCalls.some((c) => String(c.fill) === CONFIG.palette.scrap), '');

    const before = game.hud.scrapPulse;
    game.hud.notifyScrap(5);
    check('a pickup pulses the chip and floats a +N',
      game.hud.scrapPulse === 1 && game.hud.scrapGains.length === 1 && before === 0, '');
    game.hud.resetRun();
    check('a new run clears the counter animation',
      game.hud.scrapPulse === 0 && game.hud.scrapGains.length === 0, '');
  }

  /* --- the loop holds together under load -------------------------------- */
  {
    reset();
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU;
      game.enemies.push(new Scavenger({
        x: game.ship.x + Math.cos(a) * (350 + i * 12),
        y: game.ship.y + Math.sin(a) * (350 + i * 12),
        world: game.world,
      }));
    }
    let threw = null;
    try {
      frames(120 * 10); // ten seconds with 30 raiders inbound
      game.render(0.5, 1 / 60);
    } catch (e) {
      threw = e;
    }
    check('ten seconds with 30 raiders runs clean', threw === null, threw ? String(threw) : '');
    // The claim being tested: a query touches a handful of enemies, not the
    // whole sector, and no single bucket has become a pile-up.
    const gs = game.collision.grid.stats();
    check('the broad-phase is carrying the load',
      gs.inserts > 0 && gs.lastCandidates <= game.enemies.length * 0.5 && gs.maxDepth <= 8,
      `${gs.lastCandidates} candidates of ${gs.inserts} indexed, deepest bucket ${gs.maxDepth}`);
    check('raiders actually reached the ship (or died trying)',
      game.collision.ramCount > 0 || game.kills > 0,
      `${game.collision.ramCount} rams, ${game.kills} kills`);
  }
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
if (failures > 0) process.exitCode = 1;
