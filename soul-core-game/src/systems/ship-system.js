import { GAME_CONFIG } from '../config.js';
const Phaser = window.Phaser;

export class ShipSystem {
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
