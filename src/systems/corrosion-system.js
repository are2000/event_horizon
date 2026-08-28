import { GAME_CONFIG } from '../config.js';
const Phaser = window.Phaser;

export class CorrosionSystem {
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
