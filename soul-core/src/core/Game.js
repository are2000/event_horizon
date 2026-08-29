/**
 * Game.js
 * ----------------------------------------------------------------------------
 * The orchestrator. It owns every subsystem, wires them together, and is the
 * ONLY place that knows about the browser (canvas, window events, the loop).
 *
 * Layering (strict — dependencies point inwards):
 *
 *   Game  ──►  Camera, InputManager, HUD        (presentation + input)
 *         ──►  World, Ship, Particles          (simulation)
 *         ──►  SystemsManager + ShipSystem[]    (the Weight/Heat/Power/
 *                                                Corrosion extension seam)
 *         ──►  Loop                             (time)
 *
 * Frame flow
 *   Loop.update(fixedStep)  ->  Game.update(dt)   (deterministic simulation)
 *   Loop.render(alpha, dt)  ->  Game.render(...)  (interpolated presentation)
 *
 * Adding a new system later is intentionally boring:
 *   game.systems.install(new ReactorSystem({ draw: 0.1 }))
 * ...and it starts affecting thrust through `modifiers` on the next step.
 */
import { CONFIG } from '../config.js';
import { Ship } from '../entities/Ship.js';
import { Enemy } from '../entities/Enemy.js';
import { Scavenger } from '../entities/Scavenger.js';
import { Scrap } from '../entities/Scrap.js';
import { ParticleSystem } from '../fx/ParticleSystem.js';
import { BlastFx } from '../fx/BlastFx.js';
import { SystemsManager } from '../systems/SystemsManager.js';
import { WeightSystem } from '../systems/WeightSystem.js';
import { DriveSystem } from '../systems/DriveSystem.js';
import { PowerSystem } from '../systems/PowerSystem.js';
import { HeatSystem } from '../systems/HeatSystem.js';
import { CorrosionSystem } from '../systems/CorrosionSystem.js';
import { HullSystem } from '../systems/HullSystem.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { EquipmentSystem } from '../systems/EquipmentSystem.js';
import { TargetingManager } from '../combat/TargetingManager.js';
import { ProjectilePool } from '../combat/ProjectilePool.js';
import { CollisionSystem } from '../combat/CollisionSystem.js';
import { Inventory } from '../inventory/Inventory.js';
import { InventoryUI } from '../inventory/InventoryUI.js';
import { Item } from '../inventory/Item.js';
import { ItemPickup } from '../entities/ItemPickup.js';
import { DROP_TABLE } from '../inventory/ItemDefs.js';
import { HUD } from '../ui/HUD.js';
import { VirtualJoystick } from '../ui/VirtualJoystick.js';
import { World } from '../world/World.js';
import { Camera } from './Camera.js';
import { EventBus } from './EventBus.js';
import { InputManager } from './InputManager.js';
import { Loop } from './Loop.js';
import { Viewport } from './Viewport.js';
import { clamp, font, TAU } from './MathUtils.js';

/**
 * Install order == update order for the core systems:
 *   weight     — load factor (read by physics the same step)
 *   drive      — the placeholder consumer: draws power, generates heat
 *   weapons    — mounts rotate, then draw power / dump heat while firing
 *   equipment  — pushes cargo-hold changes (mass, power load, bonuses) onto
 *                the ship and (re)builds the weapon bolted to each mount
 *   power      — capacitor recharge, minus the installed weapons' load
 *   heat       — cooling + overheat penalties
 *   corrosion  — the run timer; emits 'ship:meltdown' at 100%
 *   hull       — damage intake; emits 'ship:destroyed' at 0
 */
