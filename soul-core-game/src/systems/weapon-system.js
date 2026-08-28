import { MOUNT_ARCS, MOUNT_POSITIONS, WEAPON_TYPES } from '../config.js';
const Phaser = window.Phaser;

export class WeaponMount {
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

export class ProjectileSystem {
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
