// Inventory & merge tests: model, ship integration, and real drag-and-drop
// through the DOM overlay (stubbed).
//   node tools/inventory.test.js
import { installDomStub } from './dom-stub.mjs';

const dom = installDomStub({ width: 390, height: 844, dpr: 2 });
const { canvas, canvasHandlers, windowHandlers, fire } = dom;

const { Game } = await import('../src/core/Game.js');
const { CONFIG } = await import('../src/config.js');
const { Inventory } = await import('../src/inventory/Inventory.js');
const { Item } = await import('../src/inventory/Item.js');
const { ITEM_DEFS } = await import('../src/inventory/ItemDefs.js');
const { LaserWeapon } = await import('../src/combat/LaserWeapon.js');
const { CannonWeapon } = await import('../src/combat/CannonWeapon.js');
const { InventoryUI } = await import('../src/inventory/InventoryUI.js');
const { ItemPickup } = await import('../src/entities/ItemPickup.js');
const { Enemy } = await import('../src/entities/Enemy.js');
const { EventBus } = await import('../src/core/EventBus.js');

const STEP = CONFIG.loop.fixedStep;
const GAP = 6; // must match --inv-gap in style.css

let failures = 0;
const f = (n, d = 1) => n.toFixed(d);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}

/* ============================================================ 1. items ===== */
{
  const laser1 = new Item({ defId: 'laser', tier: 1 });
  const laser2 = new Item({ defId: 'laser', tier: 2 });

  check('items are named with their tier', laser1.name === 'Laser T1' && laser2.name === 'Laser T2',
    `${laser1.name} / ${laser2.name}`);
  check('weapons are 1x2, modules are 1x1',
    laser1.w === 1 && laser1.h === 2 && new Item({ defId: 'capacitor' }).cells === 1, `${laser1.w}x${laser1.h}`);
  check('rotation swaps the footprint', (() => {
    const i = new Item({ defId: 'laser' });
    i.rotate();
    return i.w === 2 && i.h === 1;
  })(), '');
  check('1x1 items cannot rotate', new Item({ defId: 'plating' }).rotate() === false, '');
  check('tier scaling raises damage faster than mass', (() => {
    const t4 = new Item({ defId: 'laser', tier: 4 });
    return t4.stats.dps > laser1.stats.dps * 4 && t4.weight < laser1.weight * 2.5;
  })(), `T1 ${laser1.stats.dps}dps/${laser1.weight}kg vs T4 ${new Item({ defId: 'laser', tier: 4 }).stats.dps}dps/${new Item({ defId: 'laser', tier: 4 }).weight}kg`);
  check('higher tiers cost more power and heat',
    new Item({ defId: 'laser', tier: 3 }).stats.powerDraw > laser1.stats.powerDraw &&
    new Item({ defId: 'laser', tier: 3 }).stats.heat > laser1.stats.heat, '');
  check('tier 4 is the top of the ladder', new Item({ defId: 'laser', tier: 4 }).maxed === true &&
    new Item({ defId: 'laser', tier: 3 }).maxed === false, '');
  check('installed guns draw standby power', laser1.load > 0 && laser1.load < laser1.stats.powerDraw,
    `${laser1.load}/s of ${laser1.stats.powerDraw}/s`);
  check('weaponConfig matches the weapon class contract', (() => {
    const cfg = new Item({ defId: 'cannon', tier: 2 }).weaponConfig();
    return cfg.shotsPerSecond > 0 && cfg.damage > 0 && cfg.powerPerShot > 0 && cfg.range > 0;
  })(), '');
  check('every catalogue entry is complete', Object.values(ITEM_DEFS).every((d) =>
    d.name && d.kind && d.size && d.color && d.icon && d.desc &&
    (d.kind !== 'weapon' || (d.weaponType && (d.dps || d.damage))) &&
    (d.kind !== 'module' || d.bonus)), '');
  check('toolip stats list is populated', new Item({ defId: 'capacitor' }).describe().length >= 2,
    JSON.stringify(new Item({ defId: 'capacitor' }).describe()));
}

