import { GameScene } from './GameScene.js';

// BossScene is a specialized GameScene for sector 5
// For Vertical Slice, boss is integrated in GameScene sector 5
// This scene exists to satisfy architecture and can be used for dedicated boss arena

export class BossScene extends GameScene {
    constructor() {
        super('BossScene');
    }

    init(data) {
        super.init({ sectorId: 5, isContinue: false, ...data });
        this.isBossScene = true;
    }

    create() {
        super.create();
        // Additional boss setup
        this.showMessage('VOID BEHEMOTH ARENA', 0xff00ff, 3000);
        // Force boss spawn after short delay
        this.time.delayedCall(2000, () => {
            if (!this.sectorSystem.bossSpawned) {
                this.spawnBoss();
            }
        });
    }
}
