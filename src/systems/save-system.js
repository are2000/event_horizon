const Phaser = window.Phaser;
export class SaveSystem {
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