/* ======================================================= 2. grid placement == */
{
  const inv = new Inventory({});
  check('the hold is 5x6', inv.cols === 5 && inv.rows === 6 && inv.size === 30, `${inv.cols}x${inv.rows}`);

  const laser = inv.addDef('laser');
  check('a weapon is placed in the first free cell', laser.col === 0 && laser.row === 0, `${laser.col},${laser.row}`);
  check('a 1x2 item owns two cells',
    inv.itemAt(0, 0) === laser && inv.itemAt(0, 1) === laser && inv.itemAt(0, 2) === null, '');
  check('occupied cells reject other items', inv.canPlace(new Item({ defId: 'laser' }), 0, 1) === false, '');

  const cap = inv.addDef('capacitor');
  check('the next item skips the occupied footprint', cap.col === 1 && cap.row === 0, `${cap.col},${cap.row}`);

  check('out-of-bounds placement is refused',
    inv.canPlace(new Item({ defId: 'laser' }), 0, 5) === false &&
    inv.canPlace(new Item({ defId: 'laser' }), 5, 0) === false, '');

  check('a move that overlaps is refused', inv.move(cap, 0, 0) === false && cap.col === 1, '');
  check('a legal move updates the occupancy map', (() => {
    inv.move(cap, 4, 5);
    return inv.itemAt(4, 5) === cap && inv.itemAt(1, 0) === null;
  })(), '');

  check('rotation keeps the item legal', (() => {
    inv.move(laser, 2, 2);
    const ok = inv.rotate(laser);
    return ok && laser.w === 2 && laser.h === 1 && inv.itemAt(2, 2) === laser && inv.itemAt(3, 2) === laser;
  })(), `${laser.w}x${laser.h} at ${laser.col},${laser.row}`);

  check('removing an item frees its cells', (() => {
    const before = inv.items.length;
    inv.remove(cap);
    return inv.items.length === before - 1 && inv.itemAt(4, 5) === null;
  })(), '');

  // Fill the hold and prove it refuses politely.
  const full = new Inventory({});
  let added = 0;
  for (let i = 0; i < 40; i++) if (full.addDef('plating')) added++;
  check('the hold fills up and then refuses', added === 30 && full.items.length === 30, `${added} items`);
  let overflowEvent = 0;
  full.events = new EventBus();
  full.events.on('inventory:full', () => overflowEvent++);
  check('a full hold announces it instead of eating the item',
    full.addDef('plating') === null && overflowEvent === 1, '');
}

/* ============================================================== 3. merging == */
{
  const inv = new Inventory({});
  const a = inv.addDef('laser');
  const b = inv.addDef('laser');

  check('two identical items can merge', a.canMergeWith(b) && b.canMergeWith(a), '');
  check('an item cannot merge with itself', a.canMergeWith(a) === false, '');

  const merged = inv.merge(b, a);
  check('merging consumes one and upgrades the other',
    merged === a && a.tier === 2 && inv.items.length === 1, `${a.name}, ${inv.items.length} left`);
  check('the survivor keeps its position', a.col === 0 && a.row === 0 && inv.itemAt(0, 0) === a, '');

  check('different items do not merge', (() => {
    const i = new Inventory({});
    const laser = i.addDef('laser');
    const cannon = i.addDef('cannon');
    return i.merge(laser, cannon) === null && i.items.length === 2;
  })(), '');

  check('different tiers do not merge', (() => {
    const i = new Inventory({});
    const t1 = i.addDef('laser');
    const t2 = i.addDef('laser', 2);
    return i.merge(t1, t2) === null && i.items.length === 2;
  })(), '');

  check('max-tier items do not merge', (() => {
    const i = new Inventory({});
    const t4a = i.addDef('laser', 4);
    const t4b = i.addDef('laser', 4);
    return i.merge(t4a, t4b) === null && i.items.length === 2 && t4a.tier === 4;
  })(), '');

  check('the merge ladder climbs one tier at a time', (() => {
    const i = new Inventory({});
    const base = i.addDef('laser');
    for (let tier = 2; tier <= 4; tier++) {
      const dupe = i.addDef('laser', tier - 1);
      i.merge(dupe, base);
      if (base.tier !== tier) return false;
    }
    return base.tier === 4 && i.items.length === 1;
  })(), '');

  check('merging emits an event with the new tier', (() => {
    const i = new Inventory({ events: new EventBus() });
    let seen = null;
    i.events.on('item:merged', (e) => { seen = e; });
    const a = i.addDef('laser');
    const b = i.addDef('laser');
    i.merge(b, a);
    return seen && seen.tier === 2 && seen.item === a && seen.consumed === b;
  })(), '');

  check('merged stats are recalculated, not cached', (() => {
    const i = new Inventory({});
    const a = i.addDef('laser');
    const before = a.stats.dps;
    const b = i.addDef('laser');
    i.merge(b, a);
    return a.stats.dps > before * 1.5 && a.weight > new Item({ defId: 'laser' }).weight;
  })(), '');
}

