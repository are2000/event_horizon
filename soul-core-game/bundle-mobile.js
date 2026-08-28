// Soul Core Bundle - No Assets, Mobile Reliable
const Phaser = window.Phaser;
if (!Phaser) throw new Error('Phaser not loaded');
console.log('Soul Core NoAssets Bundle, Phaser', Phaser.VERSION);

// --- soul-core-game/src/config.js ---

const GAME_CONFIG = {
    width: 720,
    height: 1280,
    portrait: true,
    backgroundColor: '#02020a',
    physics: {
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
        }
    },
    // Sector size - much larger than screen
    sector: {
        width: 4000,
        height: 4000,
        sectorCount: 5
    },
    // Ship base stats
    ship: {
        hull: 100,
        maxWeight: 80,
        maxPower: 120,
        maxHeat: 100,
        cooling: 25,
        thrust: 280,
        turnSpeed: 3.5,
        gridWidth: 5,
        gridHeight: 6
    },
    // Corrosion
    corrosion: {
        baseRate: 0.03, // per second
        collisionPenalty: 2.5,
        damageFactor: 0.15, // % of damage goes to corrosion
        envMultiplier: 2.5, // Sector 4
        states: {
            stable: { max: 30, color: 0x00ffff, glow: 0x0080ff },
            damaged: { max: 60, color: 0xffff00, glow: 0xffaa00 },
            critical: { max: 90, color: 0xff6600, glow: 0xff0000 },
            meltdown: { max: 100, color: 0xff0000, glow: 0xff0000 }
        }
    },
    // Weight formula: actualAccel = thrust * (1 - currentWeight/maxWeight * 0.8)
    weight: {
        slowFactor: 0.8
    },
    // Heat
    heat: {
        enginePerSecond: 8,
        overheatPenalty: 0.5 // 50% performance drop
    }
};
const WEAPON_TYPES = {
    LASER: 'laser',
    CANNON: 'cannon',
    PLASMA: 'plasma',
    MISSILE: 'missile'
};
const MOUNT_POSITIONS = {
    LEFT: 'left',
    RIGHT: 'right',
    REAR: 'rear'
};

// Mount arcs in degrees (relative to ship forward = 0 deg = up)
const MOUNT_ARCS = {
    [MOUNT_POSITIONS.LEFT]: { min: -120, max: 30, defaultAngle: -45 },
    [MOUNT_POSITIONS.RIGHT]: { min: -30, max: 120, defaultAngle: 45 },
    [MOUNT_POSITIONS.REAR]: { min: 90, max: 270, defaultAngle: 180 }
};
const TARGET_PRIORITIES = {
    CLOSEST: 'closest',
    WEAKEST: 'weakest',
    DANGEROUS: 'dangerous',
    MANUAL: 'manual'
};
const ENEMY_TYPES = {
    FIGHTER: 'fighter',
    GUNSHIP: 'gunship',
    DRONE: 'drone',
    SHIELD_CARRIER: 'shield_carrier',
    ELITE: 'elite'
};
const SECTOR_TYPES = {
    SCRAP_BELT: 1,
    PATROL: 2,
    SCAVENGER_BASE: 3,
    CORROSION_STORM: 4,
    BEHEMOTH: 5
};


// --- soul-core-game/src/data/localization.js ---

const L10N = {
    en: {
        play: 'PLAY',
        continue: 'CONTINUE',
        inventory: 'INVENTORY',
        repair: 'REPAIR STATION',
        settings: 'SETTINGS',
        language: 'LANGUAGE',
        hull: 'HULL',
        corrosion: 'CORROSION',
        power: 'POWER',
        heat: 'HEAT',
        weight: 'WEIGHT',
        scrap: 'SCRAP',
        targeting: 'TARGET',
        closest: 'CLOSEST',
        weakest: 'WEAKEST',
        dangerous: 'DANGER',
        manual: 'MANUAL',
        merge: 'MERGE',
        equip: 'EQUIP',
        unequip: 'UNEQUIP',
        scrap_collected: 'Scrap Collected',
        sector: 'SECTOR',
        sector_names: {
            1: 'Scrap Belt',
            2: 'Patrol Zone',
            3: 'Scavenger Base',
            4: 'Corrosion Storm',
            5: 'Behemoth Zone'
        },
        warnings: {
            overweight: 'OVERWEIGHT!',
            power_overload: 'POWER OVERLOAD!',
            overheating: 'OVERHEATING!',
            corrosion_critical: 'CORROSION CRITICAL!'
        },
        game_over: 'CORE COLLAPSE',
        victory: 'GENESIS REACHED',
        try_again: 'TRY AGAIN',
        soul_core_state: {
            stable: 'STABLE',
            damaged: 'DAMAGED',
            critical: 'CRITICAL',
            meltdown: 'MELTDOWN'
        },
        joystick_hint: 'DRAG TO MOVE',
        tap_to_target: 'TAP ENEMY TO LOCK',
        base_destroyed: 'BASE DESTROYED',
        boss_approaching: 'VOID BEHEMOTH DETECTED'
    },
    ar: {
        play: 'ابدأ',
        continue: 'متابعة',
        inventory: 'المخزن',
        repair: 'محطة الإصلاح',
        settings: 'الإعدادات',
        language: 'اللغة',
        hull: 'الهيكل',
        corrosion: 'التآكل',
        power: 'الطاقة',
        heat: 'الحرارة',
        weight: 'الوزن',
        scrap: 'الخردة',
        targeting: 'الاستهداف',
        closest: 'الأقرب',
        weakest: 'الأضعف',
        dangerous: 'الأخطر',
        manual: 'يدوي',
        merge: 'دمج',
        equip: 'تركيب',
        unequip: 'إزالة',
        scrap_collected: 'تم جمع الخردة',
        sector: 'القطاع',
        sector_names: {
            1: 'حزام الخردة',
            2: 'منطقة الدوريات',
            3: 'قاعدة الزبالين',
            4: 'عاصفة التآكل',
            5: 'منطقة العملاق'
        },
        warnings: {
            overweight: 'وزن زائد!',
            power_overload: 'حمل طاقة زائد!',
            overheating: 'حرارة مرتفعة!',
            corrosion_critical: 'تآكل حرج!'
        },
        game_over: 'انهيار النواة',
        victory: 'تم الوصول للمنشأ',
        try_again: 'حاول مجدداً',
        soul_core_state: {
            stable: 'مستقر',
            damaged: 'متضرر',
            critical: 'حرج',
            meltdown: 'انهيار'
        },
        joystick_hint: 'اسحب للتحرك',
        tap_to_target: 'اضغط على العدو للاستهداف',
        base_destroyed: 'تم تدمير القاعدة',
        boss_approaching: 'تم رصد العملاق الفراغي'
    }
};
let currentLang = 'ar';
function setLanguage(lang) {
    if (L10N[lang]) currentLang = lang;
}
function t(key) {
    const keys = key.split('.');
    let val = L10N[currentLang];
    for (const k of keys) {
        if (val && typeof val === 'object' && k in val) {
            val = val[k];
        } else {
            // fallback to en
            let fallback = L10N.en;
            for (const kk of keys) {
                if (fallback && typeof fallback === 'object' && kk in fallback) {
                    fallback = fallback[kk];
                } else {
                    return key;
                }
            }
            return fallback;
        }
    }
    return typeof val === 'string' ? val : key;
}
function getSectorName(sectorId) {
    const names = L10N[currentLang].sector_names;
    return names[sectorId] || `Sector ${sectorId}`;
}


// --- soul-core-game/src/data/equipment.js ---

