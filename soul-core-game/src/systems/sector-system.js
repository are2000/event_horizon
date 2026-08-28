import { GAME_CONFIG, SECTOR_TYPES } from '../config.js';
import { EnemyAI } from './enemy-ai.js';
import { ENEMY_TYPES } from '../config.js';
import { rollLoot } from '../data/equipment.js';
const Phaser = window.Phaser;

export class SectorSystem {
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