/* ============================================================ 4. equipping == */
{
  const inv = new Inventory({});
  const laser = inv.addDef('laser');
  const cap = inv.addDef('capacitor');

  check('modules cannot be equipped', inv.canEquip(cap, 'left') === false && inv.equip(cap, 'left') === false, '');
  check('weapons can', inv.equip(laser, 'left') === true && inv.equipped.left === laser, '');
  check('an equipped item leaves the grid', inv.itemAt(0, 0) === null && laser.mountId === 'left', '');
  check('it is still carried (and still weighs something)', inv.items.includes(laser) && inv.totalWeight > 0, '');

  const cannon = inv.addDef('cannon');
  check('a second weapon can take another hardpoint',
    inv.equip(cannon, 'rear') === true && inv.equipped.rear === cannon, '');

  check('swapping a slot pushes the old gun back into the grid', (() => {
    const i = new Inventory({});
    const first = i.addDef('laser');
    i.equip(first, 'left');
    const second = i.addDef('cannon');
    const ok = i.equip(second, 'left');
    return ok && i.equipped.left === second && first.mountId === null && i.itemAt(0, 0) === first;
  })(), '');

  check('a swap is refused (not destroyed) when the hold is full', (() => {
    const i = new Inventory({ events: new EventBus() });
    let refused = 0;
    i.events.on('inventory:full', () => refused++);
    const equipped = i.addDef('laser');
    i.equip(equipped, 'left');
    i.addDef('laser');
    while (i.addDef('plating')) { /* fill it */ }
    const incoming = new Item({ defId: 'cannon' }); // never added: no room
    // Force the incoming item into the hold's bookkeeping without a cell.
    i.items.push(incoming);
    const ok = i.equip(incoming, 'left');
    return ok === false && i.equipped.left === equipped && refused >= 1;
  })(), '');

  check('unequip returns the gun to the grid', (() => {
    const i = new Inventory({});
    const gun = i.addDef('laser');
    i.equip(gun, 'left');
    const ok = i.unequip('left');
    return ok && i.equipped.left === null && gun.mountId === null && i.itemAt(0, 0) === gun;
  })(), '');

  check('moving a weapon between hardpoints works', (() => {
    const i = new Inventory({});
    const gun = i.addDef('laser');
    i.equip(gun, 'left');
    i.equip(gun, 'right');
    return i.equipped.left === null && i.equipped.right === gun && gun.mountId === 'right';
  })(), '');

  check('an equipped weapon can be merged in place', (() => {
    const i = new Inventory({});
    const equipped = i.addDef('laser');
    i.equip(equipped, 'left');
    const spare = i.addDef('laser');
    const merged = i.merge(spare, equipped);
    return merged === equipped && equipped.tier === 2 && i.equipped.left === equipped && equipped.mountId === 'left';
  })(), '');

  /* --- totals ---------------------------------------------------------------- */
  const t = new Inventory({});
  const l = t.addDef('laser');
  const c = t.addDef('cannon');
  const cap2 = t.addDef('capacitor');
  const bare = l.weight + c.weight + cap2.weight;
  check('total weight is the mass of everything carried', near(t.totalWeight, bare, 0.05), `${t.totalWeight}`);
  check('idle power load only counts INSTALLED weapons',
    t.powerLoad === 0 && (t.equip(l, 'left'), near(t.powerLoad, l.load, 0.05)), `${t.powerLoad} vs ${l.load}`);
  check('equipping more guns raises the load', (() => {
    const before = t.powerLoad;
    t.equip(c, 'right');
    return t.powerLoad > before;
  })(), `${t.powerLoad}/s`);
  check('modules contribute bonuses from the grid',
    t.bonuses.maxPower === cap2.bonus.maxPower && t.bonuses.powerRegen === cap2.bonus.powerRegen,
    JSON.stringify(t.bonuses));
}

/* ================================================== 5. ship integration ===== */
const game = new Game(canvas, {});
game.init();
const inv = game.inventory;
const ship = game.ship;
const mounts = game.core.weapons.mounts;
const frames = (n) => { for (let i = 0; i < n; i++) { game.update(STEP); } };

