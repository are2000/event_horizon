import { t, currentLang } from '../data/localization.js';
const Phaser = window.Phaser;

export class VictoryScene extends Phaser.Scene {
    constructor() {
        super('VictoryScene');
    }

    init(data) {
        this.scrap = data.scrap || 0;
        this.sectorId = data.sectorId || 1;
    }

    create() {
        const { width, height } = this.cameras.main;

        // Background - bright cyan / genesis
        this.add.rectangle(width/2, height/2, width, height, 0x020a1a, 1);

        // Stars bright
        for (let i = 0; i < 120; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const c = this.add.circle(x, y, Math.random()*2+0.5, 0x88ffff, 0.6 + Math.random()*0.4);
            this.tweens.add({ targets: c, alpha: 0.2, duration: 1000 + Math.random()*2000, yoyo: true, repeat: -1 });
        }

        // Genesis core visual - big bright
        const coreY = height * 0.35;
        const glow1 = this.add.circle(width/2, coreY, 120, 0x00ffff, 0.15);
        const glow2 = this.add.circle(width/2, coreY, 80, 0x00ffff, 0.25);
        const glow3 = this.add.circle(width/2, coreY, 45, 0xffffff, 0.9);
        glow3.setStrokeStyle(4, 0x00ffff, 1);

        // Rotating rings
        for (let i = 0; i < 3; i++) {
            const ring = this.add.circle(width/2, coreY, 55 + i*18, 0x000000, 0);
            ring.setStrokeStyle(1, 0x00ffff, 0.3 - i*0.08);
            this.tweens.add({ targets: ring, rotation: Math.PI*2 * (i%2?1:-1), duration: 6000 + i*2000, repeat: -1 });
        }

        this.tweens.add({ targets: glow1, scale: 1.2, alpha: 0.25, duration: 2000, yoyo: true, repeat: -1 });
        this.tweens.add({ targets: glow2, scale: 1.15, alpha: 0.4, duration: 1500, yoyo: true, repeat: -1 });

        // Title
        this.add.text(width/2, coreY + 90, t('victory'), {
            fontSize: '30px',
            color: '#00ffff',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            stroke: '#0080ff',
            strokeThickness: 2
        }).setOrigin(0.5).setShadow(0, 0, '#00ffff', 20, true, true);

        // Lore
        const lore = currentLang === 'ar'
            ? 'وصلت النواة إلى عين الشذوذ\nتمت زراعة الشفرة... مجرة جديدة تولد\nلكن التآكل لم ينته... مجرة فاسدة تنتظرك'
            : 'The core reached the Eye of Anomaly\nCode planted... a new galaxy is born\nBut decay never ends... Corrupted Galaxy awaits';

        this.add.text(width/2, coreY + 135, lore, {
            fontSize: '13px',
            color: '#aaddff',
            align: 'center',
            lineSpacing: 6
        }).setOrigin(0.5);

        // Stats
        const statsY = height * 0.62;
        const statsBg = this.add.rectangle(width/2, statsY, width - 40, 100, 0x112233, 0.5);
        statsBg.setStrokeStyle(1, 0x00ffff, 0.3);

        this.add.text(width/2, statsY - 25, `${t('sector')}: ${this.sectorId} CLEARED`, { fontSize: '14px', color: '#00ffaa', fontFamily: 'monospace' }).setOrigin(0.5);
        this.add.text(width/2, statsY, `${t('scrap')}: ${this.scrap}`, { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace' }).setOrigin(0.5);
        this.add.text(width/2, statsY + 25, currentLang === 'ar' ? 'تم فتح New Game+ (قريباً)' : 'New Game+ Unlocked (Soon)', { fontSize: '12px', color: '#ff88ff', fontFamily: 'monospace' }).setOrigin(0.5);

        // Buttons
        const btnY = height * 0.80;

        const continueBtn = this.add.container(width/2, btnY);
        const contBg = this.add.rectangle(0, 0, 240, 50, 0x002233, 0.9);
        contBg.setStrokeStyle(2, 0x00ffff, 0.8);
        contBg.setInteractive({ useHandCursor: true });
        const contTxt = this.add.text(0, 0, currentLang === 'ar' ? 'المتابعة للقطاع التالي' : 'NEXT SECTOR', { fontSize: '16px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        continueBtn.add([contBg, contTxt]);

        contBg.on('pointerdown', () => {
            const nextSector = this.sectorId + 1;
            if (nextSector <= 5) {
                this.scene.start('GameScene', { sectorId: nextSector, isContinue: false });
            } else {
                // Loop or New Game+
                this.scene.start('MainMenuScene');
            }
        });

        const menuBtn = this.add.container(width/2, btnY + 65);
        const menuBg = this.add.rectangle(0, 0, 240, 44, 0x112233, 0.8);
        menuBg.setStrokeStyle(1, 0x88aaff, 0.4);
        menuBg.setInteractive({ useHandCursor: true });
        const menuTxt = this.add.text(0, 0, currentLang === 'ar' ? 'القائمة الرئيسية' : 'MAIN MENU', { fontSize: '14px', color: '#88aaff', fontFamily: 'monospace' }).setOrigin(0.5);
        menuBtn.add([menuBg, menuTxt]);

        menuBg.on('pointerdown', () => {
            this.scene.start('MainMenuScene');
        });

        this.cameras.main.fadeIn(800, 2, 10, 26);
    }
}