// Equipment data model per design doc section 21
const EQUIPMENT_DB = {
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
function getEquipment(id) {
    return EQUIPMENT_DB[id] ? { ...EQUIPMENT_DB[id], stats: { ...EQUIPMENT_DB[id].stats } } : null;
}
function getMergeResult(id1, id2) {
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
const INITIAL_LOADOUT = [
    'laser_t1',
    'cannon_t1',
    'reactor_t1',
    'engine_t1'
];
const LOOT_TABLES = {
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
function rollLoot(tableName) {
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


// --- soul-core-game/src/data/ships.js ---

const ENEMY_DB = {
    [ENEMY_TYPES.FIGHTER]: {
        type: ENEMY_TYPES.FIGHTER,
        name: { en: 'Scavenger Fighter', ar: 'مقاتلة زبالة' },
        hull: 40,
        speed: 180,
        damage: 8,
        scrap: 12,
        score: 10,
        sprite: 'fighter',
        scale: 0.6,
        weapon: { type: 'cannon', damage: 8, fireRate: 800, range: 260 },
        behavior: 'swarm'
    },
    [ENEMY_TYPES.GUNSHIP]: {
        type: ENEMY_TYPES.GUNSHIP,
        name: { en: 'Scavenger Gunship', ar: 'زورق مدفعي' },
        hull: 90,
        speed: 90,
        damage: 18,
        scrap: 25,
        score: 25,
        sprite: 'gunship',
        scale: 0.8,
        weapon: { type: 'cannon', damage: 18, fireRate: 1100, range: 300 },
        behavior: 'gunship'
    },
    [ENEMY_TYPES.DRONE]: {
        type: ENEMY_TYPES.DRONE,
        name: { en: 'Corrupted Drone', ar: 'درون فاسد' },
        hull: 25,
        speed: 220,
        damage: 5,
        corrosionDamage: 8,
        scrap: 8,
        score: 15,
        sprite: 'drone',
        scale: 0.5,
        weapon: null,
        behavior: 'kamikaze'
    },
    [ENEMY_TYPES.SHIELD_CARRIER]: {
        type: ENEMY_TYPES.SHIELD_CARRIER,
        name: { en: 'Shield Carrier', ar: 'حامل الدرع' },
        hull: 120,
        shield: 80,
        speed: 70,
        damage: 12,
        scrap: 40,
        score: 40,
        sprite: 'shield_carrier',
        scale: 0.9,
        weapon: { type: 'laser', damage: 12, fireRate: 600, range: 280 },
        behavior: 'support',
        shieldRadius: 200
    },
    [ENEMY_TYPES.ELITE]: {
        type: ENEMY_TYPES.ELITE,
        name: { en: 'Elite Scavenger', ar: 'نخبة الزبالين' },
        hull: 180,
        speed: 110,
        damage: 25,
        scrap: 70,
        score: 100,
        sprite: 'elite',
        scale: 1.0,
        weapon: { type: 'plasma', damage: 30, fireRate: 1400, range: 320 },
        behavior: 'elite'
    }
};
const BASE_PARTS = {
    detection: { hull: 60, score: 20, sprite: 'reactor', scale: 0.7, type: 'detection' },
    turret: { hull: 80, damage: 20, fireRate: 900, range: 350, score: 30, sprite: 'cannon', scale: 0.8, type: 'turret' },
    shield_gen: { hull: 100, shield: 150, score: 40, sprite: 'shield', scale: 0.8, type: 'shield_gen', shieldRadius: 400 },
    repair: { hull: 70, score: 25, sprite: 'engine', scale: 0.7, type: 'repair', healRate: 5 },
    scrap_storage: { hull: 50, scrap: 100, score: 15, sprite: 'core', scale: 0.7, type: 'storage' },
    core: { hull: 200, score: 200, scrap: 200, sprite: 'behemoth', scale: 1.2, type: 'core' }
};
const BOSS_DB = {
    behemoth: {
        name: { en: 'Void Behemoth', ar: 'العملاق الفراغي' },
        phases: [
            { hull: 300, behavior: 'shielded', description: 'Outer protection' },
            { hull: 200, behavior: 'pull_points', description: 'Destroy pull points' },
            { hull: 100, behavior: 'enraged', description: 'Core exposed, rage' }
        ],
        totalHull: 600,
        speed: 40,
        damage: 35,
        scrap: 500,
        score: 1000,
        sprite: 'behemoth',
        scale: 2.2
    }
};


// --- soul-core-game/src/systems/save-system.js ---

class SaveSystem {
    constructor() {
        this.key = 'soul_core_save_v1';
    }

    save(data) {
        try {
            localStorage.setItem(this.key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('Save failed', e);
            return false;
        }
    }

    load() {
        try {
            const raw = localStorage.getItem(this.key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('Load failed', e);
            return null;
        }
    }

    saveGame(shipSystem, inventorySystem, sectorId, permanentUpgrades) {
        const data = {
            ship: {
                hull: shipSystem.hull,
                corrosion: shipSystem.corrosion,
                scrap: shipSystem.scrap,
                equipped: shipSystem.equipped,
                permanentUpgrades: shipSystem.permanentUpgrades
            },
            inventory: inventorySystem.serialize(),
            sectorId: sectorId,
            permanentUpgrades: permanentUpgrades,
            timestamp: Date.now()
        };
        return this.save(data);
    }

    loadGame() {
        return this.load();
    }

    savePermanent(upgrades, stats) {
        const existing = this.load() || {};
        existing.permanentUpgrades = upgrades;
        existing.stats = stats;
        return this.save(existing);
    }

    clear() {
        localStorage.removeItem(this.key);
    }

    // Roguelite permanent progression
    getDefaultPermanent() {
        return {
            maxWeightBonus: 0,
            maxPowerBonus: 0,
            coolingBonus: 0,
            maxHullBonus: 0,
            corrosionResist: 0,
            rareChance: 0,
            gridExpansion: 0,
            mountUnlocks: []
        };
    }
}


// --- soul-core-game/src/systems/audio-system.js ---

class AudioSystem {
    constructor(scene) {
        this.scene = scene;
        this.sounds = {};
        this.music = null;
        this.enabled = true;
        this.musicEnabled = true;
    }

    preload() {
        // Preload is handled in PreloadScene, this just maps
    }

    create() {
        try {
            // Create sounds if loaded
            const keys = ['shot_cannon', 'shot_laser', 'shot_plasma', 'shot_missile', 'explosion', 'hit', 'alarm', 'buy', 'repair', 'scrap'];
            for (const key of keys) {
                if (this.scene.sound.locked) {
                    // will be created on unlock
                    continue;
                }
                if (this.scene.cache.audio.exists(key) || this.scene.textures.exists(key)) {
                    // For audio, check sound cache
                }
            }
        } catch (e) {
            console.warn('Audio create failed', e);
        }
    }

    playShot(type) {
        if (!this.enabled) return;
        try {
            const map = {
                cannon: 'shot_cannon',
                laser: 'shot_laser',
                plasma: 'shot_plasma',
                missile: 'shot_missile'
            };
            const key = map[type] || 'shot_cannon';
            if (this.scene.cache.audio.exists(key)) {
                this.scene.sound.play(key, { volume: 0.4 });
            }
        } catch {}
    }

    playExplosion() {
        if (!this.enabled) return;
        try {
            if (this.scene.cache.audio.exists('explosion')) {
                this.scene.sound.play('explosion', { volume: 0.5 });
            }
        } catch {}
    }

    playHit() {
        if (!this.enabled) return;
        try {
            if (this.scene.cache.audio.exists('hit')) {
                this.scene.sound.play('hit', { volume: 0.3 });
            }
        } catch {}
    }

    playScrap() {
        if (!this.enabled) return;
        try {
            if (this.scene.cache.audio.exists('scrap')) {
                this.scene.sound.play('scrap', { volume: 0.6 });
            }
        } catch {}
    }

    playAlarm() {
        if (!this.enabled) return;
        try {
            if (this.scene.cache.audio.exists('alarm')) {
                this.scene.sound.play('alarm', { volume: 0.5 });
            }
        } catch {}
    }

    playMusic(key = 'music_battle') {
        if (!this.musicEnabled) return;
        try {
            if (this.music) this.music.stop();
            if (this.scene.cache.audio.exists(key)) {
                this.music = this.scene.sound.add(key, { volume: 0.25, loop: true });
                this.music.play();
            }
        } catch {}
    }

    stopMusic() {
        try {
            if (this.music) this.music.stop();
        } catch {}
    }
}


// --- soul-core-game/src/systems/ship-system.js ---

class ShipSystem {
    constructor(scene, x, y) {
        this.scene = scene;
        this.baseStats = { ...GAME_CONFIG.ship };
        this.reset();
        this.x = x;
        this.y = y;
    }

    reset() {
        this.hull = this.baseStats.hull;
        this.maxHull = this.baseStats.hull;
        this.maxWeight = this.baseStats.maxWeight;
        this.maxPower = this.baseStats.maxPower;
        this.maxHeat = this.baseStats.maxHeat;
        this.cooling = this.baseStats.cooling;
        this.thrust = this.baseStats.thrust;
        this.currentWeight = 0;
        this.currentPower = 0;
        this.currentHeat = 0;
        this.scrap = 0;
        this.corrosion = 0;
        this.equipped = {
            left: null,
            right: null,
            rear: null,
            reactor: [],
            engine: [],
            shield: [],
            cooler: [],
            armor: []
        };
        this.permanentUpgrades = {
            maxWeight: 0,
            maxPower: 0,
            cooling: 0,
            maxHull: 0,
            corrosionResist: 0
        };
    }

    calculateStats() {
        let weight = 0;
        let power = 0;
        let heatGen = 0;
        let cooling = this.baseStats.cooling + this.permanentUpgrades.cooling;
        let thrust = this.baseStats.thrust;
        let maxHull = this.baseStats.hull + this.permanentUpgrades.maxHull;
        let maxPower = this.baseStats.maxPower + this.permanentUpgrades.maxPower;
        let maxWeight = this.baseStats.maxWeight + this.permanentUpgrades.maxWeight;

        const allEquipped = [
            ...Object.values(this.equipped).flat().filter(Boolean),
            this.equipped.left,
            this.equipped.right,
            this.equipped.rear
        ].filter(Boolean);

        // Deduplicate
        const unique = [];
        const seen = new Set();
        for (const eq of allEquipped) {
            if (eq && !seen.has(eq.id + Math.random())) { // using instance check later
                // We'll compute differently: iterate mounts separately
            }
        }

        // Proper calculation
        weight = 0; power = 0; heatGen = 0;
        const processEq = (eq) => {
            if (!eq) return;
            weight += eq.weight || 0;
            // power negative means generation
            if (eq.power < 0) {
                maxPower += Math.abs(eq.power);
            } else {
                power += eq.power || 0;
            }
            if (eq.heat < 0) {
                cooling += Math.abs(eq.heat);
            } else {
                heatGen += eq.heat ? eq.heat * 0.1 : 0; // passive heat
            }
            if (eq.stats) {
                if (eq.stats.thrust) thrust += eq.stats.thrust;
                if (eq.stats.hull) maxHull += eq.stats.hull;
                if (eq.stats.cooling) cooling += eq.stats.cooling;
            }
        };

        if (this.equipped.left) processEq(this.equipped.left);
        if (this.equipped.right) processEq(this.equipped.right);
        if (this.equipped.rear) processEq(this.equipped.rear);
        for (const cat of ['reactor', 'engine', 'shield', 'cooler', 'armor']) {
            for (const eq of this.equipped[cat]) {
                processEq(eq);
            }
        }

        this.currentWeight = weight;
        this.currentPower = power;
        this.maxPowerEffective = maxPower;
        this.maxWeightEffective = maxWeight;
        this.maxHullEffective = maxHull;
        this.coolingEffective = cooling;
        this.thrustEffective = thrust;
        this.passiveHeatGen = heatGen;

        // Derived factors
        const weightFactor = Math.max(0.2, 1 - (weight / maxWeight) * GAME_CONFIG.weight.slowFactor);
        this.weightFactor = weightFactor;
        this.actualThrust = thrust * weightFactor;
        this.actualTurnSpeed = this.baseStats.turnSpeed * weightFactor;

        this.isOverweight = weight > maxWeight;
        this.isPowerOverload = power > maxPower;
        this.powerOverloadFactor = this.isPowerOverload ? Math.max(0.3, 1 - (power - maxPower) / maxPower) : 1;
    }

    updateHeat(delta) {
        // delta in seconds
        const heatFromEngines = this.scene?.isMoving ? GAME_CONFIG.heat.enginePerSecond * delta * 0.5 : 0;
        const totalHeatAdd = this.passiveHeatGen * delta + heatFromEngines;
        
        // Cooling
        const coolingAmount = this.coolingEffective * delta;
        
        this.currentHeat += totalHeatAdd;
        this.currentHeat -= coolingAmount;
        this.currentHeat = Phaser.Math.Clamp(this.currentHeat, 0, this.maxHeat * 1.5); // allow overheat up to 150%

        this.isOverheating = this.currentHeat > this.maxHeat;
        this.heatFactor = this.isOverheating ? GAME_CONFIG.heat.overheatPenalty : 1;
    }

    takeDamage(amount, corrosionPercent = 0.15) {
        const corrosionDamage = amount * corrosionPercent;
        this.hull -= amount;
        this.corrosion += corrosionDamage;
        this.hull = Math.max(0, this.hull);
        this.corrosion = Math.min(100, this.corrosion);
        return { hullDamage: amount, corrosionDamage };
    }

    repairHull(amount) {
        this.hull = Math.min(this.maxHullEffective, this.hull + amount);
    }

    repairCorrosion(amount) {
        this.corrosion = Math.max(0, this.corrosion - amount);
    }

    addScrap(amount) {
        this.scrap += amount;
    }

    canEquip(equipment, mount) {
        // Check weight soft, power soft - allow but warn
        // Check mount compatibility
        if (mount === 'left' || mount === 'right' || mount === 'rear') {
            if (equipment.category !== 'weapon') return { ok: false, reason: 'weapon mount needs weapon' };
        } else {
            if (equipment.category === 'weapon') return { ok: false, reason: 'weapon cannot go to utility' };
            if (mount !== equipment.category && mount !== 'reactor' && equipment.category !== mount) {
                // allow reactors etc in any utility? Let's restrict
                if (['reactor','engine','shield','cooler','armor'].includes(mount) && equipment.category !== mount) {
                    return { ok: false, reason: 'wrong slot' };
                }
            }
        }
        return { ok: true };
    }

    equip(equipment, mount) {
        const check = this.canEquip(equipment, mount);
        if (!check.ok) return check;
        
        if (mount === 'left' || mount === 'right' || mount === 'rear') {
            this.equipped[mount] = equipment;
        } else {
            this.equipped[mount].push(equipment);
        }
        this.calculateStats();
        return { ok: true };
    }

    unequip(mount, index = 0) {
        if (mount === 'left' || mount === 'right' || mount === 'rear') {
            const old = this.equipped[mount];
            this.equipped[mount] = null;
            this.calculateStats();
            return old;
        } else {
            if (this.equipped[mount][index]) {
                const old = this.equipped[mount].splice(index, 1)[0];
                this.calculateStats();
                return old;
            }
        }
        return null;
    }

    getCorrosionState() {
        const c = this.corrosion;
        const states = GAME_CONFIG.corrosion.states;
        if (c < states.stable.max) return 'stable';
        if (c < states.damaged.max) return 'damaged';
        if (c < states.critical.max) return 'critical';
        return 'meltdown';
    }

    isDead() {
        return this.hull <= 0 || this.corrosion >= 100;
    }
}


// --- soul-core-game/src/systems/inventory-system.js ---

class InventorySystem {
    constructor(width = 5, height = 6) {
        this.width = width;
        this.height = height;
        this.grid = Array(height).fill(null).map(() => Array(width).fill(null));
        this.items = []; // list of { equipment, x, y, count }
        this.scrap = 0;
    }

    // Try to place item, returns position or null
    findSpace(cells) {
        // cells = number of cells needed (vertical stacking)
        // For simplicity, we place in first available contiguous vertical space
        // small=1, medium=2, large=3+
        for (let y = 0; y <= this.height - cells; y++) {
            for (let x = 0; x < this.width; x++) {
                let free = true;
                for (let dy = 0; dy < cells; dy++) {
                    if (this.grid[y + dy][x] !== null) {
                        free = false;
                        break;
                    }
                }
                if (free) return { x, y };
            }
        }
        return null;
    }

    addItem(equipmentId, count = 1) {
        const eq = getEquipment(equipmentId);
        if (!eq) return false;

        // Check if same item already exists and stackable? Per design, similar pieces show in one card with quantity
        // We'll try to stack if same id and tier and category != weapon? Actually all stack but weapons count
        // For simplicity, allow stacking: if item exists with same id, increase count
        const existing = this.items.find(it => it.equipment.id === equipmentId);
        if (existing && eq.cells === 1) {
            existing.count += count;
            return true;
        }

        const pos = this.findSpace(eq.cells);
        if (!pos) return false; // no space

        // occupy grid
        for (let dy = 0; dy < eq.cells; dy++) {
            this.grid[pos.y + dy][pos.x] = equipmentId;
        }

        this.items.push({
            equipment: eq,
            x: pos.x,
            y: pos.y,
            count: count
        });
        return true;
    }

    removeItem(index) {
        const item = this.items[index];
        if (!item) return null;
        for (let dy = 0; dy < item.equipment.cells; dy++) {
            if (this.grid[item.y + dy] && this.grid[item.y + dy][item.x] !== undefined) {
                this.grid[item.y + dy][item.x] = null;
            }
        }
        this.items.splice(index, 1);
        return item;
    }

    // Merge two items of same type/tier
    tryMerge(indexA, indexB) {
        if (indexA === indexB) return null;
        const a = this.items[indexA];
        const b = this.items[indexB];
        if (!a || !b) return null;
        if (a.equipment.id !== b.equipment.id) return null;
        if (a.count < 1 || b.count < 1) return null;

        const result = getMergeResult(a.equipment.id, b.equipment.id);
        if (!result) return null;

        // Remove both
        // Remove higher index first
        const high = Math.max(indexA, indexB);
        const low = Math.min(indexA, indexB);
        this.removeItem(high);
        this.removeItem(low);

        // Add result
        const added = this.addItem(result.id, 1);
        if (!added) {
            // if no space, refund one? For now return to inventory first item
            this.addItem(a.equipment.id, 1);
            this.addItem(b.equipment.id, 1);
            return null;
        }

        return result;
    }

    getItems() {
        return this.items;
    }

    expandGrid(newWidth, newHeight) {
        // Expand grid, keep old items
        const oldGrid = this.grid;
        const oldHeight = this.height;
        const oldWidth = this.width;

        this.width = Math.max(this.width, newWidth);
        this.height = Math.max(this.height, newHeight);
        this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(null));

        // Re-place old items
        for (let y = 0; y < oldHeight; y++) {
            for (let x = 0; x < oldWidth; x++) {
                if (oldGrid[y][x] !== null) {
                    this.grid[y][x] = oldGrid[y][x];
                }
            }
        }
    }

    serialize() {
        return {
            width: this.width,
            height: this.height,
            items: this.items.map(it => ({ id: it.equipment.id, x: it.x, y: it.y, count: it.count })),
            scrap: this.scrap
        };
    }

    deserialize(data) {
        if (!data) return;
        this.width = data.width || 5;
        this.height = data.height || 6;
        this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(null));
        this.items = [];
        this.scrap = data.scrap || 0;
        if (data.items) {
            for (const saved of data.items) {
                const eq = getEquipment(saved.id);
                if (eq) {
                    // occupy grid
                    for (let dy = 0; dy < eq.cells; dy++) {
                        if (this.grid[saved.y + dy]) {
                            this.grid[saved.y + dy][saved.x] = saved.id;
                        }
                    }
                    this.items.push({
                        equipment: eq,
                        x: saved.x,
                        y: saved.y,
                        count: saved.count || 1
                    });
                }
            }
        }
    }
}


// --- soul-core-game/src/systems/weapon-system.js ---

class WeaponMount {
    constructor(scene, mountPosition, offsetX, offsetY) {
        this.scene = scene;
        this.mountPosition = mountPosition;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.arc = MOUNT_ARCS[mountPosition];
        this.equipment = null;
        this.currentAngle = this.arc.defaultAngle;
        this.targetAngle = this.arc.defaultAngle;
        this.lastFireTime = 0;
        this.isOverheated = false;

        // Visuals container
        this.container = scene.add.container(0, 0);
        this.base = scene.add.circle(0, 0, 12, 0x334455);
        this.base.setStrokeStyle(2, 0x88aacc);
        this.platform = scene.add.container(0, 0);
        this.weaponBody = scene.add.rectangle(0, -8, 10, 20, 0x556677);
        this.barrel = scene.add.rectangle(0, -18, 4, 18, 0xaaaaaa);
        this.muzzleFlash = scene.add.circle(0, -28, 6, 0xffffaa);
        this.muzzleFlash.setVisible(false);

        this.platform.add([this.weaponBody, this.barrel, this.muzzleFlash]);
        this.container.add([this.base, this.platform]);

        this.updateVisuals();
    }

    setEquipment(equipment) {
        this.equipment = equipment;
        this.updateVisuals();
    }

    updateVisuals() {
        if (!this.equipment) {
            this.weaponBody.setFillStyle(0x333333);
            this.barrel.setFillStyle(0x444444);
            return;
        }
        const type = this.equipment.weaponType;
        switch (type) {
            case WEAPON_TYPES.LASER:
                this.weaponBody.setFillStyle(0x00aaff);
                this.barrel.setFillStyle(0x00ffff);
                break;
            case WEAPON_TYPES.CANNON:
                this.weaponBody.setFillStyle(0xaa6622);
                this.barrel.setFillStyle(0xcc9933);
                break;
            case WEAPON_TYPES.PLASMA:
                this.weaponBody.setFillStyle(0x8800ff);
                this.barrel.setFillStyle(0xff00ff);
                break;
            case WEAPON_TYPES.MISSILE:
                this.weaponBody.setFillStyle(0x66aa66);
                this.barrel.setFillStyle(0xaaffaa);
                break;
            default:
                this.weaponBody.setFillStyle(0x556677);
        }
    }

    // target in world coordinates, ship at (sx, sy) with rotation
    update(target, shipX, shipY, shipRotation, delta) {
        if (!this.equipment) return null;

        // Calculate mount world position
        const cos = Math.cos(shipRotation);
        const sin = Math.sin(shipRotation);
        const worldX = shipX + this.offsetX * cos - this.offsetY * sin;
        const worldY = shipY + this.offsetX * sin + this.offsetY * cos;
        this.container.setPosition(worldX, worldY);

        if (!target) {
            // Return to default slowly
            this.targetAngle = this.arc.defaultAngle;
        } else {
            // Calculate angle to target from mount
            const dx = target.x - worldX;
            const dy = target.y - worldY;
            let angleToTarget = Phaser.Math.RadToDeg(Math.atan2(dy, dx)) - 90 - Phaser.Math.RadToDeg(shipRotation);
            // Normalize to -180..180
            angleToTarget = Phaser.Math.Angle.WrapDegrees(angleToTarget);

            // Clamp to arc
            const clamped = Phaser.Math.Clamp(angleToTarget, this.arc.min, this.arc.max);
            // Check if target within arc
            const withinArc = Math.abs(angleToTarget - clamped) < 5;
            this.targetAngle = clamped;
            this.hasTargetInArc = withinArc;
        }

        // Smooth rotation
        const turnSpeed = this.equipment.stats.turnSpeed || 2.5;
        const diff = Phaser.Math.Angle.WrapDegrees(this.targetAngle - this.currentAngle);
        const maxTurn = turnSpeed * (delta / 16);
        this.currentAngle += Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
        this.platform.setRotation(Phaser.Math.DegToRad(this.currentAngle));

        // Check if ready to fire
        const now = this.scene.time.now;
        const fireRate = this.equipment.stats.fireRate;
        if (now - this.lastFireTime < fireRate) return null;

        // Only fire if aligned and target in arc and in range
        if (target && this.hasTargetInArc) {
            const dist = Phaser.Math.Distance.Between(worldX, worldY, target.x, target.y);
            if (dist <= this.equipment.stats.range) {
                const angleDiff = Math.abs(Phaser.Math.Angle.WrapDegrees(this.targetAngle - this.currentAngle));
                if (angleDiff < 8) {
                    return this.fire(worldX, worldY, target, shipRotation);
                }
            }
        }
        return null;
    }

    fire(mountWorldX, mountWorldY, target, shipRotation) {
        if (!this.equipment) return null;
        this.lastFireTime = this.scene.time.now;

        // Muzzle flash
        this.muzzleFlash.setVisible(true);
        this.scene.time.delayedCall(60, () => this.muzzleFlash.setVisible(false));

        // Calculate fire direction
        const fireAngleDeg = this.currentAngle + Phaser.Math.RadToDeg(shipRotation);
        const fireAngleRad = Phaser.Math.DegToRad(fireAngleDeg);

        // Recoil effect for cannon
        if (this.equipment.weaponType === WEAPON_TYPES.CANNON) {
            this.scene.tweens.add({
                targets: this.platform,
                y: 4,
                duration: 40,
                yoyo: true,
                ease: 'Power2'
            });
        }

        const projectileData = {
            x: mountWorldX + Math.sin(fireAngleRad) * 20,
            y: mountWorldY - Math.cos(fireAngleRad) * 20,
            angle: fireAngleRad,
            equipment: this.equipment,
            mount: this.mountPosition,
            target: target
        };

        // Emit event for GameScene to create projectile
        this.scene.events.emit('weaponFired', projectileData);

        // Heat generation
        if (this.scene.shipSystem) {
            this.scene.shipSystem.currentHeat += (this.equipment.heat || 5) * 0.3;
        }

        return projectileData;
    }

    destroy() {
        this.container.destroy();
    }
}
class ProjectileSystem {
    constructor(scene) {
        this.scene = scene;
        this.projectiles = [];
        this.beams = [];
    }

    createProjectile(data) {
        const { x, y, angle, equipment, target } = data;
        const type = equipment.weaponType;

        if (type === WEAPON_TYPES.LASER) {
            // Laser is beam, not projectile - handle separately
            this.createLaserBeam(x, y, target, equipment);
            return;
        }

        let sprite;
        let speed = equipment.stats.projectileSpeed || 400;
        let tint = 0xffffff;

        switch (type) {
            case WEAPON_TYPES.CANNON:
                sprite = this.scene.add.circle(x, y, 4, 0xffcc00);
                speed = equipment.stats.projectileSpeed;
                break;
            case WEAPON_TYPES.PLASMA:
                sprite = this.scene.add.circle(x, y, 10, 0xaa00ff);
                sprite.setStrokeStyle(3, 0xff00ff);
                speed = equipment.stats.projectileSpeed;
                tint = 0xff00ff;
                break;
            case WEAPON_TYPES.MISSILE:
                sprite = this.scene.add.triangle(x, y, 0, -8, -4, 8, 4, 8, 0x66ff66);
                speed = equipment.stats.projectileSpeed;
                // Missile has smoke trail
                break;
        }

        if (!sprite) return;

        this.scene.physics.add.existing(sprite);
        sprite.body.setCircle(sprite.width / 2 || 5);
        sprite.damage = equipment.stats.damage;
        sprite.weaponType = type;
        sprite.aoe = equipment.stats.aoe || 0;
        sprite.equipment = equipment;
        sprite.target = target;
        sprite.spawnTime = this.scene.time.now;
        sprite.armDelay = equipment.stats.armDelay || 0;
        sprite.tracking = equipment.stats.tracking || 0;
        sprite.speed = speed;

        // Set velocity
        sprite.body.setVelocity(Math.sin(angle) * speed, -Math.cos(angle) * speed);
        sprite.rotation = angle;

        // For missile, add particle trail later
        if (type === WEAPON_TYPES.MISSILE) {
            sprite.trail = [];
        }

        this.projectiles.push(sprite);

        // Play sound
        this.scene.audioSystem?.playShot(type);
    }

    createLaserBeam(fromX, fromY, target, equipment) {
        if (!target) return;
        const beam = this.scene.add.graphics();
        beam.lineStyle(3, 0x00ffff, 0.9);
        beam.lineBetween(fromX, fromY, target.x, target.y);
        beam.lineStyle(1, 0xffffff, 0.6);
        beam.lineBetween(fromX, fromY, target.x, target.y);
        
        // Glow effect
        const glow = this.scene.add.graphics();
        glow.lineStyle(8, 0x00ffff, 0.3);
        glow.lineBetween(fromX, fromY, target.x, target.y);

        this.scene.time.delayedCall(80, () => {
            beam.destroy();
            glow.destroy();
        });

        // Immediate damage
        if (target.takeDamage) {
            target.takeDamage(equipment.stats.damage * 0.15); // per tick, laser fires fast
        } else if (target.enemyData) {
            // enemy
            this.scene.events.emit('enemyHit', { target, damage: equipment.stats.damage * 0.15, weaponType: 'laser' });
        }

        // Muzzle VFX handled in mount
        this.scene.audioSystem?.playShot('laser');
    }

    update(delta) {
        const now = this.scene.time.now;
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            if (!p.active) {
                this.projectiles.splice(i, 1);
                continue;
            }

            // Lifetime check
            if (now - p.spawnTime > 4000) {
                p.destroy();
                this.projectiles.splice(i, 1);
                continue;
            }

            // Missile tracking
            if (p.weaponType === WEAPON_TYPES.MISSILE && p.target && p.target.active) {
                if (now - p.spawnTime > p.armDelay) {
                    // Homing
                    const targetAngle = Phaser.Math.Angle.Between(p.x, p.y, p.target.x, p.target.y);
                    const currentAngle = p.rotation - Math.PI / 2; // adjustment
                    let diff = Phaser.Math.Angle.Wrap(targetAngle - currentAngle);
                    const tracking = p.tracking || 0.08;
                    const newAngle = currentAngle + diff * tracking;
                    p.rotation = newAngle + Math.PI / 2;
                    p.body.setVelocity(Math.cos(newAngle) * p.speed, Math.sin(newAngle) * p.speed);
                }
            }

            // Out of bounds check (world bounds)
            const bounds = this.scene.sectorSystem?.getBounds();
            if (bounds) {
                if (p.x < bounds.x || p.x > bounds.x + bounds.width || p.y < bounds.y || p.y > bounds.y + bounds.height) {
                    p.destroy();
                    this.projectiles.splice(i, 1);
                    continue;
                }
            }

            // Trail for missile
            if (p.weaponType === WEAPON_TYPES.MISSILE) {
                if (Math.random() < 0.5) {
                    const smoke = this.scene.add.circle(p.x, p.y, 3, 0x888888, 0.5);
                    this.scene.tweens.add({
                        targets: smoke,
                        alpha: 0,
                        scale: 2,
                        duration: 400,
                        onComplete: () => smoke.destroy()
                    });
                }
            }
        }
    }

    handleCollision(projectile, target) {
        if (!projectile.active) return;
        
        // Explosion VFX
        this.createImpactVFX(projectile.x, projectile.y, projectile.weaponType, projectile.aoe);

        // AoE for plasma
        if (projectile.aoe && projectile.aoe > 0) {
            // Damage nearby enemies
            this.scene.events.emit('aoeDamage', {
                x: projectile.x,
                y: projectile.y,
                radius: projectile.aoe,
                damage: projectile.damage * 0.6
            });
        }

        projectile.destroy();
        const idx = this.projectiles.indexOf(projectile);
        if (idx !== -1) this.projectiles.splice(idx, 1);
    }

    createImpactVFX(x, y, weaponType, aoe = 0) {
        let color = 0xffffff;
        let size = 8;
        switch (weaponType) {
            case 'cannon': color = 0xffaa00; size = 10; break;
            case 'plasma': color = 0xff00ff; size = 20; break;
            case 'missile': color = 0x66ff66; size = 18; break;
            case 'laser': color = 0x00ffff; size = 6; break;
        }

        const flash = this.scene.add.circle(x, y, size, color);
        this.scene.tweens.add({
            targets: flash,
            scale: aoe > 0 ? 3 : 1.8,
            alpha: 0,
            duration: aoe > 0 ? 300 : 150,
            onComplete: () => flash.destroy()
        });

        if (aoe > 0) {
            const ring = this.scene.add.circle(x, y, 5, 0x000000);
            ring.setStrokeStyle(2, color, 0.8);
            this.scene.tweens.add({
                targets: ring,
                scale: aoe / 5,
                alpha: 0,
                duration: 350,
                onComplete: () => ring.destroy()
            });
        }

        // Sparks
        for (let i = 0; i < 4; i++) {
            const spark = this.scene.add.circle(x, y, 2, 0xffffff);
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 100;
            this.scene.physics.add.existing(spark);
            spark.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
            this.scene.time.delayedCall(200 + Math.random() * 200, () => spark.destroy());
        }
    }

    clear() {
        this.projectiles.forEach(p => p.destroy());
        this.projectiles = [];
    }
}


// --- soul-core-game/src/systems/targeting-system.js ---

class TargetingSystem {
    constructor(scene) {
        this.scene = scene;
        this.priority = TARGET_PRIORITIES.CLOSEST;
        this.manualTarget = null;
        this.currentTarget = null;
        this.enemies = [];
        this.manualTargetTimeout = 0;
    }

    setEnemies(enemies) {
        this.enemies = enemies;
    }

    setPriority(priority) {
        this.priority = priority;
        if (priority !== TARGET_PRIORITIES.MANUAL) {
            this.manualTarget = null;
        }
    }

    setManualTarget(enemy) {
        if (enemy && enemy.active) {
            this.manualTarget = enemy;
            this.priority = TARGET_PRIORITIES.MANUAL;
            this.manualTargetTimeout = this.scene.time.now + 5000; // 5 sec lock
            this.currentTarget = enemy;
        }
    }

    update(shipX, shipY) {
        // Check manual target validity
        if (this.manualTarget) {
            if (!this.manualTarget.active || this.manualTarget.isDead?.() || this.scene.time.now > this.manualTargetTimeout) {
                this.manualTarget = null;
                this.priority = TARGET_PRIORITIES.CLOSEST;
            } else {
                const dist = Phaser.Math.Distance.Between(shipX, shipY, this.manualTarget.x, this.manualTarget.y);
                if (dist > 600) { // out of range
                    this.manualTarget = null;
                    this.priority = TARGET_PRIORITIES.CLOSEST;
                } else {
                    this.currentTarget = this.manualTarget;
                    return this.currentTarget;
                }
            }
        }

        // Filter alive enemies in range
        const validEnemies = this.enemies.filter(e => e.active && !e.isDead?.() && e.hull > 0);
        if (validEnemies.length === 0) {
            this.currentTarget = null;
            return null;
        }

        let target = null;
        switch (this.priority) {
            case TARGET_PRIORITIES.CLOSEST:
                target = this.getClosest(shipX, shipY, validEnemies);
                break;
            case TARGET_PRIORITIES.WEAKEST:
                target = this.getWeakest(validEnemies);
                break;
            case TARGET_PRIORITIES.DANGEROUS:
                target = this.getMostDangerous(shipX, shipY, validEnemies);
                break;
            case TARGET_PRIORITIES.MANUAL:
                target = this.manualTarget || this.getClosest(shipX, shipY, validEnemies);
                break;
        }

        this.currentTarget = target;
        return target;
    }

    getClosest(shipX, shipY, enemies) {
        let closest = null;
        let minDist = Infinity;
        for (const e of enemies) {
            const d = Phaser.Math.Distance.Between(shipX, shipY, e.x, e.y);
            if (d < minDist) {
                minDist = d;
                closest = e;
            }
        }
        return closest;
    }

    getWeakest(enemies) {
        let weakest = null;
        let minHull = Infinity;
        for (const e of enemies) {
            if (e.hull < minHull) {
                minHull = e.hull;
                weakest = e;
            }
        }
        return weakest;
    }

    getMostDangerous(shipX, shipY, enemies) {
        // Most dangerous = highest damage + closest factor
        let dangerous = null;
        let maxScore = -Infinity;
        for (const e of enemies) {
            const dist = Phaser.Math.Distance.Between(shipX, shipY, e.x, e.y);
            const damage = e.enemyData?.damage || 10;
            const score = damage * 10 - dist * 0.1; // closer + higher damage = more dangerous
            if (score > maxScore) {
                maxScore = score;
                dangerous = e;
            }
        }
        return dangerous;
    }

    getTarget() {
        return this.currentTarget;
    }
}


// --- soul-core-game/src/systems/corrosion-system.js ---

class CorrosionSystem {
    constructor(shipSystem) {
        this.shipSystem = shipSystem;
        this.envMultiplier = 1;
        this.warningPlayed = false;
    }

    setEnvironment(multiplier) {
        this.envMultiplier = multiplier;
    }

    update(delta) {
        // delta in ms, convert to seconds
        const dt = delta / 1000;
        const baseRate = GAME_CONFIG.corrosion.baseRate;
        const resist = this.shipSystem.permanentUpgrades.corrosionResist || 0;
        const effectiveRate = baseRate * this.envMultiplier * (1 - resist * 0.1);
        
        this.shipSystem.corrosion += effectiveRate * dt;
        this.shipSystem.corrosion = Math.min(100, this.shipSystem.corrosion);

        // Corrosion affects performance
        const corrosionFactor = this.shipSystem.corrosion / 100;
        if (corrosionFactor > 0.5) {
            // Reduce cooling, increase heat
            this.shipSystem.currentHeat += corrosionFactor * 2 * dt;
        }

        // Check state change for VFX
        const state = this.shipSystem.getCorrosionState();
        return state;
    }

    onCollision() {
        this.shipSystem.corrosion += GAME_CONFIG.corrosion.collisionPenalty;
        this.shipSystem.corrosion = Math.min(100, this.shipSystem.corrosion);
    }

    onDamage(damage) {
        const corrosionAdd = damage * GAME_CONFIG.corrosion.damageFactor;
        this.shipSystem.corrosion += corrosionAdd;
        this.shipSystem.corrosion = Math.min(100, this.shipSystem.corrosion);
    }

    repair(amount, scrapCost) {
        if (this.shipSystem.scrap < scrapCost) return false;
        this.shipSystem.scrap -= scrapCost;
        this.shipSystem.repairCorrosion(amount);
        return true;
    }
}


// --- soul-core-game/src/systems/enemy-ai.js ---

class EnemyAI {
    constructor(scene, x, y, type) {
        this.scene = scene;
        this.type = type;
        this.data = ENEMY_DB[type];
        this.hull = this.data.hull;
        this.maxHull = this.data.hull;
        this.shield = this.data.shield || 0;
        this.maxShield = this.data.shield || 0;
        this.scrap = this.data.scrap;
        this.speed = this.data.speed;
        this.behavior = this.data.behavior;

        // Create sprite
        const spriteKey = this.data.sprite;
        // Use texture if loaded, else graphics
        if (scene.textures.exists(spriteKey)) {
            this.sprite = scene.add.sprite(x, y, spriteKey);
            this.sprite.setScale(this.data.scale);
        } else {
            // Fallback graphics
            this.sprite = scene.add.container(x, y);
            const body = scene.add.circle(0, 0, 20 * this.data.scale, 0xff4444);
            const core = scene.add.circle(0, 0, 8 * this.data.scale, 0x880000);
            this.sprite.add([body, core]);
            this.sprite.setSize(40 * this.data.scale, 40 * this.data.scale);
        }

        scene.physics.add.existing(this.sprite);
        this.sprite.enemyData = this.data;
        this.sprite.hull = this.hull;
        this.sprite.maxHull = this.maxHull;
        this.sprite.body.setCollideWorldBounds(false);
        this.sprite.body.setDrag(100);
        this.sprite.body.setMaxVelocity(this.speed);

        this.sprite.takeDamage = (dmg) => this.takeDamage(dmg);
        this.sprite.isDead = () => this.hull <= 0;

        this.state = 'patrol';
        this.patrolCenter = { x, y };
        this.patrolRadius = 300;
        this.target = null;
        this.lastShot = 0;
        this.aggroRange = 400;
        this.attackRange = this.data.weapon ? this.data.weapon.range : 200;

        // For support type
        this.shieldActive = this.type === 'shield_carrier';

        // For elite
        this.specialCooldown = 0;
    }

    setPlayer(player) {
        this.player = player;
    }

    update(time, delta) {
        if (this.hull <= 0) return;

        const player = this.player;
        if (!player) return;

        const distToPlayer = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, player.x, player.y);

        // State machine
        switch (this.behavior) {
            case 'swarm':
                this.updateSwarm(distToPlayer, time, delta);
                break;
            case 'gunship':
                this.updateGunship(distToPlayer, time, delta);
                break;
            case 'kamikaze':
                this.updateKamikaze(distToPlayer, time, delta);
                break;
            case 'support':
                this.updateSupport(distToPlayer, time, delta);
                break;
            case 'elite':
                this.updateElite(distToPlayer, time, delta);
                break;
            default:
                this.updatePatrol(distToPlayer, time, delta);
        }

        // Shield regen for carriers
        if (this.shieldActive && this.shield < this.maxShield) {
            this.shield += 0.05 * delta;
            this.sprite.shield = this.shield;
        }

        // Update hull display on sprite
        this.sprite.hull = this.hull;
    }

    updateSwarm(dist, time) {
        if (dist < this.aggroRange) {
            // Move towards player
            this.scene.physics.moveToObject(this.sprite, this.player, this.speed);
            // Shoot if in range
            if (dist < this.attackRange) this.tryShoot(time);
        } else {
            // Patrol
            this.patrol(time);
        }
        // Face player
        this.sprite.rotation = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, this.player.x, this.player.y);
    }

    updateGunship(dist, time) {
        if (dist < this.aggroRange) {
            // Keep distance, strafe
            if (dist < this.attackRange * 0.7) {
                // Move away slightly
                const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.sprite.x, this.sprite.y);
                this.sprite.body.setVelocity(Math.cos(angle) * this.speed * 0.6, Math.sin(angle) * this.speed * 0.6);
            } else if (dist > this.attackRange) {
                this.scene.physics.moveToObject(this.sprite, this.player, this.speed * 0.7);
            } else {
                // Strafe
                this.sprite.body.setVelocity((Math.random() - 0.5) * this.speed, (Math.random() - 0.5) * this.speed);
            }
            this.tryShoot(time);
        } else {
            this.patrol(time);
        }
        this.sprite.rotation = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, this.player.x, this.player.y);
    }

    updateKamikaze(dist, time) {
        // Always rush player
        if (dist < 800) {
            this.scene.physics.moveToObject(this.sprite, this.player, this.speed);
            this.sprite.rotation = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, this.player.x, this.player.y);
            // If very close, explode and deal corrosion
            if (dist < 30) {
                this.explodeKamikaze();
            }
        } else {
            this.patrol(time);
        }
    }

    updateSupport(dist, time) {
        // Move to support allies, stay near player but not too close
        if (dist < this.aggroRange) {
            if (dist < 200) {
                const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.sprite.x, this.sprite.y);
                this.sprite.body.setVelocity(Math.cos(angle) * this.speed * 0.5, Math.sin(angle) * this.speed * 0.5);
            } else if (dist > 350) {
                this.scene.physics.moveToObject(this.sprite, this.player, this.speed * 0.5);
            }
            this.tryShoot(time);
        } else {
            this.patrol(time);
        }
    }

    updateElite(dist, time, delta) {
        if (dist < this.aggroRange * 1.2) {
            // More intelligent: change behavior based on player health
            const playerHullPercent = this.scene.shipSystem ? this.scene.shipSystem.hull / this.scene.shipSystem.maxHullEffective : 1;
            if (playerHullPercent < 0.3) {
                // Aggressive
                this.scene.physics.moveToObject(this.sprite, this.player, this.speed * 1.2);
            } else {
                // Tactical
                if (dist < this.attackRange * 0.8) {
                    this.sprite.body.setVelocity((Math.random() - 0.5) * this.speed, (Math.random() - 0.5) * this.speed);
                } else {
                    this.scene.physics.moveToObject(this.sprite, this.player, this.speed);
                }
            }
            this.tryShoot(time);

            // Special ability: summon drones
            this.specialCooldown -= delta;
            if (this.specialCooldown <= 0 && dist < 400) {
                this.specialCooldown = 8000;
                this.scene.events.emit('eliteSpecial', { x: this.sprite.x, y: this.sprite.y });
            }
        } else {
            this.patrol(time);
        }
        this.sprite.rotation = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, this.player.x, this.player.y);
    }

    updatePatrol(time) {
        // Simple patrol handled in patrol()
        this.patrol(time);
    }

    patrol(time) {
        // Wander around patrol center
        if (!this.nextPatrolChange || time > this.nextPatrolChange) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * this.patrolRadius;
            const tx = this.patrolCenter.x + Math.cos(angle) * r;
            const ty = this.patrolCenter.y + Math.sin(angle) * r;
            this.patrolTarget = { x: tx, y: ty };
            this.nextPatrolChange = time + 2000 + Math.random() * 3000;
        }
        if (this.patrolTarget) {
            this.scene.physics.moveToObject(this.sprite, this.patrolTarget, this.speed * 0.4);
        }
    }

    tryShoot(time) {
        if (!this.data.weapon) return;
        if (time - this.lastShot < this.data.weapon.fireRate) return;
        this.lastShot = time;

        const angle = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, this.player.x, this.player.y);
        this.scene.events.emit('enemyFired', {
            x: this.sprite.x,
            y: this.sprite.y,
            angle: angle,
            damage: this.data.weapon.damage,
            speed: 350,
            from: this.sprite
        });
    }

    takeDamage(amount) {
        // Shield absorbs first
        if (this.shield > 0) {
            const shieldAbsorb = Math.min(this.shield, amount);
            this.shield -= shieldAbsorb;
            amount -= shieldAbsorb;
            if (amount <= 0) return false; // blocked
        }
        this.hull -= amount;
        this.sprite.hull = this.hull;

        // Flash
        this.scene.tweens.add({
            targets: this.sprite,
            alpha: 0.3,
            duration: 50,
            yoyo: true
        });

        if (this.hull <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    explodeKamikaze() {
        // Deal damage to player with corrosion
        this.scene.events.emit('kamikazeExplode', {
            x: this.sprite.x,
            y: this.sprite.y,
            damage: this.data.damage,
            corrosion: this.data.corrosionDamage || 5
        });
        this.die(true);
    }

    die(isKamikaze = false) {
        const x = this.sprite.x;
        const y = this.sprite.y;
        const scrap = this.scrap;

        // Explosion VFX
        this.scene.events.emit('enemyDestroyed', {
            x, y, scrap, type: this.type, isKamikaze
        });

        // Remove
        this.sprite.destroy();
        this.hull = 0;
        // Mark for cleanup
        this.isDestroyed = true;
    }

    getSprite() {
        return this.sprite;
    }
}


// --- soul-core-game/src/systems/sector-system.js ---

class SectorSystem {
    constructor(scene, sectorId = 1) {
        this.scene = scene;
        this.sectorId = sectorId;
        this.width = GAME_CONFIG.sector.width;
        this.height = GAME_CONFIG.sector.height;
        this.bounds = { x: -this.width/2, y: -this.height/2, width: this.width, height: this.height };
        
        this.enemies = [];
        this.pickups = [];
        this.bases = [];
        this.repairStations = [];
        this.exitGate = null;
        
        this.baseDestroyed = false;
        this.bossSpawned = false;
        this.sectorCleared = false;
    }

    getBounds() {
        return this.bounds;
    }

    generateSector() {
        // Clear previous
        this.clear();

        // Generate based on sector id
        switch (this.sectorId) {
            case 1:
                this.generateSector1();
                break;
            case 2:
                this.generateSector2();
                break;
            case 3:
                this.generateSector3();
                break;
            case 4:
                this.generateSector4();
                break;
            case 5:
                this.generateSector5();
                break;
            default:
                this.generateSector1();
        }

        // Always add repair station
        this.addRepairStation(
            this.bounds.x + this.width * 0.7,
            this.bounds.y + this.height * 0.7
        );

        // Exit gate (except sector 5 which has boss)
        if (this.sectorId < 5) {
            this.addExitGate(
                this.bounds.x + this.width * 0.85,
                this.bounds.y + this.height * 0.15
            );
        }

        // Scrap pickups
        this.generateScrap(25);

        console.log(`Sector ${this.sectorId} generated: ${this.enemies.length} enemies, ${this.pickups.length} pickups`);
    }

    generateSector1() {
        // Scrap Belt - weak enemies, many resources
        this.spawnEnemies(ENEMY_TYPES.FIGHTER, 8);
        this.spawnEnemies(ENEMY_TYPES.DRONE, 4);
        this.spawnEnemies(ENEMY_TYPES.GUNSHIP, 2);
        // One small base
        this.generateBase(this.bounds.x + this.width * 0.5, this.bounds.y + this.height * 0.5, 'small');
    }

    generateSector2() {
        // Patrol Zone
        this.spawnEnemies(ENEMY_TYPES.FIGHTER, 6);
        this.spawnEnemies(ENEMY_TYPES.GUNSHIP, 4);
        this.spawnEnemies(ENEMY_TYPES.DRONE, 6);
        this.spawnEnemies(ENEMY_TYPES.SHIELD_CARRIER, 1);
        this.generateBase(this.bounds.x + this.width * 0.5, this.bounds.y + this.height * 0.5, 'medium');
    }

    generateSector3() {
        // Scavenger Base - first multi-part base
        this.spawnEnemies(ENEMY_TYPES.FIGHTER, 10);
        this.spawnEnemies(ENEMY_TYPES.GUNSHIP, 6);
        this.spawnEnemies(ENEMY_TYPES.SHIELD_CARRIER, 2);
        this.spawnEnemies(ENEMY_TYPES.ELITE, 1);
        this.generateBase(this.bounds.x + this.width * 0.5, this.bounds.y + this.height * 0.5, 'large');
    }

    generateSector4() {
        // Corrosion Storm - environmental damage
        this.spawnEnemies(ENEMY_TYPES.DRONE, 12);
        this.spawnEnemies(ENEMY_TYPES.FIGHTER, 8);
        this.spawnEnemies(ENEMY_TYPES.GUNSHIP, 4);
        this.spawnEnemies(ENEMY_TYPES.ELITE, 2);
        this.generateBase(this.bounds.x + this.width * 0.5, this.bounds.y + this.height * 0.5, 'large');
        // Environmental hazards
        this.generateHazards(6);
    }

    generateSector5() {
        // Behemoth Zone - boss
        this.spawnEnemies(ENEMY_TYPES.ELITE, 3);
        this.spawnEnemies(ENEMY_TYPES.GUNSHIP, 6);
        this.spawnEnemies(ENEMY_TYPES.SHIELD_CARRIER, 2);
        // Boss will be spawned separately
    }

    spawnEnemies(type, count) {
        for (let i = 0; i < count; i++) {
            const x = this.bounds.x + Math.random() * this.width;
            const y = this.bounds.y + Math.random() * this.height;
            // Avoid spawning too close to center (player start)
            if (Math.abs(x) < 400 && Math.abs(y) < 400) {
                i--;
                continue;
            }
            const enemy = new EnemyAI(this.scene, x, y, type);
            this.enemies.push(enemy);
        }
    }

    generateBase(x, y, size = 'small') {
        // Simplified base: collection of parts
        const base = {
            x, y,
            parts: [],
            coreDestroyed: false
        };

        // Base core
        const core = this.createBasePart(x, y, 'core', size);
        base.parts.push(core);

        const partCount = size === 'small' ? 3 : size === 'medium' ? 5 : 7;
        const types = ['detection', 'turret', 'shield_gen', 'repair', 'scrap_storage'];
        
        for (let i = 0; i < partCount; i++) {
            const angle = (i / partCount) * Math.PI * 2;
            const dist = 120 + Math.random() * 80;
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            const type = types[i % types.length];
            const part = this.createBasePart(px, py, type, size);
            base.parts.push(part);
        }

        this.bases.push(base);
    }

    createBasePart(x, y, type, size) {
        // Create sprite for base part
        let sprite;
        if (this.scene.textures.exists(type)) {
            sprite = this.scene.add.sprite(x, y, type);
            sprite.setScale(0.8);
        } else {
            // Fallback
            const colors = {
                detection: 0x00ffff,
                turret: 0xff4444,
                shield_gen: 0x4444ff,
                repair: 0x44ff44,
                scrap_storage: 0xffff44,
                core: 0xff00ff
            };
            const container = this.scene.add.container(x, y);
            const circle = this.scene.add.circle(0, 0, type === 'core' ? 35 : 20, colors[type] || 0xffffff);
            circle.setStrokeStyle(2, 0xffffff);
            container.add(circle);
            sprite = container;
            sprite.setSize(type === 'core' ? 70 : 40, type === 'core' ? 70 : 40);
        }

        this.scene.physics.add.existing(sprite);
        sprite.body.setImmovable(true);
        sprite.basePartType = type;
        sprite.hull = type === 'core' ? 200 : 80;
        sprite.maxHull = sprite.hull;
        sprite.isBasePart = true;

        sprite.takeDamage = (dmg) => {
            sprite.hull -= dmg;
            if (sprite.hull <= 0) {
                sprite.destroy();
                this.scene.events.emit('basePartDestroyed', { type, x, y });
                return true;
            }
            return false;
        };

        return { type, sprite, x, y, hull: sprite.hull };
    }

    addRepairStation(x, y) {
        const station = this.scene.add.container(x, y);
        const outer = this.scene.add.circle(0, 0, 45, 0x00ff88, 0.2);
        outer.setStrokeStyle(3, 0x00ff88, 0.8);
        const inner = this.scene.add.circle(0, 0, 25, 0x00ff88, 0.5);
        const icon = this.scene.add.text(0, 0, '⚙', { fontSize: '24px' }).setOrigin(0.5);
        station.add([outer, inner, icon]);
        station.setSize(90, 90);
        this.scene.physics.add.existing(station);
        station.body.setImmovable(true);
        station.isRepairStation = true;
        this.scene.tweens.add({
            targets: outer,
            scale: 1.2,
            alpha: 0.1,
            duration: 1000,
            yoyo: true,
            repeat: -1
        });
        this.repairStations.push(station);
    }

    addExitGate(x, y) {
        const gate = this.scene.add.container(x, y);
        const outer = this.scene.add.circle(0, 0, 60, 0x8800ff, 0.15);
        outer.setStrokeStyle(4, 0xaa00ff, 0.9);
        const inner = this.scene.add.circle(0, 0, 35, 0x8800ff, 0.3);
        const core = this.scene.add.circle(0, 0, 15, 0xffffff, 0.8);
        const label = this.scene.add.text(0, -80, 'EXIT GATE', { fontSize: '14px', color: '#aa88ff', fontStyle: 'bold' }).setOrigin(0.5);
        gate.add([outer, inner, core, label]);
        gate.setSize(120, 120);
        this.scene.physics.add.existing(gate);
        gate.body.setImmovable(true);
        gate.isExitGate = true;
        gate.setActive = (active) => {
            outer.setStrokeStyle(4, active ? 0x00ff00 : 0xaa00ff, active ? 1 : 0.5);
            core.setFillStyle(active ? 0x00ff00 : 0xffffff);
        };
        gate.setActive(false);
        this.scene.tweens.add({
            targets: [outer, inner],
            rotation: Math.PI * 2,
            duration: 8000,
            repeat: -1
        });
        this.exitGate = gate;
    }

    generateScrap(count) {
        for (let i = 0; i < count; i++) {
            const x = this.bounds.x + Math.random() * this.width;
            const y = this.bounds.y + Math.random() * this.height;
            this.createScrapPickup(x, y);
        }
    }

    createScrapPickup(x, y, amount = null) {
        const scrapAmount = amount || (10 + Math.floor(Math.random() * 20));
        const container = this.scene.add.container(x, y);
        const glow = this.scene.add.circle(0, 0, 12, 0xffcc00, 0.3);
        const box = this.scene.add.rectangle(0, 0, 10, 10, 0xffcc00);
        box.setStrokeStyle(1, 0xffffff);
        const text = this.scene.add.text(0, -18, `${scrapAmount}`, { fontSize: '10px', color: '#ffcc00' }).setOrigin(0.5);
        container.add([glow, box, text]);
        container.setSize(20, 20);
        this.scene.physics.add.existing(container);
        container.scrapAmount = scrapAmount;
        container.isScrap = true;
        
        // Float animation
        this.scene.tweens.add({
            targets: container,
            y: y - 5,
            duration: 1000 + Math.random() * 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.pickups.push(container);
        return container;
    }

    createEquipmentPickup(x, y, equipmentId = null) {
        const eq = equipmentId ? null : rollLoot(`sector${this.sectorId}`);
        // We'll create visual pickup
        const container = this.scene.add.container(x, y);
        const glow = this.scene.add.circle(0, 0, 16, 0x00ffff, 0.25);
        const icon = this.scene.add.circle(0, 0, 10, 0x00aaff);
        icon.setStrokeStyle(2, 0xffffff);
        container.add([glow, icon]);
        container.setSize(20, 20);
        this.scene.physics.add.existing(container);
        container.equipmentData = eq;
        container.equipmentId = equipmentId || eq?.id;
        container.isEquipment = true;

        this.scene.tweens.add({
            targets: container,
            angle: 360,
            duration: 4000,
            repeat: -1
        });

        this.pickups.push(container);
        return container;
    }

    generateHazards(count) {
        // Corrosion storm zones
        for (let i = 0; i < count; i++) {
            const x = this.bounds.x + Math.random() * this.width;
            const y = this.bounds.y + Math.random() * this.height;
            const hazard = this.scene.add.circle(x, y, 80 + Math.random() * 60, 0x6600aa, 0.15);
            hazard.setStrokeStyle(2, 0xaa00ff, 0.4);
            this.scene.physics.add.existing(hazard);
            hazard.body.setImmovable(true);
            hazard.isHazard = true;
            hazard.corrosionMultiplier = 2.5;
            this.scene.tweens.add({
                targets: hazard,
                scale: 1.1,
                alpha: 0.25,
                duration: 2000,
                yoyo: true,
                repeat: -1
            });
        }
    }

    update(player, time, delta) {
        // Update enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.isDestroyed) {
                this.enemies.splice(i, 1);
                continue;
            }
            enemy.setPlayer(player);
            enemy.update(time, delta);
        }

        // Check if base destroyed (all cores)
        let baseAlive = false;
        for (const base of this.bases) {
            const coreAlive = base.parts.some(p => p.type === 'core' && p.sprite.active);
            if (coreAlive) baseAlive = true;
        }
        if (!baseAlive && this.bases.length > 0 && !this.baseDestroyed) {
            this.baseDestroyed = true;
            this.scene.events.emit('baseDestroyed');
            if (this.exitGate) this.exitGate.setActive(true);
            // Spawn loot
            for (const base of this.bases) {
                for (const part of base.parts) {
                    if (!part.sprite.active) {
                        this.createScrapPickup(part.x + (Math.random()-0.5)*40, part.y + (Math.random()-0.5)*40, 30);
                        if (Math.random() < 0.3) {
                            this.createEquipmentPickup(part.x, part.y);
                        }
                    }
                }
            }
        }

        // Check sector clear for exit
        if (this.enemies.length === 0 && this.baseDestroyed) {
            this.sectorCleared = true;
            if (this.exitGate) this.exitGate.setActive(true);
        }
    }

    getEnemies() {
        return this.enemies.map(e => e.getSprite()).filter(s => s && s.active);
    }

    clear() {
        this.enemies.forEach(e => {
            try { e.getSprite()?.destroy(); } catch {}
        });
        this.enemies = [];
        this.pickups.forEach(p => {
            try { p.destroy(); } catch {}
        });
        this.pickups = [];
        this.bases.forEach(b => {
            b.parts.forEach(part => {
                try { part.sprite.destroy(); } catch {}
            });
        });
        this.bases = [];
        this.repairStations.forEach(s => {
            try { s.destroy(); } catch {}
        });
        this.repairStations = [];
        if (this.exitGate) {
            try { this.exitGate.destroy(); } catch {}
            this.exitGate = null;
        }
    }
}


// --- /tmp/PreloadSceneNoAssets.js ---



class PreloadScene extends Phaser.Scene {
    constructor() {
        super('PreloadScene');
    }

    preload() {
        const { width, height } = this.cameras.main;
        const loadingText = this.add.text(width/2, height/2 + 100, 'Loading... 0%', {
            fontSize: '18px',
            color: '#00ffff',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        // Simulate progress
        this.load.on('progress', (p) => {
            const pct = Math.floor(p*100);
            loadingText.setText(`Loading... ${pct}%`);
            const htmlProgress = document.getElementById('loading-progress');
            if (htmlProgress) htmlProgress.style.width = `${pct}%`;
        });

        // Create placeholder textures immediately, no external loading
        this.createPlaceholderTextures();
        
        // Fake loading delay for effect
        // Don't actually load external assets - use procedural only for mobile reliability
        // If you want assets, they will fallback to graphics in GameScene
    }

    createPlaceholderTextures() {
        try {
            const starGfx = this.make.graphics({ x: 0, y: 0, add: false });
            starGfx.fillStyle(0xffffff, 1);
            starGfx.fillCircle(1, 1, 1);
            starGfx.generateTexture('star', 2, 2);
            starGfx.clear();
            starGfx.fillStyle(0x00ffff, 0.5);
            starGfx.fillCircle(32, 32, 32);
            starGfx.generateTexture('glow', 64, 64);
            starGfx.destroy();
        } catch (e) {
            console.warn('Placeholder texture failed', e);
        }

        // Create dummy textures for all expected keys so GameScene fallback works but exists check passes
        const dummyKeys = ['player', 'fighter', 'gunship', 'drone', 'shield_carrier', 'elite', 'behemoth', 'amoeba', 'cannon', 'laser', 'plasma', 'missile', 'rocket', 'engine', 'reactor', 'shield', 'core', 'armor', 'panel', 'panel2', 'toolbar', 'content'];
        for (const key of dummyKeys) {
            if (!this.textures.exists(key)) {
                try {
                    const g = this.make.graphics({ x: 0, y: 0, add: false });
                    // Different colors per type
                    const colors = {
                        player: 0x88aacc,
                        fighter: 0xff4444,
                        gunship: 0xffaa00,
                        drone: 0xaa00ff,
                        shield_carrier: 0x4444ff,
                        elite: 0xff00ff,
                        behemoth: 0x8800ff,
                        amoeba: 0x00ff88,
                        cannon: 0xffaa00,
                        laser: 0x00ffff,
                        plasma: 0xff00ff,
                        missile: 0x66ff66
                    };
                    const col = colors[key] || 0xffffff;
                    g.fillStyle(col, 1);
                    g.fillCircle(16, 16, 12);
                    g.lineStyle(2, 0xffffff, 0.8);
                    g.strokeCircle(16, 16, 12);
                    g.generateTexture(key, 32, 32);
                    g.destroy();
                } catch (e) {
                    console.warn('Dummy texture failed for', key, e);
                }
            }
        }
    }

    create() {
        console.log('Preload complete (no external assets)');
        this.scene.start('MainMenuScene');
    }
}


// --- soul-core-game/src/scenes/BootScene.js ---

class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Minimal preload for boot
    }

    create() {
        // Setup language from save or browser
        const savedLang = localStorage.getItem('soul_core_lang');
        if (savedLang) {
            setLanguage(savedLang);
        } else {
            const browserLang = navigator.language.startsWith('ar') ? 'ar' : 'en';
            setLanguage(browserLang);
        }

        // Hide HTML loading screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => loadingScreen.style.display = 'none', 800);
        }

        // Device detection
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

        console.log('Soul Core Boot - Lang:', currentLang, 'Mobile:', this.isMobile);

        this.scene.start('PreloadScene');
    }
}