game.startRun();
frames(2); // modifiers are recomputed by the systems, not on demand
{
  check('the starting loadout is installed', inv.items.length === CONFIG.inventory.startLoadout.length,
    `${inv.items.length} items`);
  check('three guns are bolted on at spawn',
    ['left', 'right', 'rear'].every((id) => inv.equipped[id]), JSON.stringify(game.core.weapons.status()));
  check('the hold adds mass to the ship', near(ship.stats.weight, inv.totalWeight, 0.01),
    `${ship.stats.weight} vs ${inv.totalWeight}`);
  check('mass costs thrust through the existing formula',
    near(ship.modifiers.thrustMul, 1 - ship.stats.weight / ship.stats.maxWeight, 0.01),
    `thrustMul=${f(ship.modifiers.thrustMul, 3)}`);
  check('installed guns load the reactor',
    near(ship.stats.powerLoad, inv.powerLoad, 0.01) && ship.stats.powerLoad > 0, `${ship.stats.powerLoad}/s`);
  check('the load is subtracted from recharge', (() => {
    ship.stats.power = 50;
    ship.stats.heat = 0;
    frames(120); // one second, no throttle, nothing firing
    const expected = 50 + (ship.stats.powerRegen - ship.stats.powerLoad) * 1;
    return near(ship.stats.power, Math.min(expected, ship.stats.maxPower), 1.5);
  })(), `power=${f(ship.stats.power)} regen=${ship.stats.powerRegen} load=${ship.stats.powerLoad}`);
  check('modules raise the ship ratings',
    ship.stats.maxPower === CONFIG.systems.maxPower + inv.bonuses.maxPower &&
    ship.stats.maxHull === CONFIG.systems.maxHull + inv.bonuses.maxHull,
    `maxPower ${ship.stats.maxPower} maxHull ${ship.stats.maxHull}`);

  /* --- what is bolted to each mount ---------------------------------------- */
  const left = game.core.weapons.get('left');
  const rear = game.core.weapons.get('rear');
  check('mounts carry the weapon their item describes',
    left.weapon instanceof LaserWeapon && rear.weapon instanceof CannonWeapon,
    `${left.weapon?.name} / ${rear.weapon?.name}`);
  check('weapon stats come from the item, not the defaults',
    left.weapon.dps === inv.equipped.left.stats.dps &&
    left.weapon.range === inv.equipped.left.stats.range, `dps ${left.weapon.dps}`);
  check('each weapon paints its own barrel on the hull',
    left.weapon.barrel.length !== rear.weapon.barrel.length && left.weapon.color !== rear.weapon.color,
    `${left.weapon.barrel.length}px ${left.weapon.color} vs ${rear.weapon.barrel.length}px ${rear.weapon.color}`);

  /* --- merging an equipped gun rebuilds it --------------------------------- */
  const spare = inv.addDef('laser');
  inv.merge(spare, inv.equipped.left);
  frames(2);
  check('merging an equipped gun upgrades the gun on the mount',
    inv.equipped.left.tier === 2 && left.weapon.dps === inv.equipped.left.stats.dps,
    `${left.weapon.name} dps ${left.weapon.dps}`);
  check('the upgraded gun costs more to run',
    left.weapon.powerDraw > new LaserWeapon().powerDraw &&
    ship.stats.powerLoad > 0, `${left.weapon.powerDraw}/s`);
  check('and the hold got lighter by one item', inv.items.length === CONFIG.inventory.startLoadout.length,
    `${inv.items.length}`);

  /* --- unequip empties the hardpoint --------------------------------------- */
  const equipped = inv.equipped.rear;
  inv.unequip('rear');
  frames(2);
  check('unequipping leaves an empty hardpoint', rear.weapon === null && inv.equipped.rear === null, '');
  check('the empty mount stops scanning for targets', (() => {
    // Put a target dead behind the ship, inside the rear arc.
    game.enemies.length = 0;
    const e = new Enemy({ x: ship.x - 200, y: ship.y });
    game.enemies.push(e);
    frames(60);
    return rear.target === null && rear.weapon === null;
  })(), '');

  inv.equip(equipped, 'rear');
  frames(2);
  check('re-equipping rebuilds the gun', rear.weapon instanceof CannonWeapon, rear.weapon?.name);

  /* --- the cannon actually fires shells ------------------------------------- */
  check('the cannon spawns shells in the projectile pool', (() => {
    game.projectiles.clear();
    game.enemies.length = 0;
    ship.teleport(ship.x, ship.y, 0); // nose along +x so "behind" is -x
    ship.vx = 0; ship.vy = 0;
    // Straight behind the ship: the rear mount's arc covers it.
    const e = new Enemy({ x: ship.x - 220, y: ship.y, hull: 9999 });
    game.enemies.push(e);
    frames(180); // 1.5s at 2 shells/s
    return game.projectiles.fired >= 2;
  })(), `${game.projectiles.fired} shells fired`);
  check('shells damage what they hit', (() => {
    game.enemies.length = 0;
    ship.teleport(ship.x, ship.y, 0);
    const e = new Enemy({ x: ship.x - 220, y: ship.y, hull: 9999 });
    game.enemies.push(e);
    const before = e.hull;
    frames(240);
    return e.hull < before;
  })(), '');

  /* --- jettisoning frees the mass ------------------------------------------ */
  const weightBefore = ship.stats.weight;
  const victim = inv.items.find((i) => !i.mountId);
  inv.remove(victim);
  frames(2);
  check('jettisoning an item frees its mass', ship.stats.weight < weightBefore,
    `${f(weightBefore)} -> ${f(ship.stats.weight)}`);
}

