import { t, currentLang } from '../data/localization.js';
import { SaveSystem } from '../systems/save-system.js';
const Phaser = window.Phaser;

export class GameOverScene extends Phaser.Scene {
    constructor() {
        super('GameOverScene');
    }

    init(data) {
        this.scrap = data.scrap || 0;
        this.sectorId = data.sectorId || 1;
        this.corrosion = data.corrosion || 100;
    }

    create() {
        const { width, height } = this.cameras.main;
        this.saveSystem = new SaveSystem();

        // Background - dark red
        this.add.rectangle(width/2, height/2, width, height, 0x110202, 1);

        // Stars dim
        for (let i = 0; i < 80; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            this.add.circle(x, y, Math.random()*1.5, 0x661111, 0.4);
        }

        // Core collapse visual
        const coreY = height * 0.32;
        const glow = this.add.circle(width/2, coreY, 70, 0xff0000, 0.2);
        const core = this.add.circle(width/2, coreY, 30, 0x440000, 0.8);
        core.setStrokeStyle(3, 0xff0000, 0.8);

        // Cracked effect
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const line = this.add.line(width/2, coreY, 0, 0, Math.cos(angle)*40, Math.sin(angle)*40, 0xff0000, 0.6);
            line.setLineWidth(2);
        }

        // Title
        this.add.text(width/2, coreY + 80, t('game_over'), {
            fontSize: '32px',
            color: '#ff4444',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            stroke: '#880000',
            strokeThickness: 2
        }).setOrigin(0.5).setShadow(0, 0, '#ff0000', 15, true, true);

        // Lore
        const lore = currentLang === 'ar' 
            ? 'انهارت النواة... تآكلت آخر شفرة جينية\nلكن بعض البيانات بقيت للمحاولة القادمة'
            : 'The core collapsed... the last genetic code corroded\nBut some data remains for next attempt';
        
        this.add.text(width/2, coreY + 120, lore, {
            fontSize: '13px',
            color: '#886666',
            align: 'center',
            lineSpacing: 5
        }).setOrigin(0.5);

        // Stats
        const statsY = height * 0.58;
        const statsBg = this.add.rectangle(width/2, statsY, width - 40, 120, 0x221111, 0.6);
        statsBg.setStrokeStyle(1, 0x661111, 0.5);

        this.add.text(width/2, statsY - 35, `${t('sector')}: ${this.sectorId}`, { fontSize: '14px', color: '#ffaa88', fontFamily: 'monospace' }).setOrigin(0.5);
        this.add.text(width/2, statsY - 10, `${t('scrap')}: ${this.scrap}`, { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace' }).setOrigin(0.5);
        this.add.text(width/2, statsY + 15, `${t('corrosion')}: ${Math.floor(this.corrosion)}%`, { fontSize: '14px', color: '#ff6600', fontFamily: 'monospace' }).setOrigin(0.5);

        // Permanent upgrade hint
        this.add.text(width/2, statsY + 45, currentLang === 'ar' ? 'ستحتفظ ببعض الترقيات الدائمة' : 'You keep some permanent upgrades', {
            fontSize: '11px',
            color: '#6688aa',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        // Buttons
        const btnY = height * 0.78;
        
        // Try again
        const retryBtn = this.add.container(width/2, btnY);
        const retryBg = this.add.rectangle(0, 0, 220, 50, 0x331111, 0.9);
        retryBg.setStrokeStyle(2, 0xff4444, 0.7);
        retryBg.setInteractive({ useHandCursor: true });
        const retryTxt = this.add.text(0, 0, t('try_again'), { fontSize: '18px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        retryBtn.add([retryBg, retryTxt]);

        retryBg.on('pointerdown', () => {
            // Save permanent progress
            const existing = this.saveSystem.load();
            if (existing) {
                // Keep permanent upgrades, clear sector
                existing.sectorId = 1;
                existing.ship.hull = existing.ship.maxHull || 100;
                existing.ship.corrosion = 0;
                // Add bonus scrap as permanent?
                this.saveSystem.save(existing);
            }
            this.scene.start('MainMenuScene');
        });

        // Main menu
        const menuBtn = this.add.container(width/2, btnY + 65);
        const menuBg = this.add.rectangle(0, 0, 220, 44, 0x112233, 0.8);
        menuBg.setStrokeStyle(1, 0x00ffff, 0.4);
        menuBg.setInteractive({ useHandCursor: true });
        const menuTxt = this.add.text(0, 0, currentLang === 'ar' ? 'القائمة الرئيسية' : 'MAIN MENU', { fontSize: '14px', color: '#88aaff', fontFamily: 'monospace' }).setOrigin(0.5);
        menuBtn.add([menuBg, menuTxt]);

        menuBg.on('pointerdown', () => {
            this.scene.start('MainMenuScene');
        });

        // Clear save if player wants? Keep for now

        // Fade in
        this.cameras.main.fadeIn(600, 17, 2, 2);
    }
}