// --- soul-core-game/src/scenes/MainMenuScene.js ---

class MainMenuScene extends Phaser.Scene {
    constructor() {
        super('MainMenuScene');
    }

    create() {
        const { width, height } = this.cameras.main;
        this.saveSystem = new SaveSystem();
        const saveData = this.saveSystem.load();

        // Background - animated starfield
        this.createStarfield();

        // Soul Core logo / title
        this.createTitle(width, height);

        // Menu buttons
        this.createMenu(width, height, saveData);

        // Language toggle
        this.createLanguageToggle();

        // Version / credits
        this.add.text(width/2, height - 30, 'Soul Core: The Great Decay - Vertical Slice v0.1', {
            fontSize: '12px',
            color: '#556677',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        // Input
        this.input.on('pointerdown', (pointer) => {
            // For mobile, ensure audio unlock
            if (this.sound.locked) {
                this.sound.unlock();
            }
        });

        // Animate core
        this.tweens.add({
            targets: this.coreGlow,
            scale: 1.3,
            alpha: 0.6,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    createStarfield() {
        const { width, height } = this.cameras.main;
        // Gradient background
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x02020a, 0x02020a, 0x0a0a2a, 0x0a0a2a, 1);
        bg.fillRect(0, 0, width, height);

        // Stars
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 2 + 0.5;
            const star = this.add.circle(x, y, size, 0xffffff, 0.3 + Math.random()*0.7);
            // Twinkle
            this.tweens.add({
                targets: star,
                alpha: 0.1,
                duration: 1000 + Math.random()*2000,
                yoyo: true,
                repeat: -1
            });
        }

        // Nebula glow
        const nebula = this.add.circle(width*0.3, height*0.3, 300, 0x4400aa, 0.08);
        const nebula2 = this.add.circle(width*0.7, height*0.7, 400, 0x0088aa, 0.06);
    }

    createTitle(width, height) {
        const centerY = height * 0.28;

        // Core visual
        this.coreGlow = this.add.circle(width/2, centerY, 60, 0x00ffff, 0.25);
        this.coreOuter = this.add.circle(width/2, centerY, 40, 0x0080ff, 0.4);
        this.coreOuter.setStrokeStyle(2, 0x00ffff, 0.8);
        this.coreInner = this.add.circle(width/2, centerY, 20, 0xffffff, 0.9);
        this.coreInner.setStrokeStyle(3, 0x00ffff, 1);

        // Rotating rings
        const ring1 = this.add.circle(width/2, centerY, 55, 0x000000, 0);
        ring1.setStrokeStyle(1, 0x00ffff, 0.3);
        this.tweens.add({ targets: ring1, rotation: Math.PI*2, duration: 8000, repeat: -1 });

        // Title text
        const title = this.add.text(width/2, centerY + 90, 'SOUL CORE', {
            fontSize: '42px',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            color: '#00ffff',
            stroke: '#0080ff',
            strokeThickness: 2
        }).setOrigin(0.5);
        title.setShadow(0, 0, '#00ffff', 20, true, true);

        const subtitle = this.add.text(width/2, centerY + 125, 'THE GREAT DECAY', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#88aaff',
            letterSpacing: 4
        }).setOrigin(0.5);

        // Lore snippet
        const lore = currentLang === 'ar' 
            ? 'آخر نواة روحية تحمل شفرة حضارة كاملة\nالمجرة تنهار... التوقف يعني الفناء'
            : 'Last Soul Core carrying the code of a civilization\nThe galaxy decays... Stopping means extinction';
        
        this.add.text(width/2, centerY + 165, lore, {
            fontSize: '13px',
            color: '#667799',
            align: 'center',
            lineSpacing: 4
        }).setOrigin(0.5);
    }

    createMenu(width, height, saveData) {
        const startY = height * 0.58;
        const buttonWidth = 260;
        const buttonHeight = 56;
        const spacing = 18;

        const buttons = [];

        // Play / Continue
        if (saveData && saveData.sectorId) {
            buttons.push({ key: 'continue', label: `${t('continue')} - ${getSectorName(saveData.sectorId)}`, action: () => this.startGame(saveData.sectorId, true) });
            buttons.push({ key: 'new', label: t('play') + ' (NEW)', action: () => this.startGame(1, false) });
        } else {
            buttons.push({ key: 'play', label: t('play'), action: () => this.startGame(1, false) });
        }

        // Inventory preview (if save)
        if (saveData) {
            buttons.push({ key: 'inventory', label: t('inventory'), action: () => this.scene.start('InventoryScene', { fromMenu: true }) });
        }

        // Settings placeholder
        // buttons.push({ key: 'settings', label: t('settings'), action: () => {} });

        buttons.forEach((btn, i) => {
            const y = startY + i * (buttonHeight + spacing);
            const container = this.add.container(width/2, y);
            
            const bg = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0x112233, 0.8);
            bg.setStrokeStyle(2, 0x00ffff, 0.6);
            bg.setInteractive({ useHandCursor: true });

            const text = this.add.text(0, 0, btn.label, {
                fontSize: '18px',
                fontFamily: 'monospace',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            container.add([bg, text]);

            // Hover
            bg.on('pointerover', () => {
                bg.setFillStyle(0x1a3344, 0.9);
                bg.setStrokeStyle(2, 0x00ffff, 1);
                text.setColor('#00ffff');
            });
            bg.on('pointerout', () => {
                bg.setFillStyle(0x112233, 0.8);
                bg.setStrokeStyle(2, 0x00ffff, 0.6);
                text.setColor('#ffffff');
            });
            bg.on('pointerdown', () => {
                bg.setFillStyle(0x00ffff, 0.3);
                this.cameras.main.flash(150, 0, 255, 255, false);
                this.time.delayedCall(150, btn.action);
            });

            // Entrance anim
            container.setScale(0);
            this.tweens.add({
                targets: container,
                scale: 1,
                duration: 400,
                delay: i * 100,
                ease: 'Back.easeOut'
            });
        });

        // Controls hint
        const hintY = startY + buttons.length * (buttonHeight + spacing) + 20;
        const hintText = currentLang === 'ar' 
            ? 'اسحب في الأسفل للتحرك • اضغط على العدو للاستهداف • تلقائي الإطلاق'
            : 'Drag at bottom to move • Tap enemy to lock • Auto fire';
        this.add.text(width/2, hintY, hintText, {
            fontSize: '11px',
            color: '#445566',
            align: 'center'
        }).setOrigin(0.5);
    }

    createLanguageToggle() {
        const { width } = this.cameras.main;
        const langBtn = this.add.container(width - 60, 50);
        const bg = this.add.circle(0, 0, 26, 0x112233, 0.8);
        bg.setStrokeStyle(2, 0x00ffff, 0.5);
        bg.setInteractive({ useHandCursor: true });
        const txt = this.add.text(0, 0, currentLang === 'ar' ? 'ع' : 'EN', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        langBtn.add([bg, txt]);

        bg.on('pointerdown', () => {
            const newLang = currentLang === 'ar' ? 'en' : 'ar';
            setLanguage(newLang);
            localStorage.setItem('soul_core_lang', newLang);
            this.scene.restart();
        });
    }

    startGame(sectorId, isContinue) {
        // Play sound
        if (this.cache.audio.exists('buy')) {
            this.sound.play('buy', { volume: 0.5 });
        }
        this.scene.start('GameScene', { sectorId, isContinue });
    }
}


// --- soul-core-game/src/scenes/GameScene.js ---

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        this.sectorId = data.sectorId || 1;
        this.isContinue = data.isContinue || false;
    }

    create() {
        console.log(`GameScene Sector ${this.sectorId} Continue:${this.isContinue}`);
        
        // Systems
        this.saveSystem = new SaveSystem();
        this.audioSystem = new AudioSystem(this);
        this.shipSystem = new ShipSystem(this, 0, 0);
        this.inventorySystem = new InventorySystem();
        this.corrosionSystem = new CorrosionSystem(this.shipSystem);
        this.sectorSystem = new SectorSystem(this, this.sectorId);
        this.projectileSystem = new ProjectileSystem(this);
        this.targetingSystem = new TargetingSystem(this);

        // Load save if continue
        const saved = this.isContinue ? this.saveSystem.load() : null;
        if (saved) {
            // Restore ship
            if (saved.ship) {
                this.shipSystem.hull = saved.ship.hull;
                this.shipSystem.corrosion = saved.ship.corrosion;
                this.shipSystem.scrap = saved.ship.scrap;
                this.shipSystem.equipped = saved.ship.equipped;
                this.shipSystem.permanentUpgrades = saved.ship.permanentUpgrades || {};
            }
            if (saved.inventory) {
                this.inventorySystem.deserialize(saved.inventory);
            }
        } else {
            // New game - initial loadout
            for (const id of INITIAL_LOADOUT) {
                this.inventorySystem.addItem(id);
                const eq = getEquipment(id);
                if (eq) {
                    // Auto equip
                    if (eq.category === 'weapon') {
                        if (!this.shipSystem.equipped.left) this.shipSystem.equip(eq, 'left');
                        else if (!this.shipSystem.equipped.right) this.shipSystem.equip(eq, 'right');
                        else if (!this.shipSystem.equipped.rear) this.shipSystem.equip(eq, 'rear');
                    } else {
                        this.shipSystem.equip(eq, eq.category);
                    }
                }
            }
            // Add some extra loot
            this.inventorySystem.addItem('plasma_t1');
            this.inventorySystem.addItem('missile_t1');
            this.inventorySystem.addItem('shield_t1');
            this.inventorySystem.addItem('cooler_t1');
        }

        this.shipSystem.calculateStats();

        // World setup
        this.physics.world.setBounds(
            this.sectorSystem.bounds.x,
            this.sectorSystem.bounds.y,
            this.sectorSystem.bounds.width,
            this.sectorSystem.bounds.height
        );

        // Background starfield (tileSprite for parallax)
        this.createBackground();

        // Player ship
        this.createPlayer();

        // Weapon mounts
        this.createWeaponMounts();

        // Sector generation
        this.sectorSystem.generateSector();

        // Input - Joystick
        this.createJoystick();

        // Camera
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        this.cameras.main.setBounds(
            this.sectorSystem.bounds.x,
            this.sectorSystem.bounds.y,
            this.sectorSystem.bounds.width,
            this.sectorSystem.bounds.height
        );

        // UI
        this.createUI();

        // Collisions
        this.setupCollisions();

        // Events
        this.setupEvents();

        // Audio
        this.audioSystem.playMusic();

        // Sector environmental
        if (this.sectorId === 4) {
            this.corrosionSystem.setEnvironment(2.5);
        }

        // Initial save
        this.autoSaveTimer = this.time.addEvent({
            delay: 10000,
            callback: () => this.autoSave(),
            loop: true
        });

        // Corrosion warning
        this.lastCorrosionState = 'stable';

        // Game state
        this.isGameOver = false;
        this.isPaused = false;
    }

    createBackground() {
        const { width, height } = this.cameras.main;
        // Create large background graphics with stars
        this.starLayers = [];
        for (let layer = 0; layer < 3; layer++) {
            const stars = this.add.group();
            const count = 100 - layer * 20;
            const depth = 0.2 + layer * 0.3;
            for (let i = 0; i < count; i++) {
                const x = Phaser.Math.Between(this.sectorSystem.bounds.x, this.sectorSystem.bounds.x + this.sectorSystem.bounds.width);
                const y = Phaser.Math.Between(this.sectorSystem.bounds.y, this.sectorSystem.bounds.y + this.sectorSystem.bounds.height);
                const size = layer === 0 ? 1 : layer === 1 ? 1.5 : 2.5;
                const alpha = 0.3 + Math.random() * 0.7;
                const star = this.add.circle(x, y, size, 0xffffff, alpha);
                star.setDepth(-10 + layer);
                star.parallaxFactor = depth;
                stars.add(star);
            }
            this.starLayers.push(stars);
        }

        // Nebula clouds
        const nebula1 = this.add.circle(0, 0, 600, 0x220066, 0.04);
        nebula1.setDepth(-9);
        const nebula2 = this.add.circle(800, -600, 500, 0x004466, 0.05);
        nebula2.setDepth(-9);
    }

    createPlayer() {
        const startX = 0, startY = 0;
        
        // Player container
        this.player = this.add.container(startX, startY);
        
        // Ship body - use sprite if available
        if (this.textures.exists('player')) {
            this.playerHull = this.add.sprite(0, 0, 'player');
            this.playerHull.setScale(0.7);
            this.playerHull.setRotation(0);
        } else {
            // Fallback triangle ship
            this.playerHull = this.add.triangle(0, 0, 0, -28, -18, 20, 18, 20, 0x88aacc);
            this.playerHull.setStrokeStyle(2, 0x00ffff);
        }

        // Soul Core glow (center)
        this.soulCoreGlow = this.add.circle(0, 0, 18, 0x00ffff, 0.35);
        this.soulCore = this.add.circle(0, 0, 10, 0xffffff, 0.9);
        this.soulCore.setStrokeStyle(2, 0x00ffff, 1);

        // Damage overlay
        this.damageOverlay = this.add.graphics();
        this.corrosionOverlay = this.add.graphics();

        // Engine VFX
        this.engineFlame = this.add.triangle(0, 22, 0, 8, -6, 20, 6, 20, 0x00ffff, 0.6);
        this.engineFlame.setVisible(false);

        this.player.add([this.engineFlame, this.playerHull, this.soulCoreGlow, this.soulCore, this.damageOverlay, this.corrosionOverlay]);
        this.player.setSize(40, 50);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setDrag(200);
        this.player.body.setMaxVelocity(400);
        this.player.body.setCircle(22);

        // For targeting
        this.player.hull = this.shipSystem.hull;
        this.player.isPlayer = true;
    }

    createWeaponMounts() {
        this.weaponMounts = [];
        // Offsets relative to ship center
        const leftMount = new WeaponMount(this, MOUNT_POSITIONS.LEFT, -18, -8);
        const rightMount = new WeaponMount(this, MOUNT_POSITIONS.RIGHT, 18, -8);
        const rearMount = new WeaponMount(this, MOUNT_POSITIONS.REAR, 0, 16);

        // Equip from shipSystem
        if (this.shipSystem.equipped.left) leftMount.setEquipment(this.shipSystem.equipped.left);
        if (this.shipSystem.equipped.right) rightMount.setEquipment(this.shipSystem.equipped.right);
        if (this.shipSystem.equipped.rear) rearMount.setEquipment(this.shipSystem.equipped.rear);

        this.weaponMounts.push(leftMount, rightMount, rearMount);
    }

    createJoystick() {
        const { width, height } = this.cameras.main;
        // Joystick at bottom center
        this.joystickBaseX = width / 2;
        this.joystickBaseY = height - 110;
        this.joystickRadius = 60;
        this.joystickKnobRadius = 28;

        // UI container fixed to camera
        this.joystickContainer = this.add.container(this.joystickBaseX, this.joystickBaseY);
        this.joystickContainer.setScrollFactor(0);
        this.joystickContainer.setDepth(100);

        this.joyBase = this.add.circle(0, 0, this.joystickRadius, 0x112233, 0.5);
        this.joyBase.setStrokeStyle(2, 0x00ffff, 0.3);
        this.joyKnob = this.add.circle(0, 0, this.joystickKnobRadius, 0x00ffff, 0.25);
        this.joyKnob.setStrokeStyle(2, 0x00ffff, 0.6);

        // Direction indicator
        this.joyDir = this.add.triangle(0, -this.joystickRadius + 10, 0, -6, -4, 6, 4, 6, 0x00ffff, 0.5);

        this.joystickContainer.add([this.joyBase, this.joyDir, this.joyKnob]);

        this.joyVector = { x: 0, y: 0 };
        this.isDraggingJoy = false;

        // Touch input
        this.input.on('pointerdown', (pointer) => {
            const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.joystickBaseX, this.joystickBaseY);
            if (dist <= this.joystickRadius * 1.5) {
                this.isDraggingJoy = true;
            } else {
                // Check if tap on enemy for manual targeting
                this.checkManualTarget(pointer);
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (!this.isDraggingJoy || !pointer.isDown) return;
            const dx = pointer.x - this.joystickBaseX;
            const dy = pointer.y - this.joystickBaseY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const maxDist = this.joystickRadius - this.joystickKnobRadius;
            if (dist <= maxDist) {
                this.joyKnob.setPosition(dx, dy);
                this.joyVector.x = dx / maxDist;
                this.joyVector.y = dy / maxDist;
            } else {
                const angle = Math.atan2(dy, dx);
                this.joyKnob.setPosition(Math.cos(angle)*maxDist, Math.sin(angle)*maxDist);
                this.joyVector.x = Math.cos(angle);
                this.joyVector.y = Math.sin(angle);
            }
            // Update direction indicator
            if (this.joyVector.x !== 0 || this.joyVector.y !== 0) {
                this.joyDir.setRotation(Math.atan2(this.joyVector.y, this.joyVector.x) + Math.PI/2);
                this.joyDir.setVisible(true);
            }
        });

        this.input.on('pointerup', () => {
            this.isDraggingJoy = false;
            this.joyKnob.setPosition(0,0);
            this.joyVector.x = 0;
            this.joyVector.y = 0;
            this.joyDir.setVisible(false);
        });

        // Keyboard for desktop testing
        this.cursors = this.input.keyboard?.createCursorKeys();
        this.wasd = this.input.keyboard?.addKeys('W,A,S,D');
    }

    checkManualTarget(pointer) {
        // Convert screen to world
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const enemies = this.sectorSystem.getEnemies();
        let closest = null;
        let minDist = 80;
        for (const e of enemies) {
            const d = Phaser.Math.Distance.Between(worldPoint.x, worldPoint.y, e.x, e.y);
            if (d < minDist) {
                minDist = d;
                closest = e;
            }
        }
        if (closest) {
            this.targetingSystem.setManualTarget(closest);
            // Visual feedback
            this.showTargetLock(closest);
        }
    }

    showTargetLock(target) {
        if (this.targetLockGfx) this.targetLockGfx.destroy();
        this.targetLockGfx = this.add.graphics();
        this.targetLockGfx.lineStyle(2, 0xff0000, 0.9);
        this.targetLockGfx.strokeRect(target.x - 30, target.y - 30, 60, 60);
        // Corners
        const drawCorner = (x,y,rx,ry) => {
            this.targetLockGfx.lineBetween(x, y, x+rx, y);
            this.targetLockGfx.lineBetween(x, y, x, y+ry);
        };
        drawCorner(target.x-30, target.y-30, 12, 12);
        drawCorner(target.x+30, target.y-30, -12, 12);
        drawCorner(target.x-30, target.y+30, 12, -12);
        drawCorner(target.x+30, target.y+30, -12, -12);

        this.tweens.add({
            targets: this.targetLockGfx,
            alpha: 0.2,
            duration: 400,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                if (this.targetLockGfx) {
                    this.targetLockGfx.destroy();
                    this.targetLockGfx = null;
                }
            }
        });
    }

    createUI() {
        const { width, height } = this.cameras.main;

        // Top bar
        this.uiTop = this.add.container(0, 0);
        this.uiTop.setScrollFactor(0);
        this.uiTop.setDepth(101);

        const topBg = this.add.rectangle(width/2, 35, width, 70, 0x02020a, 0.85);
        topBg.setStrokeStyle(1, 0x00ffff, 0.2);
        this.uiTop.add(topBg);

        // Hull bar
        const hullLabel = this.add.text(15, 12, `${t('hull')}`, { fontSize: '10px', color: '#88aaff', fontFamily: 'monospace' });
        this.hullBarBg = this.add.rectangle(15, 28, 110, 10, 0x333333, 0.8);
        this.hullBarBg.setOrigin(0, 0.5);
        this.hullBar = this.add.rectangle(15, 28, 110, 10, 0x00ff88, 0.9);
        this.hullBar.setOrigin(0, 0.5);
        this.hullText = this.add.text(15, 38, '100/100', { fontSize: '9px', color: '#ffffff', fontFamily: 'monospace' });

        // Corrosion bar
        const corrLabel = this.add.text(15, 50, `${t('corrosion')}`, { fontSize: '10px', color: '#ffaa00', fontFamily: 'monospace' });
        this.corrBarBg = this.add.rectangle(15, 66, 110, 10, 0x333333, 0.8);
        this.corrBarBg.setOrigin(0, 0.5);
        this.corrBar = this.add.rectangle(15, 66, 0, 10, 0xff6600, 0.9);
        this.corrBar.setOrigin(0, 0.5);
        this.corrText = this.add.text(130, 62, '0%', { fontSize: '9px', color: '#ffaa00', fontFamily: 'monospace' });

        // Power / Heat
        const powerLabel = this.add.text(width*0.5 - 40, 12, `${t('power')}`, { fontSize: '10px', color: '#00aaff', fontFamily: 'monospace' }).setOrigin(0.5, 0);
        this.powerBarBg = this.add.rectangle(width*0.5 - 40, 28, 80, 8, 0x333333, 0.8);
        this.powerBarBg.setOrigin(0.5, 0.5);
        this.powerBar = this.add.rectangle(width*0.5 - 40, 28, 80, 8, 0x00aaff, 0.9);
        this.powerBar.setOrigin(0.5, 0.5);

        const heatLabel = this.add.text(width*0.5 + 40, 12, `${t('heat')}`, { fontSize: '10px', color: '#ff4444', fontFamily: 'monospace' }).setOrigin(0.5, 0);
        this.heatBarBg = this.add.rectangle(width*0.5 + 40, 28, 80, 8, 0x333333, 0.8);
        this.heatBarBg.setOrigin(0.5, 0.5);
        this.heatBar = this.add.rectangle(width*0.5 + 40, 28, 0, 8, 0xff4444, 0.9);
        this.heatBar.setOrigin(0.5, 0.5);

        // Weight indicator
        this.weightText = this.add.text(width*0.5, 48, `${t('weight')}: 0/${this.shipSystem.maxWeightEffective}`, { fontSize: '9px', color: '#aaaaaa', fontFamily: 'monospace' }).setOrigin(0.5);

        // Scrap counter top right
        this.scrapText = this.add.text(width - 15, 18, `◈ ${this.shipSystem.scrap}`, { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(1, 0);
        this.sectorText = this.add.text(width - 15, 36, `${t('sector')} ${this.sectorId} - ${t(`sector_names.${this.sectorId}`)}`, { fontSize: '10px', color: '#88aaff', fontFamily: 'monospace' }).setOrigin(1, 0);

        // Warnings
        this.warningText = this.add.text(width/2, 85, '', { fontSize: '12px', color: '#ff0000', fontFamily: 'monospace', fontStyle: 'bold', backgroundColor: '#ff000022' }).setOrigin(0.5).setVisible(false);

        this.uiTop.add([hullLabel, this.hullBarBg, this.hullBar, this.hullText, corrLabel, this.corrBarBg, this.corrBar, this.corrText, powerLabel, this.powerBarBg, this.powerBar, heatLabel, this.heatBarBg, this.heatBar, this.weightText, this.scrapText, this.sectorText, this.warningText]);

        // Bottom UI - targeting priority + buttons
        this.uiBottom = this.add.container(0, 0);
        this.uiBottom.setScrollFactor(0);
        this.uiBottom.setDepth(101);

        // Targeting priority buttons
        const priorities = [TARGET_PRIORITIES.CLOSEST, TARGET_PRIORITIES.WEAKEST, TARGET_PRIORITIES.DANGEROUS];
        const priLabels = { closest: t('closest'), weakest: t('weakest'), dangerous: t('dangerous') };
        this.priButtons = [];
        let priX = 15;
        for (const pri of priorities) {
            const btn = this.add.container(priX, height - 200);
            const bg = this.add.rectangle(0, 0, 62, 28, 0x112233, 0.8);
            bg.setStrokeStyle(1, 0x00ffff, 0.3);
            bg.setInteractive({ useHandCursor: true });
            const label = this.add.text(0, 0, priLabels[pri], { fontSize: '9px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5);
            btn.add([bg, label]);
            btn.setSize(62, 28);
            bg.on('pointerdown', () => {
                this.targetingSystem.setPriority(pri);
                this.updatePriorityUI();
            });
            this.priButtons.push({ pri, bg, container: btn });
            this.uiBottom.add(btn);
            priX += 68;
        }
        this.updatePriorityUI();

        // Inventory button
        const invBtn = this.add.container(width - 70, height - 200);
        const invBg = this.add.circle(0, 0, 26, 0x112233, 0.85);
        invBg.setStrokeStyle(2, 0x00ffff, 0.6);
        invBg.setInteractive({ useHandCursor: true });
        const invIcon = this.add.text(0, 0, '🎒', { fontSize: '20px' }).setOrigin(0.5);
        invBtn.add([invBg, invIcon]);
        invBg.on('pointerdown', () => {
            this.openInventory();
        });
        this.uiBottom.add(invBtn);

        // Repair hint (when near station)
        this.repairHint = this.add.text(width/2, height/2 + 80, '', { fontSize: '12px', color: '#00ff88', backgroundColor: '#002211aa', padding: { x: 10, y: 5 }, fontFamily: 'monospace' }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setVisible(false);

        // Soul core state indicator
        this.coreStateText = this.add.text(15, height - 50, '', { fontSize: '11px', color: '#00ffff', fontFamily: 'monospace' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);
        this.uiBottom.add(this.coreStateText);

        // Joystick hint
        if (!this.isMobile) {
            this.add.text(width/2, height - 30, 'WASD / Arrows + Mouse Tap Enemy', { fontSize: '10px', color: '#445566', fontFamily: 'monospace' }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
        }
    }

    updatePriorityUI() {
        for (const b of this.priButtons) {
            if (b.pri === this.targetingSystem.priority) {
                b.bg.setFillStyle(0x00ffff, 0.3);
                b.bg.setStrokeStyle(2, 0x00ffff, 1);
            } else {
                b.bg.setFillStyle(0x112233, 0.8);
                b.bg.setStrokeStyle(1, 0x00ffff, 0.3);
            }
        }
    }

    setupCollisions() {
        // Player vs enemies (collision)
        // We'll handle in update via distance checks for performance

        // Projectiles vs enemies
        // Handled via overlap checks in update

        // Player vs pickups
        // Overlap via physics? Use distance check for containers

        // For simplicity, use manual checks in update loop
    }

    setupEvents() {
        // Weapon fired
        this.events.on('weaponFired', (data) => {
            this.projectileSystem.createProjectile(data);
        });

        // Enemy destroyed
        this.events.on('enemyDestroyed', (data) => {
            this.onEnemyDestroyed(data);
        });

        // Enemy fired
        this.events.on('enemyFired', (data) => {
            this.createEnemyProjectile(data);
        });

        // Kamikaze explode
        this.events.on('kamikazeExplode', (data) => {
            this.onKamikazeExplode(data);
        });

        // Base part destroyed
        this.events.on('basePartDestroyed', (data) => {
            this.createExplosion(data.x, data.y, 0xff6600, 20);
            this.shipSystem.addScrap(15);
            this.updateUI();
        });

        // Base destroyed
        this.events.on('baseDestroyed', () => {
            this.showMessage(t('base_destroyed'), 0x00ff88, 3000);
            this.audioSystem.playExplosion();
        });

        // Elite special
        this.events.on('eliteSpecial', (data) => {
            // Spawn 2 drones
            const { x, y } = data;
            for (let i = 0; i < 2; i++) {
                const angle = Math.random() * Math.PI * 2;
                const sx = x + Math.cos(angle) * 40;
                const sy = y + Math.sin(angle) * 40;
                const enemy = new (this.sectorSystem.enemies[0]?.constructor || Object) ? null : null;
                // Use sector system to spawn
                // We'll directly create EnemyAI
                    const EnemyAI = mod.EnemyAI;
                    const e = new EnemyAI(this, sx, sy, 'drone');
                    this.sectorSystem.enemies.push(e);
                });
            }
        });

        // AoE damage
        this.events.on('aoeDamage', (data) => {
            const enemies = this.sectorSystem.getEnemies();
            for (const e of enemies) {
                const d = Phaser.Math.Distance.Between(data.x, data.y, e.x, e.y);
                if (d <= data.radius) {
                    e.takeDamage?.(data.damage);
                }
            }
            // Also base parts
            for (const base of this.sectorSystem.bases) {
                for (const part of base.parts) {
                    if (part.sprite.active) {
                        const d = Phaser.Math.Distance.Between(data.x, data.y, part.sprite.x, part.sprite.y);
                        if (d <= data.radius) {
                            part.sprite.takeDamage?.(data.damage);
                        }
                    }
                }
            }
        });

        // Enemy hit
        this.events.on('enemyHit', (data) => {
            if (data.target.takeDamage) {
                data.target.takeDamage(data.damage);
            }
        });
    }

    onEnemyDestroyed(data) {
        const { x, y, scrap, type } = data;
        this.createExplosion(x, y, 0xff4444, 16);
        this.shipSystem.addScrap(scrap);
        this.audioSystem.playExplosion();
        this.audioSystem.playScrap();

        // Chance to drop equipment
        if (Math.random() < 0.25) {
            this.sectorSystem.createEquipmentPickup(x, y);
        } else {
            this.sectorSystem.createScrapPickup(x + (Math.random()-0.5)*20, y + (Math.random()-0.5)*20, scrap);
        }

        // Score / progress
        this.updateUI();

        // Check if all enemies dead and base dead -> allow exit
        // Handled in sectorSystem.update
    }

    createEnemyProjectile(data) {
        const { x, y, angle, damage, speed } = data;
        const proj = this.add.circle(x, y, 4, 0xff4444);
        this.physics.add.existing(proj);
        proj.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        proj.damage = damage;
        proj.isEnemyProjectile = true;
        proj.spawnTime = this.time.now;

        // Store for cleanup
        if (!this.enemyProjectiles) this.enemyProjectiles = [];
        this.enemyProjectiles.push(proj);

        // Auto destroy after 3 sec
        this.time.delayedCall(3000, () => {
            if (proj.active) proj.destroy();
        });
    }

    onKamikazeExplode(data) {
        const { x, y, damage, corrosion } = data;
        this.createExplosion(x, y, 0xaa00ff, 24);
        // Check if player in range
        const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
        if (dist < 60) {
            this.shipSystem.takeDamage(damage, corrosion / 100);
            this.corrosionSystem.onCollision();
            this.updateUI();
            this.cameras.main.shake(200, 0.01);
        }
    }

    createExplosion(x, y, color = 0xff4444, size = 16) {
        const flash = this.add.circle(x, y, size, color, 0.9);
        this.tweens.add({
            targets: flash,
            scale: 2.5,
            alpha: 0,
            duration: 300,
            onComplete: () => flash.destroy()
        });

        for (let i = 0; i < 6; i++) {
            const p = this.add.circle(x, y, 3, 0xffffff, 0.8);
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 120;
            this.physics.add.existing(p);
            p.body.setVelocity(Math.cos(angle)*speed, Math.sin(angle)*speed);
            this.time.delayedCall(300 + Math.random()*300, () => p.destroy());
        }
    }

    showMessage(text, color = 0xffffff, duration = 2000) {
        const { width, height } = this.cameras.main;
        const msg = this.add.text(width/2, height*0.3, text, {
            fontSize: '18px',
            color: `#${color.toString(16).padStart(6,'0')}`,
            fontFamily: 'monospace',
            fontStyle: 'bold',
            backgroundColor: '#000000aa',
            padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(200);

        this.tweens.add({
            targets: msg,
            y: msg.y - 30,
            alpha: 0,
            duration: duration,
            ease: 'Power2',
            onComplete: () => msg.destroy()
        });
    }

    update(time, delta) {
        if (this.isGameOver || this.isPaused) return;

        const dt = delta / 1000;

        // Ship movement
        this.updatePlayerMovement(dt);

        // Systems update
        this.shipSystem.updateHeat(dt);
        const corrosionState = this.corrosionSystem.update(delta);
        this.sectorSystem.update(this.player, time, delta);
        this.targetingSystem.setEnemies(this.sectorSystem.getEnemies());
        const target = this.targetingSystem.update(this.player.x, this.player.y);

        // Update weapon mounts
        for (const mount of this.weaponMounts) {
            mount.update(target, this.player.x, this.player.y, this.player.rotation, delta);
        }

        // Projectiles
        this.projectileSystem.update(delta);

        // Check collisions manually
        this.checkCollisions();

        // Update UI
        this.updateUI();

        // Check environmental hazards
        this.checkHazards();

        // Check repair station proximity
        this.checkRepairStation();

        // Check exit gate
        this.checkExitGate();

        // Check game over
        if (this.shipSystem.isDead()) {
            this.gameOver();
        }

        // Update soul core visuals based on corrosion
        this.updateSoulCoreVisual(corrosionState);

        // Corrosion state change warning
        if (corrosionState !== this.lastCorrosionState) {
            this.lastCorrosionState = corrosionState;
            if (corrosionState === 'critical' || corrosionState === 'meltdown') {
                this.audioSystem.playAlarm();
                this.cameras.main.flash(300, 255, 100, 0, false);
            }
        }

        // Auto rotate player to movement direction slightly
        if (this.joyVector.x !== 0 || this.joyVector.y !== 0) {
            const moveAngle = Math.atan2(this.joyVector.y, this.joyVector.x) + Math.PI/2;
            // Smooth rotation
            this.player.rotation = Phaser.Math.Angle.RotateTo(this.player.rotation, moveAngle, 0.08);
        }
    }

    updatePlayerMovement(dt) {
        let moveX = this.joyVector.x;
        let moveY = this.joyVector.y;

        // Keyboard
        if (this.cursors) {
            if (this.cursors.left.isDown || this.wasd?.A?.isDown) moveX -= 1;
            if (this.cursors.right.isDown || this.wasd?.D?.isDown) moveX += 1;
            if (this.cursors.up.isDown || this.wasd?.W?.isDown) moveY -= 1;
            if (this.cursors.down.isDown || this.wasd?.S?.isDown) moveY += 1;
        }

        const moving = Math.abs(moveX) > 0.05 || Math.abs(moveY) > 0.05;
        this.isMoving = moving;

        if (moving) {
            const thrust = this.shipSystem.actualThrust * (this.shipSystem.heatFactor || 1) * (this.shipSystem.powerOverloadFactor || 1);
            this.player.body.setAcceleration(moveX * thrust, moveY * thrust);
            this.engineFlame.setVisible(true);
            // Flicker
            this.engineFlame.setScale(0.8 + Math.random()*0.4);
        } else {
            this.player.body.setAcceleration(0,0);
            this.engineFlame.setVisible(false);
        }

        // Limit speed by weight factor
        const maxVel = 300 * this.shipSystem.weightFactor;
        const vel = this.player.body.velocity;
        const speed = Math.sqrt(vel.x*vel.x + vel.y*vel.y);
        if (speed > maxVel) {
            const factor = maxVel / speed;
            vel.x *= factor;
            vel.y *= factor;
        }
    }

    checkCollisions() {
        // Player projectiles vs enemies
        for (const proj of this.projectileSystem.projectiles) {
            if (!proj.active) continue;
            // Enemies
            for (const enemy of this.sectorSystem.enemies) {
                const es = enemy.getSprite();
                if (!es.active) continue;
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, es.x, es.y);
                if (dist < 24) {
                    const dead = enemy.takeDamage(proj.damage);
                    this.projectileSystem.handleCollision(proj, es);
                    this.audioSystem.playHit();
                    break;
                }
            }
            // Base parts
            for (const base of this.sectorSystem.bases) {
                for (const part of base.parts) {
                    if (!part.sprite.active) continue;
                    const dist = Phaser.Math.Distance.Between(proj.x, proj.y, part.sprite.x, part.sprite.y);
                    const radius = part.type === 'core' ? 35 : 20;
                    if (dist < radius + 6) {
                        part.sprite.takeDamage(proj.damage);
                        this.projectileSystem.handleCollision(proj, part.sprite);
                        this.audioSystem.playHit();
                        break;
                    }
                }
            }
        }

        // Enemy projectiles vs player
        if (this.enemyProjectiles) {
            for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
                const proj = this.enemyProjectiles[i];
                if (!proj.active) {
                    this.enemyProjectiles.splice(i, 1);
                    continue;
                }
                const dist = Phaser.Math.Distance.Between(proj.x, proj.y, this.player.x, this.player.y);
                if (dist < 28) {
                    this.shipSystem.takeDamage(proj.damage);
                    this.corrosionSystem.onDamage(proj.damage);
                    proj.destroy();
                    this.enemyProjectiles.splice(i, 1);
                    this.cameras.main.shake(100, 0.005);
                    this.audioSystem.playHit();
                }
            }
        }

        // Player vs enemies (collision damage)
        for (const enemy of this.sectorSystem.enemies) {
            const es = enemy.getSprite();
            if (!es.active) continue;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, es.x, es.y);
            if (dist < 32) {
                this.shipSystem.takeDamage(enemy.data.damage * 0.05, 0.2);
                this.corrosionSystem.onCollision();
                // Push apart
                const angle = Phaser.Math.Angle.Between(es.x, es.y, this.player.x, this.player.y);
                this.player.body.velocity.x += Math.cos(angle) * 150;
                this.player.body.velocity.y += Math.sin(angle) * 150;
            }
        }

        // Player vs pickups
        for (let i = this.sectorSystem.pickups.length - 1; i >= 0; i--) {
            const pickup = this.sectorSystem.pickups[i];
            if (!pickup.active) continue;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, pickup.y);
            if (dist < 36) {
                if (pickup.isScrap) {
                    this.shipSystem.addScrap(pickup.scrapAmount);
                    this.audioSystem.playScrap();
                    this.showMessage(`+${pickup.scrapAmount} ${t('scrap')}`, 0xffcc00, 1000);
                    pickup.destroy();
                    this.sectorSystem.pickups.splice(i, 1);
                } else if (pickup.isEquipment) {
                    const added = this.inventorySystem.addItem(pickup.equipmentId);
                    if (added) {
                        this.audioSystem.playScrap();
                        this.showMessage(`${pickup.equipmentId} collected`, 0x00ffff, 1500);
                        pickup.destroy();
                        this.sectorSystem.pickups.splice(i, 1);
                    } else {
                        this.showMessage('Inventory full!', 0xff4444, 1500);
                    }
                }
                this.updateUI();
            }
        }
    }

    checkHazards() {
        // Check if player in hazard zone (corrosion storm)
        // Hazards are circles with isHazard
        // For simplicity, check all children that are hazards
        // We'll query via physics? Instead iterate over display list
        // We'll store hazards in sectorSystem? We created as independent circles not in list
        // So search all game objects with isHazard
        const hazards = this.children.list.filter(c => c.isHazard);
        for (const h of hazards) {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, h.x, h.y);
            if (dist < h.radius) {
                // Apply extra corrosion
                this.shipSystem.corrosion += 0.05; // per frame in hazard
            }
        }
    }

    checkRepairStation() {
        let nearStation = null;
        for (const station of this.sectorSystem.repairStations) {
            if (!station.active) continue;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, station.x, station.y);
            if (dist < 80) {
                nearStation = station;
                break;
            }
        }

        if (nearStation) {
            this.repairHint.setText(currentLang === 'ar' ? 'اضغط للإصلاح / المخزن' : 'TAP FOR REPAIR / INVENTORY');
            this.repairHint.setVisible(true);
            // Check tap
            if (!this.repairHintTapped) {
                // Make hint interactive
                this.repairHint.setInteractive({ useHandCursor: true });
                this.repairHint.on('pointerdown', () => {
                    this.openRepair();
                });
                this.repairHintTapped = true;
            }
        } else {
            this.repairHint.setVisible(false);
        }
    }

    checkExitGate() {
        if (!this.sectorSystem.exitGate || !this.sectorSystem.exitGate.active) return;
        if (!this.sectorSystem.sectorCleared && this.sectorId < 5) return;

        const gate = this.sectorSystem.exitGate;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, gate.x, gate.y);
        if (dist < 70) {
            if (this.sectorId < 5) {
                // Next sector
                this.showMessage(currentLang === 'ar' ? 'دخول البوابة...' : 'Entering gate...', 0x00ff88, 1000);
                this.time.delayedCall(800, () => {
                    this.sectorId++;
                    this.scene.restart({ sectorId: this.sectorId, isContinue: false });
                });
            } else {
                // Boss sector -> spawn boss
                if (!this.sectorSystem.bossSpawned) {
                    this.spawnBoss();
                }
            }
        }
    }

    spawnBoss() {
        this.sectorSystem.bossSpawned = true;
        this.showMessage(t('boss_approaching'), 0xff0000, 4000);
        // Create boss enemy
        const x = this.sectorSystem.bounds.x + this.sectorSystem.bounds.width * 0.5;
        const y = this.sectorSystem.bounds.y + this.sectorSystem.bounds.height * 0.3;
        
        // Use EnemyAI but with boss stats
        // For simplicity, create a large enemy
            const EnemyAI = mod.EnemyAI;
            // We'll create custom boss sprite
            const bossContainer = this.add.container(x, y);
            const bossSprite = this.add.sprite(0, 0, 'behemoth');
            bossSprite.setScale(2.0);
            bossContainer.add(bossSprite);
            bossContainer.setSize(120, 120);
            this.physics.add.existing(bossContainer);
            bossContainer.body.setImmovable(true);
            bossContainer.hull = 600;
            bossContainer.maxHull = 600;
            bossContainer.isBoss = true;
            bossContainer.takeDamage = (dmg) => {
                bossContainer.hull -= dmg;
                if (bossContainer.hull <= 0) {
                    this.onBossDefeated(bossContainer);
                    return true;
                }
                return false;
            };
            this.boss = bossContainer;

            // Boss attack timer
            this.bossAttackTimer = this.time.addEvent({
                delay: 1500,
                callback: () => this.bossAttack(),
                loop: true
            });
        });
    }

    bossAttack() {
        if (!this.boss || !this.boss.active) return;
        // Shoot in multiple directions
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            this.createEnemyProjectile({
                x: this.boss.x,
                y: this.boss.y,
                angle: angle,
                damage: 20,
                speed: 250
            });
        }
        this.cameras.main.shake(150, 0.008);
    }

    onBossDefeated(boss) {
        const x = boss.x, y = boss.y;
        this.createExplosion(x, y, 0xff00ff, 50);
        this.time.delayedCall(200, () => this.createExplosion(x + 20, y + 10, 0xff0000, 40));
        this.time.delayedCall(400, () => this.createExplosion(x - 20, y - 15, 0x00ffff, 45));
        this.shipSystem.addScrap(500);
        this.audioSystem.playExplosion();
        this.showMessage(t('victory'), 0x00ffff, 4000);
        this.time.delayedCall(3000, () => {
            this.scene.start('VictoryScene', { scrap: this.shipSystem.scrap, sectorId: this.sectorId });
        });
        boss.destroy();
        if (this.bossAttackTimer) this.bossAttackTimer.remove();
    }

    updateUI() {
        // Hull
        const hullPct = Phaser.Math.Clamp(this.shipSystem.hull / this.shipSystem.maxHullEffective, 0, 1);
        this.hullBar.width = 110 * hullPct;
        this.hullText.setText(`${Math.floor(this.shipSystem.hull)}/${this.shipSystem.maxHullEffective}`);
        this.hullBar.setFillStyle(hullPct > 0.6 ? 0x00ff88 : hullPct > 0.3 ? 0xffaa00 : 0xff0000);

        // Corrosion
        const corrPct = this.shipSystem.corrosion / 100;
        this.corrBar.width = 110 * corrPct;
        this.corrText.setText(`${Math.floor(this.shipSystem.corrosion)}%`);
        const corrState = this.shipSystem.getCorrosionState();
        const colors = { stable: 0x00ffff, damaged: 0xffff00, critical: 0xff6600, meltdown: 0xff0000 };
        this.corrBar.setFillStyle(colors[corrState] || 0xff6600);

        // Power
        const powerPct = Phaser.Math.Clamp(this.shipSystem.currentPower / this.shipSystem.maxPowerEffective, 0, 1.5);
        this.powerBar.width = 80 * Math.min(powerPct, 1);
        this.powerBar.setFillStyle(powerPct > 1 ? 0xff0000 : 0x00aaff);

        // Heat
        const heatPct = Phaser.Math.Clamp(this.shipSystem.currentHeat / this.shipSystem.maxHeat, 0, 1.5);
        this.heatBar.width = 80 * Math.min(heatPct, 1);
        this.heatBar.setFillStyle(heatPct > 1 ? 0xff0000 : heatPct > 0.7 ? 0xffaa00 : 0xff4444);

        // Weight
        this.weightText.setText(`${t('weight')}: ${this.shipSystem.currentWeight}/${this.shipSystem.maxWeightEffective}${this.shipSystem.isOverweight ? ' ⚠' : ''}`);
        this.weightText.setColor(this.shipSystem.isOverweight ? '#ff4444' : '#aaaaaa');

        // Scrap
        this.scrapText.setText(`◈ ${this.shipSystem.scrap}`);

        // Core state
        const stateKey = `soul_core_state.${corrState}`;
        this.coreStateText.setText(`${t('corrosion')}: ${t(stateKey)} (${Math.floor(this.shipSystem.corrosion)}%)`);
        this.coreStateText.setColor(`#${(colors[corrState]||0x00ffff).toString(16).padStart(6,'0')}`);

        // Warnings
        let warning = '';
        if (this.shipSystem.isOverweight) warning = t('warnings.overweight');
        else if (this.shipSystem.isPowerOverload) warning = t('warnings.power_overload');
        else if (this.shipSystem.isOverheating) warning = t('warnings.overheating');
        else if (corrState === 'critical' || corrState === 'meltdown') warning = t('warnings.corrosion_critical');

        if (warning) {
            this.warningText.setText(warning);
            this.warningText.setVisible(true);
            // Blink
            if (!this.warningTween) {
                this.warningTween = this.tweens.add({
                    targets: this.warningText,
                    alpha: 0.2,
                    duration: 400,
                    yoyo: true,
                    repeat: -1
                });
            }
        } else {
            this.warningText.setVisible(false);
            if (this.warningTween) {
                this.warningTween.stop();
                this.warningTween = null;
                this.warningText.setAlpha(1);
            }
        }
    }

    updateSoulCoreVisual(state) {
        const colors = {
            stable: { glow: 0x00ffff, core: 0xffffff },
            damaged: { glow: 0xffff00, core: 0xffffaa },
            critical: { glow: 0xff6600, core: 0xffaaaa },
            meltdown: { glow: 0xff0000, core: 0xff0000 }
        };
        const col = colors[state] || colors.stable;
        this.soulCoreGlow.setFillStyle(col.glow, 0.35);
        this.soulCore.setFillStyle(col.core, 0.9);
        this.soulCore.setStrokeStyle(2, col.glow, 1);

        // Damage overlay based on hull
        const hullPct = this.shipSystem.hull / this.shipSystem.maxHullEffective;
        if (hullPct < 0.5) {
            this.damageOverlay.clear();
            this.damageOverlay.lineStyle(2, 0xff0000, 0.6 * (1 - hullPct));
            this.damageOverlay.strokeCircle(0, 0, 22);
            if (hullPct < 0.3) {
                // Cracks
                this.damageOverlay.lineBetween(-10, -10, 10, 10);
                this.damageOverlay.lineBetween(-10, 10, 10, -10);
            }
        } else {
            this.damageOverlay.clear();
        }

        // Corrosion overlay
        if (this.shipSystem.corrosion > 30) {
            this.corrosionOverlay.clear();
            const alpha = (this.shipSystem.corrosion - 30) / 70 * 0.5;
            this.corrosionOverlay.fillStyle(0x6600aa, alpha);
            this.corrosionOverlay.fillCircle(0, 0, 24);
        } else {
            this.corrosionOverlay.clear();
        }
    }

    openInventory() {
        this.isPaused = true;
        this.physics.pause();
        this.scene.launch('InventoryScene', {
            inventorySystem: this.inventorySystem,
            shipSystem: this.shipSystem,
            sectorId: this.sectorId
        });
        this.scene.bringToTop('InventoryScene');
        this.events.once('resumeInventory', (data) => {
            this.isPaused = false;
            this.physics.resume();
            if (data && data.updated) {
                // Update mounts
                for (const mount of this.weaponMounts) {
                    mount.setEquipment(this.shipSystem.equipped[mount.mountPosition]);
                }
                this.shipSystem.calculateStats();
                this.updateUI();
            }
        });
    }

    openRepair() {
        this.isPaused = true;
        this.physics.pause();
        this.scene.launch('RepairScene', {
            shipSystem: this.shipSystem,
            inventorySystem: this.inventorySystem
        });
        this.scene.bringToTop('RepairScene');
        this.events.once('resumeRepair', () => {
            this.isPaused = false;
            this.physics.resume();
            this.updateUI();
        });
    }

    autoSave() {
        this.saveSystem.saveGame(this.shipSystem, this.inventorySystem, this.sectorId, {});
    }

    gameOver() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.audioSystem.stopMusic();
        this.audioSystem.playExplosion();
        this.cameras.main.shake(500, 0.02);
        this.createExplosion(this.player.x, this.player.y, 0xff0000, 40);
        this.time.delayedCall(1000, () => {
            this.scene.start('GameOverScene', { scrap: this.shipSystem.scrap, sectorId: this.sectorId, corrosion: this.shipSystem.corrosion });
        });
    }
}