/* ================================================= 6. salvage & pickups ===== */
{
  game.pickups.length = 0;
  game.inventory.clear();
  game.startRun();

  // Roll far from the ship so the crates aren't instantly collected, and empty
  // the field between rolls so the world cap doesn't throttle the sampling.
  let drops = 0;
  for (let i = 0; i < 400; i++) {
    game.pickups.length = 0;
    if (game._maybeDropSalvage(ship.x + 1500, ship.y)) drops++;
  }
  check('destroyed dummies drop salvage at roughly the configured rate',
    drops > 400 * CONFIG.inventory.dropChance * 0.7 && drops < 400 * CONFIG.inventory.dropChance * 1.3,
    `${drops}/400 rolls (chance ${CONFIG.inventory.dropChance})`);

  game.pickups.length = 0;
  for (let i = 0; i < 60; i++) game._maybeDropSalvage(ship.x + 1500, ship.y);
  check('the world caps the number of crates', game.pickups.length <= CONFIG.inventory.maxPickups,
    `${game.pickups.length} / cap ${CONFIG.inventory.maxPickups}`);
  check('crates decay over time', (() => {
    const p = game.pickups[0];
    const before = p.life;
    for (let i = 0; i < 60; i++) p.update(STEP, {});
    return p.life < before;
  })(), '');

  // Move exactly one crate onto the ship; the rest stay out in the sector.
  const crate = game.pickups[0];
  const item = crate.item;
  const weightBefore = ship.stats.weight;
  crate.x = ship.x;
  crate.y = ship.y;
  frames(2);
  check('flying over a crate collects it',
    inv.items.includes(item) && game.pickups.indexOf(crate) === -1, `${inv.items.length} items`);
  check('and immediately changes the ship', near(ship.stats.weight, weightBefore + item.weight, 0.05),
    `${f(weightBefore)} -> ${f(ship.stats.weight)} (${item.name} ${item.weight}kg)`);

  check('a full hold refuses to collect', (() => {
    while (inv.addDef('plating')) { /* fill */ }
    const held = inv.items.length;
    const full = new ItemPickup({ x: ship.x, y: ship.y, item: new Item({ defId: 'laser' }) });
    game.pickups.push(full);
    frames(2);
    return inv.items.length === held && game.pickups.includes(full);
  })(), '');

  game.pickups.length = 0;
  inv.clear();
  frames(2);
  check('emptying the hold returns the ship to zero mass', ship.stats.weight === 0, `${ship.stats.weight}`);
  check('and the ratings drop back to stock',
    ship.stats.maxPower === CONFIG.systems.maxPower && ship.stats.maxHull === CONFIG.systems.maxHull,
    `${ship.stats.maxPower} / ${ship.stats.maxHull}`);
}

