// Equipment data model per design doc section 21
export const EQUIPMENT_DB = {
    // Weapons Tier 1
    laser_t1: {
        id: 'laser_t1',
        name: { en: 'Pulse Laser Mk I', ar: 'ليزر نبضي ١' },
        category: 'weapon',
        weaponType: 'laser',
        tier: 1,
        cells: 2,
        weight: 6,
        power: 18,
        heat: 14,
        stats: { damage: 12, range: 320, fireRate: 180, turnSpeed: 3.2, projectileSpeed: 0 },
        description: { en: 'Continuous beam, high accuracy', ar: 'شعاع مستمر دقة عالية' },
        icon: 'laser'
    },
    laser_t2: {
        id: 'laser_t2',
        name: { en: 'Pulse Laser Mk II', ar: 'ليزر نبضي ٢' },
        category: 'weapon',
        weaponType: 'laser',
        tier: 2,
        cells: 2,
        weight: 8,
        power: 24,
        heat: 18,
        stats: { damage: 20, range: 360, fireRate: 150, turnSpeed: 3.5, projectileSpeed: 0 },
        description: { en: 'Upgraded beam', ar: 'شعاع مطور' },
        icon: 'laser'
    },
    cannon_t1: {
        id: 'cannon_t1',
        name: { en: 'Kinetic Cannon', ar: 'مدفع حركي' },
        category: 'weapon',
        weaponType: 'cannon',
        tier: 1,
        cells: 2,
        weight: 10,
        power: 12,
        heat: 10,
        stats: { damage: 35, range: 280, fireRate: 600, turnSpeed: 2.4, projectileSpeed: 500 },
        description: { en: 'High damage per shot', ar: 'ضرر عالي لكل طلقة' },
        icon: 'cannon'
    },
    cannon_t2: {
        id: 'cannon_t2',
        name: { en: 'Heavy Cannon', ar: 'مدفع ثقيل' },
        category: 'weapon',
        weaponType: 'cannon',
        tier: 2,
        cells: 3,
        weight: 14,
        power: 18,
        heat: 14,
        stats: { damage: 55, range: 300, fireRate: 700, turnSpeed: 2.0, projectileSpeed: 550 },
        description: { en: 'Heavy kinetic', ar: 'حركي ثقيل' },
        icon: 'cannon'
    },
    plasma_t1: {
        id: 'plasma_t1',
        name: { en: 'Plasma Thrower', ar: 'قاذف بلازما' },
        category: 'weapon',
        weaponType: 'plasma',
        tier: 1,
        cells: 3,
        weight: 12,
        power: 28,
        heat: 26,
        stats: { damage: 60, range: 240, fireRate: 1100, turnSpeed: 1.8, projectileSpeed: 280, aoe: 40 },
        description: { en: 'Big slow projectile + AoE', ar: 'مقذوف كبير بطيء + ضرر منطقة' },
        icon: 'plasma'
    },
    plasma_t2: {
        id: 'plasma_t2',
        name: { en: 'Plasma Annihilator', ar: 'مبيد بلازما' },
        category: 'weapon',
        weaponType: 'plasma',
        tier: 2,
        cells: 3,
        weight: 16,
        power: 36,
        heat: 34,
        stats: { damage: 95, range: 260, fireRate: 1300, turnSpeed: 1.5, projectileSpeed: 300, aoe: 60 },
        description: { en: 'Annihilating plasma', ar: 'بلازما مدمرة' },
        icon: 'plasma'
    },
    missile_t1: {
        id: 'missile_t1',
        name: { en: 'Seeker Rack', ar: 'حامل صواريخ' },
        category: 'weapon',
        weaponType: 'missile',
        tier: 1,
        cells: 3,
        weight: 14,
        power: 20,
        heat: 8,
        stats: { damage: 45, range: 400, fireRate: 2000, turnSpeed: 2.0, projectileSpeed: 200, tracking: 0.08, armDelay: 300 },
        description: { en: 'Tracking after arm delay', ar: 'تتبع بعد تأخير تسليح' },
        icon: 'missile'
    },
    missile_t2: {
        id: 'missile_t2',
        name: { en: 'Hunter Swarm', ar: 'سرب الصياد' },
        category: 'weapon',
        weaponType: 'missile',
        tier: 2,
        cells: 4,
        weight: 18,
        power: 28,
        heat: 12,
        stats: { damage: 70, range: 450, fireRate: 2200, turnSpeed: 2.2, projectileSpeed: 230, tracking: 0.1, armDelay: 250 },
        description: { en: 'Improved tracking', ar: 'تتبع محسن' },
        icon: 'missile'
    },
    // Utility modules
    reactor_t1: {
        id: 'reactor_t1',
        name: { en: 'Fusion Cell', ar: 'خلية اندماج' },
        category: 'reactor',
        tier: 1,
        cells: 2,
        weight: 8,
        power: -40, // negative = provides power
        heat: 6,
        stats: { powerGen: 40 },
        icon: 'reactor'
    },
    engine_t1: {
        id: 'engine_t1',
        name: { en: 'Ion Thruster', ar: 'دافع أيوني' },
        category: 'engine',
        tier: 1,
        cells: 2,
        weight: 6,
        power: 10,
        heat: 5,
        stats: { thrust: 60 },
        icon: 'engine'
    },
    shield_t1: {
        id: 'shield_t1',
        name: { en: 'Deflector', ar: 'حارف' },
        category: 'shield',
        tier: 1,
        cells: 2,
        weight: 7,
        power: 15,
        heat: 8,
        stats: { shield: 30, recharge: 5 },
        icon: 'shield'
    },
    cooler_t1: {
        id: 'cooler_t1',
        name: { en: 'Cryo Vent', ar: 'فتحة تبريد' },
        category: 'cooler',
        tier: 1,
        cells: 1,
        weight: 4,
        power: 8,
        heat: -18,
        stats: { cooling: 18 },
        icon: 'engine'
    },
    armor_t1: {
        id: 'armor_t1',
        name: { en: 'Plated Hull', ar: 'هيكل مصفح' },
        category: 'armor',
        tier: 1,
        cells: 2,
        weight: 12,
        power: 0,
        heat: 0,
        stats: { hull: 40 },
        icon: 'armor'
    }
};