// --- soul-core-game/src/scenes/InventoryScene.js ---

class InventoryScene extends Phaser.Scene {
    constructor() {
        super('InventoryScene');
    }

    init(data) {
        this.inventorySystem = data.inventorySystem;
        this.shipSystem = data.shipSystem;
        this.sectorId = data.sectorId || 1;
        this.fromMenu = data.fromMenu || false;
    }

    create() {
        const { width, height } = this.cameras.main;
        this.selectedIndex = null;
        this.secondSelected = null;

        // Background dim
        const bg = this.add.rectangle(width/2, height/2, width, height, 0x02020a, 0.92);
        bg.setInteractive();
        bg.on('pointerdown', (pointer, localX, localY, event) => {
            // Close if click outside? For now ignore
            event.stopPropagation();
        });

        // Title
        this.add.text(width/2, 50, t('inventory'), {
            fontSize: '24px',
            color: '#00ffff',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Ship summary top
        this.createShipSummary(width);

        // Grid
        this.createGrid(width, height);

        // Equipment list bottom
        this.createEquipmentList(width, height);

        // Buttons
        this.createButtons(width, height);

        // Close button
        const closeBtn = this.add.circle(width - 40, 50, 20, 0x331111, 0.8);
        closeBtn.setStrokeStyle(2, 0xff4444, 0.8);
        closeBtn.setInteractive({ useHandCursor: true });
        const closeTxt = this.add.text(width - 40, 50, '✕', { fontSize: '18px', color: '#ff4444' }).setOrigin(0.5);
        closeBtn.on('pointerdown', () => this.closeInventory(false));

        // Stats preview
        this.statsPreview = this.add.text(width/2, height - 120, '', {
            fontSize: '11px',
            color: '#aaccff',
            fontFamily: 'monospace',
            align: 'center',
            backgroundColor: '#112233aa',
            padding: { x: 10, y: 6 }
        }).setOrigin(0.5);

        this.updateGrid();
        this.updateShipSummary();
    }

    createShipSummary(width) {
        const y = 90;
        const container = this.add.container(width/2, y);
        const bg = this.add.rectangle(0, 0, width - 30, 50, 0x112233, 0.6);
        bg.setStrokeStyle(1, 0x00ffff, 0.2);
        container.add(bg);

        this.summaryText = this.add.text(0, 0, '', {
            fontSize: '10px',
            color: '#ffffff',
            fontFamily: 'monospace',
            align: 'center'
        }).setOrigin(0.5);
        container.add(this.summaryText);
    }

    updateShipSummary() {
        if (!this.shipSystem) {
            this.summaryText.setText('No ship data');
            return;
        }
        const s = this.shipSystem;
        const left = s.equipped.left ? s.equipped.left.id : 'empty';
        const right = s.equipped.right ? s.equipped.right.id : 'empty';
        const rear = s.equipped.rear ? s.equipped.rear.id : 'empty';
        const text = `${t('weight')}: ${s.currentWeight}/${s.maxWeightEffective} | ${t('power')}: ${s.currentPower}/${s.maxPowerEffective} | ${t('heat')}: ${Math.floor(s.currentHeat)}/${s.maxHeat}\nL:${left} R:${right} Rear:${rear}`;
        this.summaryText.setText(text);
    }

    createGrid(width, height) {
        const gridW = 5, gridH = 6;
        const cellSize = 48;
        const gridPixelW = gridW * cellSize;
        const gridPixelH = gridH * cellSize;
        const startX = (width - gridPixelW) / 2;
        const startY = 130;

        this.gridStartX = startX;
        this.gridStartY = startY;
        this.cellSize = cellSize;

        // Grid background
        const gridBg = this.add.rectangle(width/2, startY + gridPixelH/2, gridPixelW + 10, gridPixelH + 10, 0x0a0a1a, 0.8);
        gridBg.setStrokeStyle(2, 0x334455, 0.5);

        this.gridCells = [];
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                const cellX = startX + x * cellSize + cellSize/2;
                const cellY = startY + y * cellSize + cellSize/2;
                const cellBg = this.add.rectangle(cellX, cellY, cellSize - 4, cellSize - 4, 0x1a1a2a, 0.6);
                cellBg.setStrokeStyle(1, 0x334455, 0.3);
                this.gridCells.push({ x, y, bg: cellBg, worldX: cellX, worldY: cellY });
            }
        }

        // Items will be rendered as sprites in cells
        this.itemSprites = [];
    }