/* ===================================================== 7. the DOM overlay === */
{
  game.inventory.clear();
  game.startRun();
  const ui = game.inventoryUI;

  check('the overlay is built into #ui-layer', !!ui && dom.uiLayer.children.length > 0, '');
  check('the grid has 30 cells', ui.gridEl.children.length === 30, `${ui.gridEl.children.length}`);
  check('there are three hardpoint slots', Object.keys(ui.slotEls).length === 3 &&
    ['left', 'right', 'rear'].every((id) => ui.slotEls[id]), '');
  check('the open button is hidden until the run starts',
    ui.root.classList.contains('is-live') === (game.state === 'playing'), '');

  ui.open();
  check('opening the panel freezes the simulation', game.paused === true && ui.isOpen, '');
  check('the panel is marked open for CSS', ui.root.classList.contains('is-open'), '');
  ui.close();
  check('closing resumes the simulation', game.paused === false && !ui.isOpen, '');
  ui.open();

  /* --- geometry: the stub has no layout engine, so seed the hit rectangles -- */
  const CELL = ui.cell;
  const step = CELL + GAP;
  const grid = { left: 20, top: 300, width: 5 * step - GAP, height: 6 * step - GAP };
  const slotRect = (i) => ({ left: 10 + i * 120, top: 200, width: 110, height: 74 });
  ui.geometry = {
    grid,
    slots: { left: slotRect(0), right: slotRect(1), rear: slotRect(2) },
    trash: { left: 300, top: 770, width: 80, height: 36 },
  };

  const cellPoint = (col, row) => ({ x: grid.left + col * step + CELL / 2, y: grid.top + row * step + CELL / 2 });
  const slotPoint = (id) => {
    const r = ui.geometry.slots[id];
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  function grab(item) {
    const node = ui.nodes.get(item.uid);
    node._rect = { left: 0, top: 0, width: item.w * CELL, height: item.h * CELL };
    node.dispatch('pointerdown', { clientX: CELL / 2, clientY: CELL / 2, button: 0 });
    return node;
  }
  function moveTo(x, y) {
    fire(windowHandlers, 'pointermove', { clientX: x, clientY: y, pointerId: 1 });
  }
  function drop(x, y) {
    fire(windowHandlers, 'pointerup', { clientX: x, clientY: y, pointerId: 1 });
  }
  function dragTo(item, x, y) {
    grab(item);
    moveTo(x + 30, y + 30); // clear the 7px threshold
    moveTo(x, y);
    drop(x, y);
  }

  /* --- placement ------------------------------------------------------------ */
  const laserA = inv.addDef('laser');
  const laserB = inv.addDef('laser');
  ui.refresh();
  check('items are rendered one element each', ui.nodes.size === inv.items.length, `${ui.nodes.size} nodes`);
  check('a 1x2 element spans two cells', (() => {
    const node = ui.nodes.get(laserA.uid);
    return node.style.getPropertyValue('--h') === '2' && node.style.getPropertyValue('--w') === '1';
  })(), '');

  const moved = inv.itemAt(0, 0);
  const dest = cellPoint(3, 3);
  dragTo(moved, dest.x, dest.y);
  check('dragging an item moves it in the grid', moved.col === 3 && moved.row === 3, `${moved.col},${moved.row}`);

  /* --- live drop feedback --------------------------------------------------- */
  ui.refresh();
  const probe = inv.items.find((i) => !i.mountId);
  grab(probe);
  const corner = cellPoint(4, 5);
  moveTo(corner.x + 30, corner.y + 30); // clear the drag threshold
  moveTo(corner.x, corner.y);
  check('a legal cell highlights green',
    ui.cellEls[5][4].classList.contains('is-valid'), ui.cellEls[5][4].className);
  const other = inv.items.find((i) => i !== probe && !i.mountId && probe.canMergeWith(i));
  if (other) {
    const p = cellPoint(other.col, other.row);
    moveTo(p.x, p.y);
    check('a mergeable item is flagged while dragging',
      ui.nodes.get(other.uid).classList.contains('can-merge'), '');
    check('the merge target lights up gold',
      ui.nodes.get(other.uid).classList.contains('is-merge-target'), '');
    check('the ghost badge announces the merge',
      /MERGE/.test(ui.ghostBadge.textContent), ui.ghostBadge.textContent);
  }
  drop(cellPoint(4, 5).x, cellPoint(4, 5).y);
  check('highlights are cleared after the drop',
    !ui.cellEls[5][4].classList.contains('is-valid'), '');

  /* --- merging by drag ------------------------------------------------------ */
  inv.clear();
  ui.refresh();
  const m1 = inv.addDef('laser');
  const m2 = inv.addDef('laser');
  ui.refresh();
  const target = cellPoint(m1.col, m1.row);
  dragTo(m2, target.x, target.y);
  check('dragging one item onto an identical one merges them',
    inv.items.length === 1 && m1.tier === 2, `${inv.items.length} items, ${m1.name}`);
  check('the merge is announced', /merged/i.test(ui.toastEl.textContent), ui.toastEl.textContent);

  /* --- equipping by drag ---------------------------------------------------- */
  inv.clear();
  ui.refresh();
  const gun = inv.addDef('cannon');
  const module = inv.addDef('capacitor');
  ui.refresh();

  dragTo(module, slotPoint('left').x, slotPoint('left').y);
  check('a module refuses the hardpoint', inv.equipped.left === null && module.mountId === null, '');

  dragTo(gun, slotPoint('left').x, slotPoint('left').y);
  frames(2);
  check('dragging a weapon into a slot equips it',
    inv.equipped.left === gun && gun.mountId === 'left', `${inv.equipped.left?.name ?? '-'}`);
  check('the mount now carries that weapon',
    game.core.weapons.get('left').weapon instanceof CannonWeapon,
    game.core.weapons.get('left').weapon?.name);

  const swap = inv.addDef('laser');
  ui.refresh();
  dragTo(swap, slotPoint('left').x, slotPoint('left').y);
  frames(2);
  check('dragging onto a full slot swaps the guns',
    inv.equipped.left === swap && gun.mountId === null && inv.itemAt(gun.col, gun.row) === gun,
    `${inv.equipped.left.name}, old gun at ${gun.col},${gun.row}`);
  check('the swapped-in weapon is the one being dragged',
    game.core.weapons.get('left').weapon instanceof LaserWeapon, '');

  /* --- jettison by drag ----------------------------------------------------- */
  inv.clear();
  ui.refresh();
  const junk = inv.addDef('plating');
  ui.refresh();
  const trashRect = ui.geometry.trash;
  dragTo(junk, trashRect.left + trashRect.width / 2, trashRect.top + trashRect.height / 2);
  check('dragging onto the chute jettisons the item', inv.items.length === 0, `${inv.items.length} left`);
  check('the jettison is announced', /jettison/i.test(ui.toastEl.textContent), ui.toastEl.textContent);

  /* --- illegal drop --------------------------------------------------------- */
  inv.clear();
  ui.refresh();
  const keeper = inv.addDef('laser');
  const blocker = inv.addDef('laser');
  ui.refresh();
  const before = { col: keeper.col, row: keeper.row };
  // Drop the second laser exactly on top of the first: different tiers? no —
  // same tier, so that would merge. Use a cannon instead so the drop is illegal.
  inv.remove(blocker);
  const rock = inv.addDef('cannon'); // different def -> no merge, cells busy
  inv.move(rock, keeper.col, keeper.row + 2);
  ui.refresh();
  const blocked = { col: keeper.col, row: keeper.row };
  dragTo(rock, cellPoint(blocked.col, blocked.row).x, cellPoint(blocked.col, blocked.row).y);
  check('an illegal drop leaves both items where they were',
    rock.col === blocked.col && rock.row === keeper.row + 2 && keeper.col === before.col,
    `${rock.col},${rock.row}`);

  /* --- tap for details ------------------------------------------------------ */
  inv.clear();
  ui.refresh();
  const shown = inv.addDef('laser');
  ui.refresh();
  const node = ui.nodes.get(shown.uid);
  node._rect = { left: 0, top: 0, width: CELL, height: CELL * 2 };
  node.dispatch('pointerdown', { clientX: 5, clientY: 5, button: 0 });
  fire(windowHandlers, 'pointerup', { clientX: 6, clientY: 6, pointerId: 1 }); // no movement = tap
  check('tapping an item opens the details card', ui.tip.classList.contains('is-visible'), '');
  const buttons = ui.tip.querySelectorAll('.inv-tip-btn');
  check('the card offers actions', buttons.length >= 2, buttons.map((b) => b.textContent).join(' | '));
  check('the card lists the item stats',
    ui.tip.textContent.includes('DPS') || ui.tip.querySelectorAll('.inv-tip-row').length > 0, '');
  const equipBtn = buttons.find((b) => /EQUIP/.test(b.textContent));
  equipBtn.dispatch('pointerdown', {});
  frames(2);
  check('the EQUIP button equips without any dragging',
    inv.equipped.left === shown || inv.equipped.right === shown || inv.equipped.rear === shown,
    Object.keys(inv.equipped).map((k) => `${k}:${inv.equipped[k]?.name ?? '-'}`).join(' '));
  check('the card closes after acting', !ui.tip.classList.contains('is-visible'), '');

  /* --- readouts ------------------------------------------------------------- */
  ui.refresh();
  check('the panel shows mass, load and recharge',
    ui.statMass.b.textContent === f(inv.totalWeight) &&
    ui.statLoad.b.textContent === f(inv.powerLoad) &&
    ui.statRegen.b.textContent === f(Math.max(0, ship.stats.powerRegen - inv.powerLoad)),
    `${ui.statMass.b.textContent}kg  load ${ui.statLoad.b.textContent}  regen ${ui.statRegen.b.textContent}`);

  ui.close();
  check('the world resumes when the hold is closed', game.paused === false, '');
}

/* ============ 8. measured geometry (what a real browser would report) ====== */
{
  // The section above seeded ui.geometry directly. This one assigns realistic
  // element rectangles and lets _measure() read them, which is the path a real
  // browser takes — proving the maths works off getBoundingClientRect too.
  const ui = game.inventoryUI;
  game.inventory.clear();
  ui.refresh();
  const CELL = ui.cell;
  const step = CELL + GAP;
  const gridW = 5 * step - GAP;
  const gridH = 6 * step - GAP;
  const gridTop = 330;
  const gridLeft = Math.round((390 - gridW) / 2);
  ui.gridEl._rect = { left: gridLeft, top: gridTop, width: gridW, height: gridH };
  ui.slotEls.left.drop._rect = { left: 12, top: 250, width: 118, height: 70 };
  ui.slotEls.right.drop._rect = { left: 136, top: 250, width: 118, height: 70 };
  ui.slotEls.rear.drop._rect = { left: 260, top: 250, width: 118, height: 70 };
  ui.trashEl._rect = { left: 300, top: 780, width: 80, height: 36 };

  const measured = ui._measure();
  check('_measure() picks up the element rectangles',
    measured.grid && measured.grid.top === gridTop && measured.slots.rear && measured.trash,
    JSON.stringify(measured.grid));

  const at = (col, row) => ({
    x: measured.grid.left + col * step + CELL / 2,
    y: measured.grid.top + row * step + CELL / 2,
  });
  const slotMid = (id) => {
    const r = measured.slots[id];
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const a = inv.addDef('laser');
  const b = inv.addDef('laser');
  ui.refresh();

  function drag(item, to) {
    const node = ui.nodes.get(item.uid);
    node._rect = { left: 0, top: 0, width: item.w * CELL, height: item.h * CELL };
    node.dispatch('pointerdown', { clientX: CELL / 2, clientY: CELL / 2, button: 0 });
    fire(windowHandlers, 'pointermove', { clientX: to.x + 25, clientY: to.y + 25, pointerId: 5 });
    fire(windowHandlers, 'pointermove', { clientX: to.x, clientY: to.y, pointerId: 5 });
    fire(windowHandlers, 'pointerup', { clientX: to.x, clientY: to.y, pointerId: 5 });
  }

  const dest = at(a.col, a.row); // drag the spare onto the first laser
  drag(b, dest);
  check('a drag resolved from measured rectangles merges',
    inv.items.length === 1 && a.tier === 2, `${inv.items.length} items, ${a.name}`);
  check('measured hit testing rejects a point outside the panel',
    ui._hitTest(measured.grid.left - 40, measured.grid.top - 60).kind === 'none', '');

  const mountPoint = slotMid('left');
  drag(a, mountPoint);
  frames(2);
  check('a drag onto a measured slot rect equips the gun',
    inv.equipped.left === a && game.core.weapons.get('left').weapon instanceof LaserWeapon,
    `${inv.equipped.left?.name ?? '-'}`);

  const cannon = inv.addDef('cannon');
  ui.refresh();
  drag(cannon, slotMid('rear'));
  frames(2);
  check('a second gun takes the rear hardpoint',
    inv.equipped.rear === cannon && game.core.weapons.get('rear').weapon instanceof CannonWeapon, '');

  check('the HUD and panel agree on the numbers',
    near(ship.stats.weight, inv.totalWeight, 0.01) && near(ship.stats.powerLoad, inv.powerLoad, 0.01),
    `mass ${ui.statMass.b.textContent} load ${ui.statLoad.b.textContent}`);
}

/* ===== 9. the card and the gun must quote the same numbers ================ */
{
  // The tooltip, the mass on the scales and the gun on the mount are three
  // views of one item. A tier-scaling rounding slip once made the card quote
  // 371.3 dps for a cannon that actually fired 368.5 — this pins them together
  // for every weapon at every tier.
  const { ITEM_IDS, getDef, MAX_TIER } = await import('../src/inventory/ItemDefs.js');
  game.restart();
  frames(2);
  let worst = 0;
  let worstName = '';
  const rows = [];
  for (const defId of ITEM_IDS) {
    if (getDef(defId).kind !== 'weapon') continue;
    for (let tier = 1; tier <= MAX_TIER; tier++) {
      game.inventory.clear();
      const item = inv.addDef(defId, tier);
      inv.unequip('left');
      inv.equip(item, 'left');
      frames(2);
      const weapon = game.core.weapons.left.weapon;
      if (!weapon) { rows.push(`${defId} T${tier}: NO WEAPON BUILT`); continue; }
      const d = Math.abs(weapon.dps - item.stats.dps);
      if (d > worst) { worst = d; worstName = `${defId} T${tier} card ${item.stats.dps} vs gun ${weapon.dps}`; }
      // The power/heat the gun will actually spend must match the card too.
      const draw = Math.abs((weapon.powerDraw ?? 0) - item.stats.powerDraw);
      const heat = Math.abs((weapon.heatGain ?? 0) - item.stats.heat);
      if (draw > 0.15 || heat > 0.15) {
        rows.push(`${defId} T${tier} draw ${weapon.powerDraw} vs ${item.stats.powerDraw}, heat ${weapon.heatGain} vs ${item.stats.heat}`);
      }
    }
  }
  check('every weapon card quotes the dps the mounted gun actually does',
    worst < 0.11, worstName || 'exact');
  check('...and the same power draw and heat', rows.length === 0, rows.slice(0, 2).join(' | '));
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures ? 1 : 0);