const CORE_SYSTEM_ORDER = ['weight', 'drive', 'weapons', 'equipment', 'power', 'heat', 'corrosion', 'hull'];

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   */
  constructor(canvas, opts = {}) {
    /* ------------------------------------------------------- presentation -- */
    this.viewport = new Viewport(canvas, opts.viewport);
    this.camera = new Camera(this.viewport, opts.camera);

    /* ---------------------------------------------------------- messaging -- */
    this.events = new EventBus();

    /* -------------------------------------------------------------- input -- */
    this.joystick = new VirtualJoystick(this.viewport, opts.joystick);
    this.input = new InputManager(this.viewport, this.events, { joystick: this.joystick });

    /* --------------------------------------------------------- simulation -- */
    this.world = opts.world ?? new World(opts.worldOpts);
    this.ship = opts.ship ?? new Ship({ x: this.world.width * 0.5, y: this.world.height * 0.5 });
    this.particles = new ParticleSystem(opts.particleCapacity ?? 512);
    this.systems = new SystemsManager(this.ship, this.events);

    /* The core systems (Weight / Power / Heat / Corrosion / Hull), the drive
       that consumes power and generates heat, and the weapon mounts.
       Handy from devtools: SoulCore.core.weight.addCargo(40) */
    this.core = {
      weight: new WeightSystem(),
      drive: new DriveSystem(),
      weapons: new WeaponSystem(opts.combat),
      // The bridge between the cargo hold and the ship's numbers.
      equipment: new EquipmentSystem({ inventory: null }),
      power: new PowerSystem(),
      heat: new HeatSystem(),
      corrosion: new CorrosionSystem(),
      hull: new HullSystem(),
    };
    // Install order == update order: consumers run before the gauges they
    // feed (drive + guns draw power, then the capacitor recharges...).
    /* --- cargo hold -------------------------------------------------------- */
    /** The inventory model. Never reassigned: the UI and EquipmentSystem both
        hold this reference for the lifetime of the game. */
    this.inventory = new Inventory({ events: this.events });
    this.core.equipment.inventory = this.inventory;
    for (const key of CORE_SYSTEM_ORDER) this.systems.install(this.core[key]);
    this.inventory.load(CONFIG.inventory.startLoadout); // gear -> ship stats

    /* --- combat ----------------------------------------------------------- */
    /** Live enemy list. Never reassigned — restarts refill it in place so the
        TargetingManager's reference stays valid. */
    this.enemies = [];
    this.targeting = new TargetingManager(this.enemies, CONFIG.combat.targeting);
    this.kills = 0;
    /** Shells in flight (cannons). Simulated here so they outlive their gun. */
    this.projectiles = new ProjectilePool(opts.shellCapacity);
    /** Salvage crates (gear) waiting to be collected. @type {ItemPickup[]} */
    this.pickups = [];
    /** Loose scrap (currency) waiting to be collected. @type {Scrap[]} */
    this.scrap = [];
    /** Scrap collected in the CURRENT run (banks when the run ends). */
    this.runScrap = 0;
    /** Scrap banked across runs — the score that survives death. */
    this.scrapBank = 0;

    /* --- collision + blast FX --------------------------------------------- */
    /** Broad-phase index over the enemies + ram resolution. */
    this.collision = new CollisionSystem();
    /** Expanding shockwave rings for explosions. */
    this.blasts = new BlastFx();

    // Shared per-step context for systems that need more than the ship.
    this.systems.context = {
      world: this.world,
      particles: this.particles,
      projectiles: this.projectiles,
      blasts: this.blasts,
      collision: this.collision,
      camera: this.camera,
      events: this.events,
      targeting: this.targeting,
      enemies: this.enemies,
      time: 0,
    };

    /* ----------------------------------------------------------------- ui -- */
    this.hud = new HUD(this.viewport, this.ship);
    /** @type {InventoryUI|null} built in init() once the DOM exists. */
    this.inventoryUI = null;
    /** While the cargo hold is open the world is frozen (safe fiddling). */
    this._pausedBeforeInventory = false;
    this._lastFullToast = -99; // throttle for the "hold is full" toast

    /* -------------------------------------------------------------- state -- */
    /** 'title' | 'playing' | 'gameover' */
    this.state = 'title';
    // Movement input stays off until the run starts, so a stray thumb on the
    // title screen can't fly the ship around behind the overlay.
    this.input.enabled = false;
    this.paused = false;
    this.time = 0; // total time since boot (drives UI animation)
    this.runTime = 0; // time survived in the current run
    this.endReason = null; // 'meltdown' | 'destroyed'
    this.runsCompleted = 0;
    this.debug = opts.debug ?? CONFIG.debug;

    /* --------------------------------------------------------------- loop -- */
    this.loop = new Loop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
      fixedStep: opts.fixedStep ?? CONFIG.loop.fixedStep,
    });

    /* Reused objects — the loop must not allocate. */
    this.updateContext = {
      input: this.input,
      world: this.world,
      ship: this.ship, // enemies need it: the Scavenger AI chases it
      particles: this.particles,
      camera: this.camera,
      events: this.events,
      systems: this.systems,
      time: 0,
      dt: 0,
    };
    /** One context object shared by the collision + projectile steps. */
    this.combatCtx = {
      ship: this.ship,
      world: this.world,
      enemies: this.enemies,
      particles: this.particles,
      blasts: this.blasts,
      camera: this.camera,
      events: this.events,
      grid: this.collision.grid,
      maxEnemyRadius: 26,
      state: this.state,
    };
    this._renderInfo = {
      loop: this.loop,
      input: this.input,
      world: this.world,
      systems: this.systems,
      particles: this.particles,
      camera: this.camera,
      debug: this.debug,
      state: this.state,
      kills: 0,
      targets: 0,
      weapons: this.core.weapons,
      targeting: this.targeting,
      cargo: this.inventory,
      projectiles: this.projectiles,
      pickups: 0,
      scrap: 0,
      runScrap: 0,
      scrapBank: 0,
      enemies: this.enemies,
      collision: this.collision,
      blasts: this.blasts,
      frameDt: 0,
    };
    this._camTarget = { x: 0, y: 0, vx: 0, vy: 0 };
  }

  /* ================================================================ setup == */

  init() {
    // Size the canvas before anything reads the viewport.
    this.viewport.resize();

    const b = this.world.bounds;
    this.camera.setBounds(b.x, b.y, b.width, b.height);
    this.camera.snapTo(this.ship.x, this.ship.y);

    this.joystick.layout();
    this.hud.layout();

    // DOM overlay for the cargo hold (needs the #ui-layer element).
    this.inventoryUI = new InventoryUI({ game: this, inventory: this.inventory });
    this._syncInventoryVisibility();

    this._spawnEnemies();

    this._bindEvents();
    this.input.attach();

    this.loop.start();
    return this;
  }

  /**
   * (Re)populate the sector: stationary dummies to shoot, and scavenger
   * raiders that shoot back. Both share the same placement maths, so the two
   * populations never spawn inside each other (or inside a rock).
   */
  _spawnEnemies() {
    this.enemies.length = 0; // keep the array identity: targeting watches it
    const avoid = { x: this.world.width * 0.5, y: this.world.height * 0.5 };

    const dummies = Enemy.spawnField({
      world: this.world,
      count: CONFIG.combat.enemies.count,
      seed: this.world.seed ^ 0x5bf03635,
      avoid,
    });
    const raiders = Scavenger.spawnField({
      world: this.world,
      count: CONFIG.combat.scavengers.count,
      seed: this.world.seed ^ 0x1f2e3d4c,
      avoid,
      // Raiders start further out: you should always get a moment to breathe.
      minDistanceFromSpawn: CONFIG.combat.scavengers.respawnMinDistance * 0.75,
    });

    for (let i = 0; i < dummies.length; i++) this.enemies.push(dummies[i]);
    for (let i = 0; i < raiders.length; i++) this.enemies.push(raiders[i]);
    this.targeting.enemies = this.enemies;
    return this.enemies;
  }

  _bindEvents() {
    const onResize = () => this.onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // iOS: the visual viewport changes when the URL bar collapses or the
    // keyboard shows up — a plain 'resize' doesn't always fire.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
    }
    // Some browsers settle the layout a frame or two after rotating.
    window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

    this.viewport.onResize(() => {
      this.joystick.layout();
      this.hud.layout();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.paused = true;
        document.body.classList.add('is-hidden');
      } else {
        // Don't un-freeze the world if the cargo hold is still open.
        this.paused = !!this.inventoryUI?.isOpen;
        document.body.classList.remove('is-hidden');
        // Drop the "time away" so the ship doesn't jump on resume.
        this.loop.resetTiming();
      }
    });

    // Start (or restart) the run on the first touch / click / key.
    this.events.on('input:tap', () => this._onConfirm());
    this.events.on('input:down', () => this._onConfirm());
    this.events.on('input:key', ({ code }) => this._onKey(code));

    /* --- the run ends when the core systems say so ------------------------ */
    this.events.on('ship:meltdown', () => this._endRun('meltdown'));
    this.events.on('ship:destroyed', () => this._endRun('destroyed'));
    this.events.on('ship:damaged', ({ amount }) => {
      // Screen flash scaled by how hard we were hit.
      this.hud.flash = Math.min(1, this.hud.flash + amount / 55);
    });

    /* --- combat feedback --------------------------------------------------- */
    this.events.on('enemy:destroyed', ({ x, y }) => {
      this.kills++;
      this.particles.burst(46, {
        x, y, speed: 300, life: 0.85, size: 5, color: '#ff8a3c', drag: 2.2, jitter: 18,
      });
      this.particles.burst(18, {
        x, y, speed: 620, life: 0.35, size: 3, color: '#ffffff', drag: 3.4, jitter: 8,
      });
      // Killing things is a little bit loud.
      this.camera.addShake(2.5);
      this._maybeDropSalvage(x, y);
    });

    this.events.on('enemy:destroyed', ({ x, y, enemy }) => {
      this._dropScrap(x, y, enemy);
    });
  }

  /* ============================================================== salvage == */

  /**
   * Roll for a drop when something dies. Salvage is the only way the hold
   * grows, which is what makes merging a loop instead of a one-off puzzle.
   */
  _maybeDropSalvage(x, y) {
    if (this.state !== 'playing') return null;
    if (this.pickups.length >= CONFIG.inventory.maxPickups) return null;
    if (Math.random() > CONFIG.inventory.dropChance) return null;

    let total = 0;
    for (const key in DROP_TABLE) total += DROP_TABLE[key];
    let roll = Math.random() * total;
    let defId = 'laser';
    for (const key in DROP_TABLE) {
      roll -= DROP_TABLE[key];
      if (roll <= 0) {
        defId = key;
        break;
      }
    }

    const pickup = new ItemPickup({ x, y, item: new Item({ defId }) });
    this.pickups.push(pickup);
    return pickup;
  }

  /**
   * Scrap is the run currency: it spills out of the wreck, drifts, then flies
   * to the ship once you are close enough. (Salvage crates are gear; scrap is
   * a number. Two systems, two entities — see Scrap.js.)
   *
   * @param {number} x
   * @param {number} y
   * @param {import('../entities/Enemy.js').Enemy} [enemy]
   */
  _dropScrap(x, y, enemy) {
    const cfg = CONFIG.economy.scrap;
    if (this.scrap.length >= cfg.maxEntities) return 0;

    const value = Math.max(1, Math.round(enemy?.scrapValue ?? cfg.dummyBonus));
    const cluster = Scrap.scatter({ x, y, amount: value });
    let dropped = 0;
    for (let i = 0; i < cluster.length && this.scrap.length < cfg.maxEntities; i++) {
      this.scrap.push(cluster[i]);
      dropped += cluster[i].value;
    }
    return dropped;
  }

  /** Bank a shard: the run counter grows, and so does the lifetime total. */
  _collectScrap(shard) {
    this.runScrap += shard.value;
    this.scrapBank += shard.value;
    this.particles.burst(8, {
      x: shard.x, y: shard.y, speed: 170, life: 0.4,
      size: 2.6, color: CONFIG.palette.scrap, drag: 2.6, jitter: 8,
    });
    this.events.emit('scrap:collected', { value: shard.value, total: this.runScrap, shard });
    this.hud.notifyScrap(shard.value);
    return shard.value;
  }

  /** Fly over a crate to collect it. */
  _collect(pickup) {
    const item = pickup.item;
    const added = this.inventory.add(item);
    if (!added) {
      // Throttled: you can sit on a full hold for a long time.
      if (this.time - this._lastFullToast > 2.5) {
        this._lastFullToast = this.time;
        this.inventoryUI?.toast('hold is full', 'bad');
      }
      return false;
    }
    pickup.collected = true;
    pickup.alive = false;
    this.particles.burst(16, {
      x: pickup.x, y: pickup.y, speed: 200, life: 0.6, size: 3.4, color: item.color, drag: 2.4, jitter: 10,
    });
    this.inventoryUI?.toast(`salvaged ${item.name}`, 'good');
    this.events.emit('item:picked-up', { item, pickup });
    return true;
  }

  /* =========================================================== inventory == */

  /** Show/hide the DOM layer and freeze the world while it is open. */
  _syncInventoryVisibility(force = null) {
    const ui = this.inventoryUI;
    if (!ui) return;
    const visible = force ?? (this.state === 'playing');
    ui.root.classList.toggle('is-live', !!visible && !ui.isOpen);
  }

  /**
   * Pause for the cargo hold. Inventory fiddling should never cost you hull,
   * so while the panel is open the simulation is frozen (rendering continues,
   * so the frozen scene is still visible behind the panel).
   */
  pauseForInventory(on) {
    if (on) {
      this._pausedBeforeInventory = this.paused;
      this.paused = true;
      this.input.enabled = false;
    } else {
      this.paused = !!this._pausedBeforeInventory;
      this.input.enabled = this.state === 'playing';
      this.loop.resetTiming();
    }
    this._syncInventoryVisibility(this.state === 'playing');
  }

  openInventory() {
    return this.inventoryUI?.open();
  }

  closeInventory() {
    return this.inventoryUI?.close();
  }

  toggleInventory() {
    if (!this.inventoryUI) return null;
    if (this.state !== 'playing') return null;
    return this.inventoryUI.toggle();
  }

  /** Tap / click: start the run, or restart after a game over. */
  _onConfirm() {
    if (this.state === 'title') this.startRun();
    else if (this.state === 'gameover') this.restart();
  }

  onResize() {
    this.viewport.resize();
    // Bounds depend on the zoom (which depends on viewport height).
    const b = this.world.bounds;
    this.camera.setBounds(b.x, b.y, b.width, b.height);
    this.camera.clampToBounds();
  }

  /* ============================================================== control == */

  startRun() {
    if (this.state === 'playing') return;
    this.state = 'playing';
    this.input.enabled = true;
    this.runTime = 0;
    this._syncInventoryVisibility();
    this.events.emit('run:start', { ship: this.ship, world: this.world });
  }

  /**
   * End the run. Called by the 'ship:meltdown' (corrosion hit 100%) and
   * 'ship:destroyed' (hull hit 0) events, so the Game never has to poll the
   * gauges — the systems decide when you die.
   * @param {'meltdown'|'destroyed'} reason
   */
  _endRun(reason) {
    if (this.state !== 'playing') return;
    this.state = 'gameover';
    this.endReason = reason;
    this.input.enabled = false;
    // Never leave the cargo hold covering the wreck: closing it also un-pauses.
    this.closeInventory();
    this.ship.alive = false;
    this.ship.visible = false; // the wreck is now debris + particles
    this.hud.flash = 1;
    this._explode();
    this._syncInventoryVisibility();
    this.runsCompleted++;
    this.events.emit('run:end', { reason, time: this.runTime, ship: this.ship });
  }

  /** Big, cheap, satisfying explosion: three debris shells + full shake. */
  _explode() {
    const { x, y } = this.ship;
    this.particles.burst(150, {
      x, y, speed: 520, life: 1.1, size: 6, color: '#ffb347', drag: 1.6, jitter: 24,
    });
    this.particles.burst(70, {
      x, y, speed: 240, life: 1.9, size: 10, color: '#ff4d6d', drag: 1.1, jitter: 36,
    });
    this.particles.burst(45, {
      x, y, speed: 760, life: 0.45, size: 3, color: '#ffffff', drag: 3.2, jitter: 10,
    });
    this.camera.addShake(this.camera.maxShake);
  }

  /**
   * Fresh run: new sector, factory-fresh ship, every system reset. Ratings
   * bought in the meta layer survive (Ship.reset keeps the max* stats).
   * @param {number} [seed] defaults to the next seed in sequence
   */
  restart(seed) {
    const nextSeed = seed ?? (this.world.seed + 1) >>> 0;
    this.world = new World({
      seed: nextSeed,
      width: this.world.width,
      height: this.world.height,
      obstacleCount: this.world.obstacleCount,
      gridSize: this.world.gridSize,
    });
    this.updateContext.world = this.world;
    this._renderInfo.world = this.world; // the HUD minimap reads this
    if (this.systems.context) this.systems.context.world = this.world;

    this.camera.setBounds(this.world.bounds.x, this.world.bounds.y, this.world.bounds.width, this.world.bounds.height);
    this.ship.reset(this.world.width * 0.5, this.world.height * 0.5, -Math.PI / 2);
    this.systems.reset();
    this.particles.clear();
    this.camera.snapTo(this.ship.x, this.ship.y);

    this._spawnEnemies(); // fresh dummies for the fresh sector
    this.kills = 0;
    // Gear survives death (that's the meta layer for now) — EquipmentSystem
    // re-applies it to the freshly-reset ship during systems.reset().
    this.pickups.length = 0;
    this.projectiles.clear();
    this.scrap.length = 0;
    this.blasts.clear();
    this.collision.clear();
    this.runScrap = 0; // banked already — see scrapBank

    this.hud.resetRun();
    this.runTime = 0;
    this.endReason = null;
    this.state = 'playing';
    this.input.enabled = true;
    this._syncInventoryVisibility();
    this.events.emit('run:start', { ship: this.ship, world: this.world, restart: true });
    return this;
  }

  togglePause() {
    this.paused = !this.paused;
    if (!this.paused) this.loop.resetTiming();
  }

  /** Dump a quarter of the hold overboard (J) — the answer to being overloaded. */
  jettisonCargo() {
    const dropped = this.core.weight.jettison(this.ship.stats.maxWeight * 0.25);
    if (dropped > 0) {
      this.particles.burst(24, {
        x: this.ship.x, y: this.ship.y, speed: 160, life: 0.9,
        size: 4, color: '#8bd450', drag: 1.4, jitter: 14,
      });
    }
    return dropped;
  }

  /** Debug helper (Digit6): drop a live raider `dist` wu from the ship. */
  _debugSpawnRaider(dist = 260) {
    const a = Math.random() * TAU;
    const raider = new Scavenger({
      x: clamp(this.ship.x + Math.cos(a) * dist, 60, this.world.width - 60),
      y: clamp(this.ship.y + Math.sin(a) * dist, 60, this.world.height - 60),
      angle: a,
      world: this.world,
    });
    this.enemies.push(raider);
    return raider;
  }

  _onKey(code) {
    switch (code) {
      case 'Backquote':
      case 'F3':
        this.debug = !this.debug;
        break;
      case 'KeyP':
        this.togglePause();
        break;
      case 'KeyR':
        this.restart();
        break;
      case 'KeyJ':
        this.jettisonCargo();
        break;
      case 'KeyI':
      case 'Tab':
        this.toggleInventory();
        break;
      case 'Escape':
        this.closeInventory();
        break;
      case 'Enter':
      case 'Space':
        this._onConfirm();
        break;
      default:
        this._onDebugKey(code);
    }
  }

  /**
   * Debug-only gauge pokes (with ` on) so each system can be exercised
   * without playing for four minutes first.
   */
  _onDebugKey(code) {
    if (!this.debug) return;
    const s = this.ship.stats;
    switch (code) {
      case 'Digit1': // +25% heat  -> watch the overheat penalty kick in
        this.ship.generateHeat(s.maxHeat * 0.25);
        break;
      case 'Digit2': // +20% cargo mass -> watch acceleration die
        this.core.weight.addCargo(s.maxWeight * 0.2);
        break;
      case 'Digit3': // +10% corrosion -> creep toward meltdown
        s.coreCorrosion = clamp(s.coreCorrosion + 10, 0, 100);
        break;
      case 'Digit4': // drain 30% of the capacitor -> brownout
        this.ship.consumePower(s.maxPower * 0.3);
        break;
      case 'Digit5': // -25 hull
        this.ship.damage(s.maxHull * 0.25);
        this.systems.get('hull')?.events?.emit('ship:damaged', { amount: s.maxHull * 0.25, source: 'debug' });
        break;
      case 'Digit6': // spawn a raider 260wu off the nose — test the chase
        this._debugSpawnRaider(260);
        break;
      case 'Digit7': // drop 10 scrap on the spot — test the magnet/collection
        for (const shard of Scrap.scatter({ x: this.ship.x + 90, y: this.ship.y, amount: 10 })) {
          this.scrap.push(shard);
        }
        break;
      case 'Digit0': // full service
        s.heat = 0;
        s.power = s.maxPower;
        s.coreCorrosion = 0;
        s.hull = s.maxHull;
        // NOT s.weight = 0: the hold's mass is owned by the weight system and
        // re-applied as a delta every step, so zeroing the stat behind its
        // back desyncs the two.
        this.core.weight.jettison(Infinity);
        this.ship.alive = true;
        break;
      default:
        break;
    }
  }

  /* ============================================================== simulate == */

  /**
   * Fixed-step simulation. `dt` is ALWAYS CONFIG.loop.fixedStep — never do
   * per-frame (variable dt) work in here.
   * @param {number} dt
   */
  update(dt) {
    if (this.paused) return;

    this.time += dt;
    this.updateContext.time = this.time;
    this.updateContext.dt = dt;
    const sysCtx = this.systems.context;
    if (sysCtx) sysCtx.time = this.time;

    // 1. Input (joystick + keyboard -> normalised axis)
    this.input.update(dt);
    if (this.input.magnitude > 0.15) this.hud.notifyInput();

    // 2. Systems -> modifiers. Only while a run is live: the Great Decay
    //    must not eat the hull while we're sitting on the title screen, and
    //    frozen gauges on the game-over screen make the wreck readable.
    if (this.state === 'playing') {
      this.runTime += dt;
      this.systems.update(dt);
    }

    // 3. Entities (on game over the hulk keeps drifting with its last modifiers)
    this.ship.update(dt, this.updateContext);

    // 4. World, enemies + FX (dummies tick on the game-over screen too, so
    //    their respawn timers keep running and the wreck stays readable)
    this.world.update(dt);
    for (let i = 0; i < this.enemies.length; i++) this.enemies[i].update(dt, this.updateContext);
    this.particles.update(dt);

    /* 4b. COLLISION. Runs here, after both the ship and the enemies have
           integrated, because a ram is a question about positions that were
           only just decided. It also rebuilds the broad-phase grid that the
           shells below query. */
    const cc = this.combatCtx;
    cc.state = this.state;
    this.collision.update(dt, cc);
    // Read AFTER the collision pass: it recomputes the widest enemy radius
    // while indexing, and the shells below use it as their query margin.
    cc.maxEnemyRadius = this.collision.maxEnemyRadius;

    /* 4c. Shells in flight + salvage. Both live in WORLD space and are
           simulated here rather than by the weapon that made them. */
    this.projectiles.update(dt, cc);
    this.blasts.update(dt);

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt, this.updateContext);
      if (!p.alive) {
        this.pickups.splice(i, 1);
        continue;
      }
      if (this.state === 'playing' &&
        Math.hypot(p.x - this.ship.x, p.y - this.ship.y) <= CONFIG.inventory.pickupRadius) {
        if (this._collect(p)) this.pickups.splice(i, 1);
      }
    }

    /* 4d. Scrap: drifts, then flies to the ship, then banks. */
    for (let i = this.scrap.length - 1; i >= 0; i--) {
      const sc = this.scrap[i];
      const got = sc.update(dt, this.updateContext);
      if (got && this.state === 'playing') this._collectScrap(sc);
      if (!sc.alive) this.scrap.splice(i, 1);
    }

    // 5. Camera last: it follows the ship's freshly integrated position.
    const t = this._camTarget;
    t.x = this.ship.x;
    t.y = this.ship.y;
    t.vx = this.ship.vx;
    t.vy = this.ship.vy;
    this.camera.update(dt, t);

    // Zoom out a touch at speed: cheap "sense of velocity" trick.
    const speedT = clamp((this.ship.speedValue ?? 0) / this.ship.maxSpeed, 0, 1);
    this.camera.targetZoomBias = 1 - speedT * 0.06;
  }

  /* ================================================================ render == */

  /**
   * @param {number} alpha interpolation factor in [0,1) between the last two
   *                        fixed steps
   * @param {number} frameDt real (variable) frame delta — UI animation only
   */
  render(alpha, frameDt) {
    const vp = this.viewport;
    const ctx = vp.beginFrame();

    /* --- background -------------------------------------------------------- */
    vp.clear(CONFIG.palette.background);
    // Parallax stars are screen-space: they must NOT be camera transformed.
    this.world.renderBackground(ctx, this.camera, vp, alpha);

    /* --- world -------------------------------------------------------------- */
    ctx.save();
    this.camera.applyTransform(ctx, alpha);
    this.world.renderGround(ctx, this.camera, vp);
    this.world.renderObstacles(ctx, this.camera);

    // Enemies sit between the rocks and the ship; beams go on top of both.
    for (let i = 0; i < this.enemies.length; i++) this.enemies[i].render(ctx, alpha);
    for (let i = 0; i < this.pickups.length; i++) this.pickups[i].render(ctx, alpha);
    for (let i = 0; i < this.scrap.length; i++) this.scrap[i].render(ctx, alpha);
    this.projectiles.render(ctx, alpha);
    this.blasts.render(ctx);

    this.particles.render(ctx);
    if (this.ship.visible) this.ship.render(ctx, alpha);
    if (this.state === 'playing' || this.state === 'gameover') {
      this.core.weapons.render(ctx, alpha); // turrets + beams
    }
    if (this.debug) this._renderWorldDebug(ctx, alpha);
    ctx.restore();

    /* --- screen space UI ---------------------------------------------------- */
    this.hud.update(frameDt);
    this.hud.renderFlash(ctx);
    this.joystick.render(ctx);

    this._renderInfo.debug = this.debug;
    this._renderInfo.state = this.state;
    this._renderInfo.frameDt = frameDt;
    this._renderInfo.kills = this.kills;
    this._renderInfo.targets = this.targeting.aliveCount;
    this._renderInfo.pickups = this.pickups.length;
    this._renderInfo.scrap = this.scrap.length;
    this._renderInfo.runScrap = this.runScrap;
    this._renderInfo.scrapBank = this.scrapBank;
    this.hud.render(ctx, this._renderInfo);

    if (this.state === 'title') this._renderTitle(ctx, frameDt);
    else if (this.state === 'gameover') this._renderGameOver(ctx);
    // The cargo hold is its own pause screen, so don't stack PAUSED on top.
    if (this.paused && !this.inventoryUI?.isOpen) this._renderPaused(ctx);
  }

  /** Collision circles, heading vs velocity vectors (drift visualiser). */
  _renderWorldDebug(ctx, alpha) {
    const s = this.ship;
    const x = s.getRenderX(alpha);
    const y = s.getRenderY(alpha);

    // Collision radius
    ctx.strokeStyle = 'rgba(255, 80, 120, 0.8)';
    ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.beginPath();
    ctx.arc(x, y, s.radius, 0, TAU);
    ctx.stroke();

    // Heading (white) vs velocity (cyan): the angle between them IS the drift.
    const hx = Math.cos(s.getRenderAngle(alpha));
    const hy = Math.sin(s.getRenderAngle(alpha));
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + hx * 120, y + hy * 120);
    ctx.stroke();

    const sp = s.speedValue ?? 0;
    if (sp > 1) {
      ctx.strokeStyle = 'rgba(53,224,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (s.vx / sp) * sp * 0.35, y + (s.vy / sp) * sp * 0.35);
      ctx.stroke();
    }
  }

  _renderTitle(ctx) {
    const vp = this.viewport;
    const p = CONFIG.palette;
    const w = vp.width;
    const h = vp.height;

    ctx.save();
    ctx.fillStyle = 'rgba(3, 5, 12, 0.72)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cx = w * 0.5;
    const cy = h * 0.36;
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 2.2);

    ctx.fillStyle = p.text;
    ctx.font = font(Math.min(34, w * 0.098), 800);
    ctx.fillText('SOUL CORE', cx, cy);

    ctx.fillStyle = p.accent;
    ctx.font = font(Math.min(15, w * 0.042), 600);
    ctx.fillText('T H E   G R E A T   D E C A Y', cx, cy + 30);

    ctx.fillStyle = p.textDim;
    ctx.font = font(11, 500);
    ctx.fillText('PHASE 4 · CARGO & MERGE', cx, cy + 58);

    ctx.globalAlpha = pulse;
    ctx.fillStyle = p.accent;
    ctx.font = font(13, 700);
    ctx.fillText('TAP TO BEGIN', cx, h * 0.62);
    ctx.globalAlpha = 1;

    ctx.fillStyle = p.textDim;
    ctx.font = font(10, 500);
    ctx.fillText('the core is already decaying — watch the purple', cx, h * 0.62 + 22);
    ctx.fillText('virtual stick · WASD on desktop · I = cargo · ` for debug', cx, h * 0.62 + 38);
    if (this.scrapBank > 0) {
      ctx.fillStyle = p.scrap;
      ctx.font = font(11, 700);
      ctx.fillText(`SCRAP BANK  ${this.scrapBank}`, cx, h * 0.62 + 60);
    }

    ctx.restore();
  }

  /** Meltdown / destroyed end screen. */
  _renderGameOver(ctx) {
    const vp = this.viewport;
    const p = CONFIG.palette;
    const w = vp.width;
    const h = vp.height;
    const meltdown = this.endReason === 'meltdown';

    ctx.save();
    ctx.fillStyle = meltdown ? 'rgba(24, 6, 34, 0.78)' : 'rgba(28, 6, 10, 0.78)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = w * 0.5;
    const cy = h * 0.38;
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 2.4);

    ctx.fillStyle = meltdown ? p.gaugeCorrosion : p.gaugeCritical;
    ctx.font = font(Math.min(30, w * 0.088), 800);
    ctx.fillText(meltdown ? 'CORE MELTDOWN' : 'HULL BREACH', cx, cy);

    ctx.fillStyle = p.text;
    ctx.font = font(12, 600);
    ctx.fillText(
      meltdown ? 'The Great Decay finished what the void started.'
        : 'The plating gave out before the core did.',
      cx, cy + 28,
    );

    const t = this.runTime;
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    ctx.fillStyle = p.textDim;
    ctx.font = font(11, 500);
    ctx.fillText(`SURVIVED ${mm}:${ss}`, cx, cy + 56);
    const stats = this.ship.stats;
    ctx.fillText(
      `CORROSION ${stats.coreCorrosion.toFixed(0)}%   ·   HULL ${Math.max(0, stats.hull).toFixed(0)}   ·   RUN #${this.runsCompleted + 1}`,
      cx, cy + 74,
    );
    ctx.fillStyle = p.scrap;
    ctx.font = font(13, 700);
    ctx.fillText(`SCRAP BANKED  ${this.runScrap}`, cx, cy + 98);
    ctx.fillStyle = p.textDim;
    ctx.font = font(10, 500);
    // scrapBank is already the lifetime total (every shard adds to both).
    ctx.fillText(`lifetime ${this.scrapBank}`, cx, cy + 114);

    ctx.globalAlpha = pulse;
    ctx.fillStyle = p.accent;
    ctx.font = font(13, 700);
    ctx.fillText('TAP TO RESTART', cx, h * 0.66);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  _renderPaused(ctx) {
    const vp = this.viewport;
    ctx.save();
    ctx.fillStyle = 'rgba(3, 5, 12, 0.55)';
    ctx.fillRect(0, 0, vp.width, vp.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CONFIG.palette.text;
    ctx.font = font(20, 800);
    ctx.fillText('PAUSED', vp.width * 0.5, vp.height * 0.5);
    ctx.font = font(11, 500);
    ctx.fillStyle = CONFIG.palette.textDim;
    ctx.fillText('press P to resume', vp.width * 0.5, vp.height * 0.5 + 22);
    ctx.restore();
  }

  /* ================================================================== misc == */

  /** Human-readable state for the console / devtools. */
  status() {
    const s = this.ship.stats;
    return {
      state: this.state,
      runTime: this.runTime.toFixed(1),
      hull: `${s.hull.toFixed(0)}/${s.maxHull}`,
      power: `${s.power.toFixed(0)}/${s.maxPower}`,
      heat: `${s.heat.toFixed(0)}/${s.maxHeat}`,
      corrosion: `${s.coreCorrosion.toFixed(1)}%`,
      weight: `${s.weight.toFixed(1)}/${s.maxWeight}`,
      thrustMul: this.systems.modifiers.thrustMul.toFixed(2),
      scrap: `${this.runScrap} this run / ${this.scrapBank} lifetime`,
      raiders: this.enemies.filter((e) => e.enemyType === 'scavenger' && e.alive).length,
    };
  }

  destroy() {
    this.loop.stop();
    this.input.detach();
    this.inventoryUI?.destroy();
  }
}

export default Game;