    updateGrid() {
        // Clear previous
        this.itemSprites.forEach(s => s.destroy());
        this.itemSprites = [];

        if (!this.inventorySystem) return;

        const items = this.inventorySystem.getItems();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const { x, y, equipment, count } = item;
            const worldX = this.gridStartX + x * this.cellSize + this.cellSize/2;
            const worldY = this.gridStartY + y * this.cellSize + this.cellSize/2 + (equipment.cells - 1) * this.cellSize/2;

            const container = this.add.container(worldX, worldY);
            
            // Cell highlight based on selection
            const isSelected = this.selectedIndex === i;
            const isSecond = this.secondSelected === i;
            const bgColor = isSelected ? 0x00ffff : isSecond ? 0xffff00 : 0x334455;
            const bgAlpha = isSelected || isSecond ? 0.4 : 0.2;

            // Equipment visual
            let icon;
            if (this.textures.exists(equipment.icon)) {
                icon = this.add.sprite(0, 0, equipment.icon);
                icon.setScale(0.5);
            } else {
                // Color based on type
                const colors = {
                    laser: 0x00ffff,
                    cannon: 0xffaa00,
                    plasma: 0xff00ff,
                    missile: 0x66ff66,
                    reactor: 0x00aaff,
                    engine: 0xaaaaff,
                    shield: 0x4444ff,
                    cooler: 0x88ffff,
                    armor: 0xaaaaaa
                };
                const col = colors[equipment.weaponType || equipment.category] || 0xffffff;
                icon = this.add.circle(0, 0, 16, col, 0.8);
                icon.setStrokeStyle(2, 0xffffff, 0.6);
            }

            // Tier badge
            const tierBadge = this.add.circle(14, -14, 8, 0x000000, 0.7);
            tierBadge.setStrokeStyle(1, 0xffffff, 0.5);
            const tierText = this.add.text(14, -14, `${equipment.tier}`, { fontSize: '10px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5);

            // Count if >1
            let countText = null;
            if (count > 1) {
                countText = this.add.text(-14, 14, `x${count}`, { fontSize: '10px', color: '#ffcc00', backgroundColor: '#000000aa', fontFamily: 'monospace' }).setOrigin(0.5);
            }

            // Cells indicator (height)
            if (equipment.cells > 1) {
                const heightBar = this.add.rectangle(-18, 0, 4, equipment.cells * this.cellSize - 8, 0x00ffff, 0.3);
            }

            container.add([icon, tierBadge, tierText]);
            if (countText) container.add(countText);

            // Interactive
            const hitArea = this.add.rectangle(0, 0, this.cellSize - 4, equipment.cells * this.cellSize - 4, 0x000000, 0);
            hitArea.setInteractive({ useHandCursor: true });
            container.add(hitArea);
            container.setSize(this.cellSize, equipment.cells * this.cellSize);
            container.setDepth(1);

            hitArea.on('pointerdown', () => {
                this.onItemSelected(i);
            });

            // Selection highlight
            if (isSelected || isSecond) {
                const highlight = this.add.rectangle(0, 0, this.cellSize - 2, equipment.cells * this.cellSize - 2, 0x000000, 0);
                highlight.setStrokeStyle(3, bgColor, 0.9);
                container.add(highlight);
            }

            this.itemSprites.push(container);
        }

        // Update stats preview if selected
        if (this.selectedIndex !== null) {
            const item = items[this.selectedIndex];
            if (item) {
                const eq = item.equipment;
                const preview = `${eq.id} | ${t('weight')}:${eq.weight} ${t('power')}:${eq.power} ${t('heat')}:${eq.heat}\nDMG:${eq.stats.damage || '-'} RNG:${eq.stats.range || '-'} FR:${eq.stats.fireRate || '-'}`;
                this.statsPreview.setText(preview);
            }
        } else {
            this.statsPreview.setText(currentLang === 'ar' ? 'اختر عنصرين متطابقين للدمج\nاضغط على عنصر ثم زر تركيب' : 'Select 2 identical to merge\nTap item then Equip button');
        }
    }

    onItemSelected(index) {
        if (this.selectedIndex === null) {
            this.selectedIndex = index;
        } else if (this.selectedIndex === index) {
            this.selectedIndex = null;
            this.secondSelected = null;
        } else if (this.secondSelected === null) {
            this.secondSelected = index;
            // Try merge automatically if same id
            const items = this.inventorySystem.getItems();
            const a = items[this.selectedIndex];
            const b = items[this.secondSelected];
            if (a && b && a.equipment.id === b.equipment.id) {
                this.tryMerge();
            }
        } else {
            this.selectedIndex = index;
            this.secondSelected = null;
        }
        this.updateGrid();
    }

    createEquipmentList(width, height) {
        // Bottom area for mount selection - simplified
        const y = height - 200;
        const mounts = ['left', 'right', 'rear', 'reactor', 'engine', 'shield', 'cooler', 'armor'];
        const mountLabels = {
            left: currentLang === 'ar' ? 'يسار' : 'LEFT',
            right: currentLang === 'ar' ? 'يمين' : 'RIGHT',
            rear: currentLang === 'ar' ? 'خلف' : 'REAR',
            reactor: 'REACTOR',
            engine: 'ENGINE',
            shield: 'SHIELD',
            cooler: 'COOLER',
            armor: 'ARMOR'
        };

        this.mountButtons = [];
        let x = 20;
        for (const mount of mounts) {
            const btn = this.add.container(x, y);
            const bg = this.add.rectangle(0, 0, 55, 28, 0x112233, 0.8);
            bg.setStrokeStyle(1, 0x556677, 0.4);
            bg.setInteractive({ useHandCursor: true });
            const label = this.add.text(0, 0, mountLabels[mount], { fontSize: '8px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5);
            btn.add([bg, label]);
            btn.setSize(55, 28);

            bg.on('pointerdown', () => {
                this.selectedMount = mount;
                this.updateMountButtons();
            });

            this.mountButtons.push({ mount, bg });
            this.add.existing(btn);
            x += 60;
            if (x > width - 60) {
                x = 20;
                // Next row would go out of view, so limit to first row for now
                if (mount === 'rear') break;
            }
        }
        this.selectedMount = 'left';
        this.updateMountButtons();
    }

    updateMountButtons() {
        for (const b of this.mountButtons) {
            if (b.mount === this.selectedMount) {
                b.bg.setFillStyle(0x00ffff, 0.3);
                b.bg.setStrokeStyle(2, 0x00ffff, 1);
            } else {
                b.bg.setFillStyle(0x112233, 0.8);
                b.bg.setStrokeStyle(1, 0x556677, 0.4);
            }
        }
    }

    createButtons(width, height) {
        const btnY = height - 70;
        
        // Merge button
        const mergeBtn = this.add.container(width*0.25, btnY);
        const mergeBg = this.add.rectangle(0, 0, 110, 44, 0x332200, 0.8);
        mergeBg.setStrokeStyle(2, 0xffcc00, 0.6);
        mergeBg.setInteractive({ useHandCursor: true });
        const mergeTxt = this.add.text(0, 0, t('merge'), { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        mergeBtn.add([mergeBg, mergeTxt]);
        mergeBg.on('pointerdown', () => this.tryMerge());

        // Equip button
        const equipBtn = this.add.container(width*0.5, btnY);
        const equipBg = this.add.rectangle(0, 0, 110, 44, 0x003322, 0.8);
        equipBg.setStrokeStyle(2, 0x00ff88, 0.6);
        equipBg.setInteractive({ useHandCursor: true });
        const equipTxt = this.add.text(0, 0, t('equip'), { fontSize: '14px', color: '#00ff88', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        equipBtn.add([equipBg, equipTxt]);
        equipBg.on('pointerdown', () => this.tryEquip());

        // Unequip button
        const unequipBtn = this.add.container(width*0.75, btnY);
        const unequipBg = this.add.rectangle(0, 0, 110, 44, 0x330000, 0.8);
        unequipBg.setStrokeStyle(2, 0xff4444, 0.6);
        unequipBg.setInteractive({ useHandCursor: true });
        const unequipTxt = this.add.text(0, 0, t('unequip'), { fontSize: '12px', color: '#ff8888', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        unequipBtn.add([unequipBg, unequipTxt]);
        unequipBg.on('pointerdown', () => this.tryUnequip());

        // Close
        const closeBtn = this.add.container(width/2, height - 25);
        const closeBg = this.add.rectangle(0, 0, 200, 36, 0x112233, 0.8);
        closeBg.setStrokeStyle(1, 0x00ffff, 0.4);
        closeBg.setInteractive({ useHandCursor: true });
        const closeTxt = this.add.text(0, 0, currentLang === 'ar' ? 'إغلاق وحفظ' : 'CLOSE & SAVE', { fontSize: '12px', color: '#aaccff', fontFamily: 'monospace' }).setOrigin(0.5);
        closeBtn.add([closeBg, closeTxt]);
        closeBg.on('pointerdown', () => this.closeInventory(true));
    }

    tryMerge() {
        if (this.selectedIndex === null || this.secondSelected === null) {
            this.showMessage(currentLang === 'ar' ? 'اختر عنصرين' : 'Select 2 items');
            return;
        }
        const result = this.inventorySystem.tryMerge(this.selectedIndex, this.secondSelected);
        if (result) {
            this.showMessage(`${currentLang === 'ar' ? 'تم الدمج!' : 'Merged!'} ${result.id}`, 0x00ff88);
            this.selectedIndex = null;
            this.secondSelected = null;
            this.updateGrid();
            this.updateShipSummary();
        } else {
            this.showMessage(currentLang === 'ar' ? 'لا يمكن الدمج' : 'Cannot merge', 0xff4444);
        }
    }

    tryEquip() {
        if (this.selectedIndex === null) {
            this.showMessage(currentLang === 'ar' ? 'اختر عنصراً' : 'Select item');
            return;
        }
        if (!this.shipSystem) {
            this.showMessage('No ship', 0xff4444);
            return;
        }
        const items = this.inventorySystem.getItems();
        const item = items[this.selectedIndex];
        if (!item) return;

        const eq = item.equipment;
        const mount = this.selectedMount;

        const check = this.shipSystem.canEquip(eq, mount);
        if (!check.ok) {
            this.showMessage(check.reason, 0xff4444);
            return;
        }

        // If mount occupied, move old to inventory
        let old = null;
        if (mount === 'left' || mount === 'right' || mount === 'rear') {
            old = this.shipSystem.equipped[mount];
            if (old) {
                const added = this.inventorySystem.addItem(old.id);
                if (!added) {
                    this.showMessage('Inventory full', 0xff4444);
                    return;
                }
            }
        }

        this.shipSystem.equip(eq, mount);
        // Remove from inventory
        this.inventorySystem.removeItem(this.selectedIndex);
        if (old) {
            // Old already added
        }

        this.selectedIndex = null;
        this.updateGrid();
        this.updateShipSummary();
        this.showMessage(`${t('equip')}: ${eq.id} -> ${mount}`, 0x00ff88);
    }

    tryUnequip() {
        if (!this.shipSystem) return;
        const mount = this.selectedMount;
        let old = null;
        if (mount === 'left' || mount === 'right' || mount === 'rear') {
            old = this.shipSystem.equipped[mount];
            if (old) {
                const added = this.inventorySystem.addItem(old.id);
                if (added) {
                    this.shipSystem.unequip(mount);
                    this.showMessage(`${t('unequip')}: ${old.id}`, 0xffaa00);
                } else {
                    this.showMessage('Inventory full', 0xff4444);
                }
            } else {
                this.showMessage('Empty slot', 0xaaaaaa);
            }
        } else {
            // Utility
            const list = this.shipSystem.equipped[mount];
            if (list && list.length > 0) {
                old = list[0];
                const added = this.inventorySystem.addItem(old.id);
                if (added) {
                    this.shipSystem.unequip(mount, 0);
                    this.showMessage(`${t('unequip')}: ${old.id}`, 0xffaa00);
                } else {
                    this.showMessage('Inventory full', 0xff4444);
                }
            }
        }
        this.updateGrid();
        this.updateShipSummary();
    }

    showMessage(text, color = 0xffffff) {
        if (this.messageText) this.messageText.destroy();
        const { width, height } = this.cameras.main;
        this.messageText = this.add.text(width/2, height - 100, text, {
            fontSize: '12px',
            color: `#${color.toString(16).padStart(6,'0')}`,
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 4 },
            fontFamily: 'monospace'
        }).setOrigin(0.5);
        this.time.delayedCall(2000, () => {
            if (this.messageText) {
                this.messageText.destroy();
                this.messageText = null;
            }
        });
    }

    closeInventory(updated = true) {
        if (this.fromMenu) {
            this.scene.start('MainMenuScene');
        } else {
            this.scene.stop();
            const gameScene = this.scene.get('GameScene');
            if (gameScene) {
                gameScene.events.emit('resumeInventory', { updated });
            }
        }
    }
}


// --- soul-core-game/src/scenes/RepairScene.js ---

class RepairScene extends Phaser.Scene {
    constructor() {
        super('RepairScene');
    }

    init(data) {
        this.shipSystem = data.shipSystem;
        this.inventorySystem = data.inventorySystem;
    }

    create() {
        const { width, height } = this.cameras.main;

        // Background
        this.add.rectangle(width/2, height/2, width, height, 0x001122, 0.93);

        this.add.text(width/2, 50, t('repair'), {
            fontSize: '22px',
            color: '#00ff88',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Ship status
        const statusY = 100;
        this.hullText = this.add.text(width/2, statusY, '', { fontSize: '14px', color: '#ffffff', fontFamily: 'monospace', align: 'center' }).setOrigin(0.5);
        this.corrText = this.add.text(width/2, statusY + 24, '', { fontSize: '14px', color: '#ffaa00', fontFamily: 'monospace', align: 'center' }).setOrigin(0.5);
        this.scrapText = this.add.text(width/2, statusY + 48, '', { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace', align: 'center' }).setOrigin(0.5);

        this.updateStatus();

        // Repair options
        this.createRepairOptions(width, height);

        // Close button
        const closeBtn = this.add.container(width/2, height - 50);
        const closeBg = this.add.rectangle(0, 0, 200, 44, 0x112233, 0.9);
        closeBg.setStrokeStyle(2, 0x00ffff, 0.5);
        closeBg.setInteractive({ useHandCursor: true });
        const closeTxt = this.add.text(0, 0, currentLang === 'ar' ? 'إغلاق' : 'CLOSE', { fontSize: '14px', color: '#00ffff', fontFamily: 'monospace' }).setOrigin(0.5);
        closeBtn.add([closeBg, closeTxt]);
        closeBg.on('pointerdown', () => this.closeRepair());

        // Message
        this.messageText = this.add.text(width/2, height - 100, '', {
            fontSize: '12px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 4 },
            fontFamily: 'monospace'
        }).setOrigin(0.5).setVisible(false);
    }

    updateStatus() {
        const s = this.shipSystem;
        this.hullText.setText(`${t('hull')}: ${Math.floor(s.hull)}/${s.maxHullEffective} (${Math.floor(s.hull/s.maxHullEffective*100)}%)`);
        this.corrText.setText(`${t('corrosion')}: ${Math.floor(s.corrosion)}% - ${s.getCorrosionState()}`);
        this.scrapText.setText(`${t('scrap')}: ${s.scrap}`);
    }

    createRepairOptions(width, height) {
        const startY = 200;
        const options = [
            { id: 'hull_25', label: currentLang === 'ar' ? 'إصلاح الهيكل 25%' : 'Repair Hull 25%', cost: 30, action: () => this.repairHull(0.25) },
            { id: 'hull_full', label: currentLang === 'ar' ? 'إصلاح كامل' : 'Full Repair', cost: 100, action: () => this.repairHull(1) },
            { id: 'corr_20', label: currentLang === 'ar' ? 'إزالة تآكل 20%' : 'Remove Corrosion 20%', cost: 40, action: () => this.repairCorrosion(20) },
            { id: 'corr_full', label: currentLang === 'ar' ? 'تطهير تآكل كامل' : 'Full Corrosion Cleanse', cost: 150, action: () => this.repairCorrosion(100) },
            { id: 'upgrade_hull', label: currentLang === 'ar' ? 'ترقية هيكل دائمة +20' : 'Perma Hull +20', cost: 200, action: () => this.permaUpgrade('maxHull') },
            { id: 'upgrade_cooling', label: currentLang === 'ar' ? 'ترقية تبريد +10' : 'Cooling +10', cost: 180, action: () => this.permaUpgrade('cooling') },
        ];

        this.optionButtons = [];
        options.forEach((opt, i) => {
            const y = startY + i * 62;
            const container = this.add.container(width/2, y);
            const bg = this.add.rectangle(0, 0, width - 40, 52, 0x112233, 0.8);
            bg.setStrokeStyle(1, 0x00ff88, 0.4);
            bg.setInteractive({ useHandCursor: true });

            const label = this.add.text(- (width - 60)/2 + 10, 0, opt.label, { fontSize: '13px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0, 0.5);
            const cost = this.add.text((width - 60)/2 - 10, 0, `◈ ${opt.cost}`, { fontSize: '13px', color: '#ffcc00', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(1, 0.5);

            container.add([bg, label, cost]);

            bg.on('pointerover', () => {
                bg.setFillStyle(0x1a3344, 0.9);
                bg.setStrokeStyle(2, 0x00ff88, 0.8);
            });
            bg.on('pointerout', () => {
                bg.setFillStyle(0x112233, 0.8);
                bg.setStrokeStyle(1, 0x00ff88, 0.4);
            });
            bg.on('pointerdown', () => {
                if (this.shipSystem.scrap >= opt.cost) {
                    opt.action();
                    this.shipSystem.scrap -= opt.cost;
                    this.updateStatus();
                    this.showMessage(currentLang === 'ar' ? 'تم!' : 'Done!', 0x00ff88);
                    if (this.cache.audio.exists('repair')) this.sound.play('repair', { volume: 0.6 });
                } else {
                    this.showMessage(currentLang === 'ar' ? 'خردة غير كافية' : 'Not enough scrap', 0xff4444);
                }
            });

            this.optionButtons.push(container);
        });
    }

    repairHull(percent) {
        const amount = this.shipSystem.maxHullEffective * percent;
        this.shipSystem.repairHull(amount);
    }

    repairCorrosion(percent) {
        this.shipSystem.repairCorrosion(percent);
    }

    permaUpgrade(type) {
        if (!this.shipSystem.permanentUpgrades) this.shipSystem.permanentUpgrades = {};
        if (type === 'maxHull') {
            this.shipSystem.permanentUpgrades.maxHull = (this.shipSystem.permanentUpgrades.maxHull || 0) + 20;
        } else if (type === 'cooling') {
            this.shipSystem.permanentUpgrades.cooling = (this.shipSystem.permanentUpgrades.cooling || 0) + 10;
        }
        this.shipSystem.calculateStats();
    }

    showMessage(text, color) {
        this.messageText.setText(text);
        this.messageText.setColor(`#${color.toString(16).padStart(6,'0')}`);
        this.messageText.setVisible(true);
        this.time.delayedCall(2000, () => this.messageText.setVisible(false));
    }

    closeRepair() {
        this.scene.stop();
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
            gameScene.events.emit('resumeRepair');
        }
    }
}


// --- soul-core-game/src/scenes/GameOverScene.js ---

class GameOverScene extends Phaser.Scene {
    constructor() {
        super('GameOverScene');
    }

    init(data) {
        this.scrap = data.scrap || 0;
        this.sectorId = data.sectorId || 1;
        this.corrosion = data.corrosion || 100;
    }

    create() {
        const { width, height } = this.cameras.main;
        this.saveSystem = new SaveSystem();

        // Background - dark red
        this.add.rectangle(width/2, height/2, width, height, 0x110202, 1);

        // Stars dim
        for (let i = 0; i < 80; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            this.add.circle(x, y, Math.random()*1.5, 0x661111, 0.4);
        }

        // Core collapse visual
        const coreY = height * 0.32;
        const glow = this.add.circle(width/2, coreY, 70, 0xff0000, 0.2);
        const core = this.add.circle(width/2, coreY, 30, 0x440000, 0.8);
        core.setStrokeStyle(3, 0xff0000, 0.8);

        // Cracked effect
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const line = this.add.line(width/2, coreY, 0, 0, Math.cos(angle)*40, Math.sin(angle)*40, 0xff0000, 0.6);
            line.setLineWidth(2);
        }

        // Title
        this.add.text(width/2, coreY + 80, t('game_over'), {
            fontSize: '32px',
            color: '#ff4444',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            stroke: '#880000',
            strokeThickness: 2
        }).setOrigin(0.5).setShadow(0, 0, '#ff0000', 15, true, true);

        // Lore
        const lore = currentLang === 'ar' 
            ? 'انهارت النواة... تآكلت آخر شفرة جينية\nلكن بعض البيانات بقيت للمحاولة القادمة'
            : 'The core collapsed... the last genetic code corroded\nBut some data remains for next attempt';
        
        this.add.text(width/2, coreY + 120, lore, {
            fontSize: '13px',
            color: '#886666',
            align: 'center',
            lineSpacing: 5
        }).setOrigin(0.5);

        // Stats
        const statsY = height * 0.58;
        const statsBg = this.add.rectangle(width/2, statsY, width - 40, 120, 0x221111, 0.6);
        statsBg.setStrokeStyle(1, 0x661111, 0.5);

        this.add.text(width/2, statsY - 35, `${t('sector')}: ${this.sectorId}`, { fontSize: '14px', color: '#ffaa88', fontFamily: 'monospace' }).setOrigin(0.5);
        this.add.text(width/2, statsY - 10, `${t('scrap')}: ${this.scrap}`, { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace' }).setOrigin(0.5);
        this.add.text(width/2, statsY + 15, `${t('corrosion')}: ${Math.floor(this.corrosion)}%`, { fontSize: '14px', color: '#ff6600', fontFamily: 'monospace' }).setOrigin(0.5);

        // Permanent upgrade hint
        this.add.text(width/2, statsY + 45, currentLang === 'ar' ? 'ستحتفظ ببعض الترقيات الدائمة' : 'You keep some permanent upgrades', {
            fontSize: '11px',
            color: '#6688aa',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        // Buttons
        const btnY = height * 0.78;
        
        // Try again
        const retryBtn = this.add.container(width/2, btnY);
        const retryBg = this.add.rectangle(0, 0, 220, 50, 0x331111, 0.9);
        retryBg.setStrokeStyle(2, 0xff4444, 0.7);
        retryBg.setInteractive({ useHandCursor: true });
        const retryTxt = this.add.text(0, 0, t('try_again'), { fontSize: '18px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        retryBtn.add([retryBg, retryTxt]);

        retryBg.on('pointerdown', () => {
            // Save permanent progress
            const existing = this.saveSystem.load();
            if (existing) {
                // Keep permanent upgrades, clear sector
                existing.sectorId = 1;
                existing.ship.hull = existing.ship.maxHull || 100;
                existing.ship.corrosion = 0;
                // Add bonus scrap as permanent?
                this.saveSystem.save(existing);
            }
            this.scene.start('MainMenuScene');
        });

        // Main menu
        const menuBtn = this.add.container(width/2, btnY + 65);
        const menuBg = this.add.rectangle(0, 0, 220, 44, 0x112233, 0.8);
        menuBg.setStrokeStyle(1, 0x00ffff, 0.4);
        menuBg.setInteractive({ useHandCursor: true });
        const menuTxt = this.add.text(0, 0, currentLang === 'ar' ? 'القائمة الرئيسية' : 'MAIN MENU', { fontSize: '14px', color: '#88aaff', fontFamily: 'monospace' }).setOrigin(0.5);
        menuBtn.add([menuBg, menuTxt]);

        menuBg.on('pointerdown', () => {
            this.scene.start('MainMenuScene');
        });

        // Clear save if player wants? Keep for now

        // Fade in
        this.cameras.main.fadeIn(600, 17, 2, 2);
    }
}


// --- soul-core-game/src/scenes/VictoryScene.js ---

class VictoryScene extends Phaser.Scene {
    constructor() {
        super('VictoryScene');
    }

    init(data) {
        this.scrap = data.scrap || 0;
        this.sectorId = data.sectorId || 1;
    }

    create() {
        const { width, height } = this.cameras.main;

        // Background - bright cyan / genesis
        this.add.rectangle(width/2, height/2, width, height, 0x020a1a, 1);

        // Stars bright
        for (let i = 0; i < 120; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const c = this.add.circle(x, y, Math.random()*2+0.5, 0x88ffff, 0.6 + Math.random()*0.4);
            this.tweens.add({ targets: c, alpha: 0.2, duration: 1000 + Math.random()*2000, yoyo: true, repeat: -1 });
        }

        // Genesis core visual - big bright
        const coreY = height * 0.35;
        const glow1 = this.add.circle(width/2, coreY, 120, 0x00ffff, 0.15);
        const glow2 = this.add.circle(width/2, coreY, 80, 0x00ffff, 0.25);
        const glow3 = this.add.circle(width/2, coreY, 45, 0xffffff, 0.9);
        glow3.setStrokeStyle(4, 0x00ffff, 1);

        // Rotating rings
        for (let i = 0; i < 3; i++) {
            const ring = this.add.circle(width/2, coreY, 55 + i*18, 0x000000, 0);
            ring.setStrokeStyle(1, 0x00ffff, 0.3 - i*0.08);
            this.tweens.add({ targets: ring, rotation: Math.PI*2 * (i%2?1:-1), duration: 6000 + i*2000, repeat: -1 });
        }

        this.tweens.add({ targets: glow1, scale: 1.2, alpha: 0.25, duration: 2000, yoyo: true, repeat: -1 });
        this.tweens.add({ targets: glow2, scale: 1.15, alpha: 0.4, duration: 1500, yoyo: true, repeat: -1 });

        // Title
        this.add.text(width/2, coreY + 90, t('victory'), {
            fontSize: '30px',
            color: '#00ffff',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            stroke: '#0080ff',
            strokeThickness: 2
        }).setOrigin(0.5).setShadow(0, 0, '#00ffff', 20, true, true);

        // Lore
        const lore = currentLang === 'ar'
            ? 'وصلت النواة إلى عين الشذوذ\nتمت زراعة الشفرة... مجرة جديدة تولد\nلكن التآكل لم ينته... مجرة فاسدة تنتظرك'
            : 'The core reached the Eye of Anomaly\nCode planted... a new galaxy is born\nBut decay never ends... Corrupted Galaxy awaits';

        this.add.text(width/2, coreY + 135, lore, {
            fontSize: '13px',
            color: '#aaddff',
            align: 'center',
            lineSpacing: 6
        }).setOrigin(0.5);

        // Stats
        const statsY = height * 0.62;
        const statsBg = this.add.rectangle(width/2, statsY, width - 40, 100, 0x112233, 0.5);
        statsBg.setStrokeStyle(1, 0x00ffff, 0.3);

        this.add.text(width/2, statsY - 25, `${t('sector')}: ${this.sectorId} CLEARED`, { fontSize: '14px', color: '#00ffaa', fontFamily: 'monospace' }).setOrigin(0.5);
        this.add.text(width/2, statsY, `${t('scrap')}: ${this.scrap}`, { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace' }).setOrigin(0.5);
        this.add.text(width/2, statsY + 25, currentLang === 'ar' ? 'تم فتح New Game+ (قريباً)' : 'New Game+ Unlocked (Soon)', { fontSize: '12px', color: '#ff88ff', fontFamily: 'monospace' }).setOrigin(0.5);

        // Buttons
        const btnY = height * 0.80;

        const continueBtn = this.add.container(width/2, btnY);
        const contBg = this.add.rectangle(0, 0, 240, 50, 0x002233, 0.9);
        contBg.setStrokeStyle(2, 0x00ffff, 0.8);
        contBg.setInteractive({ useHandCursor: true });
        const contTxt = this.add.text(0, 0, currentLang === 'ar' ? 'المتابعة للقطاع التالي' : 'NEXT SECTOR', { fontSize: '16px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        continueBtn.add([contBg, contTxt]);

        contBg.on('pointerdown', () => {
            const nextSector = this.sectorId + 1;
            if (nextSector <= 5) {
                this.scene.start('GameScene', { sectorId: nextSector, isContinue: false });
            } else {
                // Loop or New Game+
                this.scene.start('MainMenuScene');
            }
        });

        const menuBtn = this.add.container(width/2, btnY + 65);
        const menuBg = this.add.rectangle(0, 0, 240, 44, 0x112233, 0.8);
        menuBg.setStrokeStyle(1, 0x88aaff, 0.4);
        menuBg.setInteractive({ useHandCursor: true });
        const menuTxt = this.add.text(0, 0, currentLang === 'ar' ? 'القائمة الرئيسية' : 'MAIN MENU', { fontSize: '14px', color: '#88aaff', fontFamily: 'monospace' }).setOrigin(0.5);
        menuBtn.add([menuBg, menuTxt]);

        menuBg.on('pointerdown', () => {
            this.scene.start('MainMenuScene');
        });

        this.cameras.main.fadeIn(800, 2, 10, 26);
    }
}


// --- soul-core-game/src/scenes/BossScene.js ---


// BossScene is a specialized GameScene for sector 5
// For Vertical Slice, boss is integrated in GameScene sector 5
// This scene exists to satisfy architecture and can be used for dedicated boss arena
class BossScene extends GameScene {
    constructor() {
        super('BossScene');
    }

    init(data) {
        super.init({ sectorId: 5, isContinue: false, ...data });
        this.isBossScene = true;
    }

    create() {
        super.create();
        // Additional boss setup
        this.showMessage('VOID BEHEMOTH ARENA', 0xff00ff, 3000);
        // Force boss spawn after short delay
        this.time.delayedCall(2000, () => {
            if (!this.sectorSystem.bossSpawned) {
                this.spawnBoss();
            }
        });
    }
}


const gameConfig = {
    type: Phaser.AUTO,
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height,
    backgroundColor: GAME_CONFIG.backgroundColor,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false }
    },
    scene: [BootScene, PreloadScene, MainMenuScene, GameScene, InventoryScene, RepairScene, BossScene, GameOverScene, VictoryScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_CONFIG.width,
        height: GAME_CONFIG.height
    },
    input: { activePointers: 3 },
    audio: { disableWebAudio: false },
    render: { antialias: true, pixelArt: false, roundPixels: false }
};

window.addEventListener('load', () => {
    const game = new Phaser.Game(gameConfig);
    window.addEventListener('resize', () => { if (game.scale) game.scale.refresh(); });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (e.target.closest('#game-container')) e.preventDefault(); }, { passive: false });
    console.log('Soul Core NoAssets - Game initialized');
    setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        if (ls) { ls.classList.add('hidden'); setTimeout(() => ls.style.display = 'none', 800); }
    }, 800);
});

if (document.readyState === 'complete') {
    const game = new Phaser.Game(gameConfig);
}