export function getEquipment(id) {
    return EQUIPMENT_DB[id] ? { ...EQUIPMENT_DB[id], stats: { ...EQUIPMENT_DB[id].stats } } : null;
}

export function getMergeResult(id1, id2) {
    // Rule: 2 identical type+ tier -> tier+1
    if (id1 !== id2) return null;
    const base = EQUIPMENT_DB[id1];
    if (!base) return null;
    const nextTier = base.tier + 1;
    const nextId = `${base.weaponType || base.category}_t${nextTier}`;
    // fallback for non-weapon categories use category_tX
    const altId = `${base.category}_t${nextTier}`;
    if (EQUIPMENT_DB[nextId]) return getEquipment(nextId);
    if (EQUIPMENT_DB[altId]) return getEquipment(altId);
    // try generic tier search
    const prefix = id1.split('_t')[0];
    const candidate = `${prefix}_t${nextTier}`;
    if (EQUIPMENT_DB[candidate]) return getEquipment(candidate);
    return null;
}

export const INITIAL_LOADOUT = [
    'laser_t1',
    'cannon_t1',
    'reactor_t1',
    'engine_t1'
];

export const LOOT_TABLES = {
    sector1: [
        { id: 'laser_t1', weight: 25 },
        { id: 'cannon_t1', weight: 25 },
        { id: 'plasma_t1', weight: 10 },
        { id: 'missile_t1', weight: 10 },
        { id: 'reactor_t1', weight: 8 },
        { id: 'engine_t1', weight: 8 },
        { id: 'shield_t1', weight: 8 },
        { id: 'cooler_t1', weight: 6 }
    ],
    sector2: [
        { id: 'laser_t1', weight: 15 },
        { id: 'laser_t2', weight: 10 },
        { id: 'cannon_t1', weight: 15 },
        { id: 'cannon_t2', weight: 10 },
        { id: 'plasma_t1', weight: 15 },
        { id: 'missile_t1', weight: 15 },
        { id: 'reactor_t1', weight: 5 },
        { id: 'shield_t1', weight: 10 },
        { id: 'cooler_t1', weight: 5 }
    ],
    rare: [
        { id: 'laser_t2', weight: 20 },
        { id: 'cannon_t2', weight: 20 },
        { id: 'plasma_t2', weight: 20 },
        { id: 'missile_t2', weight: 20 },
        { id: 'armor_t1', weight: 20 }
    ]
};

export function rollLoot(tableName) {
    const table = LOOT_TABLES[tableName];
    if (!table) return null;
    const total = table.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const entry of table) {
        r -= entry.weight;
        if (r <= 0) return getEquipment(entry.id);
    }
    return getEquipment(table[0].id);
}
