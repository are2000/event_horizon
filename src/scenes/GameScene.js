import { GAME_CONFIG, MOUNT_POSITIONS, TARGET_PRIORITIES } from '../config.js';
import { t, currentLang } from '../data/localization.js';
import { ShipSystem } from '../systems/ship-system.js';
import { InventorySystem } from '../systems/inventory-system.js';
import { WeaponMount, ProjectileSystem } from '../systems/weapon-system.js';
import { TargetingSystem } from '../systems/targeting-system.js';
import { CorrosionSystem } from '../systems/corrosion-system.js';
import { SectorSystem } from '../systems/sector-system.js';
import { SaveSystem } from '../systems/save-system.js';
import { AudioSystem } from '../systems/audio-system.js';
import { getEquipment, INITIAL_LOADOUT } from '../data/equipment.js';
const Phaser = window.Phaser;

export class GameScene extends Phaser.Scene {
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
                import('../systems/enemy-ai.js').then(mod => {
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
        import('../systems/enemy-ai.js').then(mod => {
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
