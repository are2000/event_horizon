import { ENEMY_DB } from '../data/ships.js';

export class EnemyAI {
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
