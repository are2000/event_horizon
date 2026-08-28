import { ENEMY_TYPES } from '../config.js';
const Phaser = window.Phaser;

export const ENEMY_DB = {
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

export const BASE_PARTS = {
    detection: { hull: 60, score: 20, sprite: 'reactor', scale: 0.7, type: 'detection' },
    turret: { hull: 80, damage: 20, fireRate: 900, range: 350, score: 30, sprite: 'cannon', scale: 0.8, type: 'turret' },
    shield_gen: { hull: 100, shield: 150, score: 40, sprite: 'shield', scale: 0.8, type: 'shield_gen', shieldRadius: 400 },
    repair: { hull: 70, score: 25, sprite: 'engine', scale: 0.7, type: 'repair', healRate: 5 },
    scrap_storage: { hull: 50, scrap: 100, score: 15, sprite: 'core', scale: 0.7, type: 'storage' },
    core: { hull: 200, score: 200, scrap: 200, sprite: 'behemoth', scale: 1.2, type: 'core' }
};

export const BOSS_DB = {
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
