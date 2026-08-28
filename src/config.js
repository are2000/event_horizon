const Phaser = window.Phaser;
export const GAME_CONFIG = {
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

export const WEAPON_TYPES = {
    LASER: 'laser',
    CANNON: 'cannon',
    PLASMA: 'plasma',
    MISSILE: 'missile'
};

export const MOUNT_POSITIONS = {
    LEFT: 'left',
    RIGHT: 'right',
    REAR: 'rear'
};

// Mount arcs in degrees (relative to ship forward = 0 deg = up)
export const MOUNT_ARCS = {
    [MOUNT_POSITIONS.LEFT]: { min: -120, max: 30, defaultAngle: -45 },
    [MOUNT_POSITIONS.RIGHT]: { min: -30, max: 120, defaultAngle: 45 },
    [MOUNT_POSITIONS.REAR]: { min: 90, max: 270, defaultAngle: 180 }
};

export const TARGET_PRIORITIES = {
    CLOSEST: 'closest',
    WEAKEST: 'weakest',
    DANGEROUS: 'dangerous',
    MANUAL: 'manual'
};

export const ENEMY_TYPES = {
    FIGHTER: 'fighter',
    GUNSHIP: 'gunship',
    DRONE: 'drone',
    SHIELD_CARRIER: 'shield_carrier',
    ELITE: 'elite'
};

export const SECTOR_TYPES = {
    SCRAP_BELT: 1,
    PATROL: 2,
    SCAVENGER_BASE: 3,
    CORROSION_STORM: 4,
    BEHEMOTH: 5
};
