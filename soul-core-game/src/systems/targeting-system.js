import { TARGET_PRIORITIES } from '../config.js';

export class TargetingSystem {
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
