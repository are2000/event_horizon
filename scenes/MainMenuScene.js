import { t, currentLang, setLanguage, getSectorName } from '../data/localization.js';
import { SaveSystem } from '../systems/save-system.js';

export class MainMenuScene extends Phaser.Scene {
    constructor() {
        super('MainMenuScene');
    }

    create() {
        const { width, height } = this.cameras.main;
        this.saveSystem = new SaveSystem();
        const saveData = this.saveSystem.load();

        // Background - animated starfield
        this.createStarfield();

        // Soul Core logo / title
        this.createTitle(width, height);

        // Menu buttons
        this.createMenu(width, height, saveData);

        // Language toggle
        this.createLanguageToggle();

        // Version / credits
        this.add.text(width/2, height - 30, 'Soul Core: The Great Decay - Vertical Slice v0.1', {
            fontSize: '12px',
            color: '#556677',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        // Input
        this.input.on('pointerdown', (pointer) => {
            // For mobile, ensure audio unlock
            if (this.sound.locked) {
                this.sound.unlock();
            }
        });

        // Animate core
        this.tweens.add({
            targets: this.coreGlow,
            scale: 1.3,
            alpha: 0.6,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    createStarfield() {
        const { width, height } = this.cameras.main;
        // Gradient background
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x02020a, 0x02020a, 0x0a0a2a, 0x0a0a2a, 1);
        bg.fillRect(0, 0, width, height);

        // Stars
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 2 + 0.5;
            const star = this.add.circle(x, y, size, 0xffffff, 0.3 + Math.random()*0.7);
            // Twinkle
            this.tweens.add({
                targets: star,
                alpha: 0.1,
                duration: 1000 + Math.random()*2000,
                yoyo: true,
                repeat: -1
            });
        }

        // Nebula glow
        const nebula = this.add.circle(width*0.3, height*0.3, 300, 0x4400aa, 0.08);
        const nebula2 = this.add.circle(width*0.7, height*0.7, 400, 0x0088aa, 0.06);
    }

    createTitle(width, height) {
        const centerY = height * 0.28;

        // Core visual
        this.coreGlow = this.add.circle(width/2, centerY, 60, 0x00ffff, 0.25);
        this.coreOuter = this.add.circle(width/2, centerY, 40, 0x0080ff, 0.4);
        this.coreOuter.setStrokeStyle(2, 0x00ffff, 0.8);
        this.coreInner = this.add.circle(width/2, centerY, 20, 0xffffff, 0.9);
        this.coreInner.setStrokeStyle(3, 0x00ffff, 1);

        // Rotating rings
        const ring1 = this.add.circle(width/2, centerY, 55, 0x000000, 0);
        ring1.setStrokeStyle(1, 0x00ffff, 0.3);
        this.tweens.add({ targets: ring1, rotation: Math.PI*2, duration: 8000, repeat: -1 });

        // Title text
        const title = this.add.text(width/2, centerY + 90, 'SOUL CORE', {
            fontSize: '42px',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            color: '#00ffff',
            stroke: '#0080ff',
            strokeThickness: 2
        }).setOrigin(0.5);
        title.setShadow(0, 0, '#00ffff', 20, true, true);

        const subtitle = this.add.text(width/2, centerY + 125, 'THE GREAT DECAY', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#88aaff',
            letterSpacing: 4
        }).setOrigin(0.5);

        // Lore snippet
        const lore = currentLang === 'ar' 
            ? 'آخر نواة روحية تحمل شفرة حضارة كاملة\nالمجرة تنهار... التوقف يعني الفناء'
            : 'Last Soul Core carrying the code of a civilization\nThe galaxy decays... Stopping means extinction';
        
        this.add.text(width/2, centerY + 165, lore, {
            fontSize: '13px',
            color: '#667799',
            align: 'center',
            lineSpacing: 4
        }).setOrigin(0.5);
    }

    createMenu(width, height, saveData) {
        const startY = height * 0.58;
        const buttonWidth = 260;
        const buttonHeight = 56;
        const spacing = 18;

        const buttons = [];

        // Play / Continue
        if (saveData && saveData.sectorId) {
            buttons.push({ key: 'continue', label: `${t('continue')} - ${getSectorName(saveData.sectorId)}`, action: () => this.startGame(saveData.sectorId, true) });
            buttons.push({ key: 'new', label: t('play') + ' (NEW)', action: () => this.startGame(1, false) });
        } else {
            buttons.push({ key: 'play', label: t('play'), action: () => this.startGame(1, false) });
        }

        // Inventory preview (if save)
        if (saveData) {
            buttons.push({ key: 'inventory', label: t('inventory'), action: () => this.scene.start('InventoryScene', { fromMenu: true }) });
        }

        // Settings placeholder
        // buttons.push({ key: 'settings', label: t('settings'), action: () => {} });

        buttons.forEach((btn, i) => {
            const y = startY + i * (buttonHeight + spacing);
            const container = this.add.container(width/2, y);
            
            const bg = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0x112233, 0.8);
            bg.setStrokeStyle(2, 0x00ffff, 0.6);
            bg.setInteractive({ useHandCursor: true });

            const text = this.add.text(0, 0, btn.label, {
                fontSize: '18px',
                fontFamily: 'monospace',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            container.add([bg, text]);

            // Hover
            bg.on('pointerover', () => {
                bg.setFillStyle(0x1a3344, 0.9);
                bg.setStrokeStyle(2, 0x00ffff, 1);
                text.setColor('#00ffff');
            });
            bg.on('pointerout', () => {
                bg.setFillStyle(0x112233, 0.8);
                bg.setStrokeStyle(2, 0x00ffff, 0.6);
                text.setColor('#ffffff');
            });
            bg.on('pointerdown', () => {
                bg.setFillStyle(0x00ffff, 0.3);
                this.cameras.main.flash(150, 0, 255, 255, false);
                this.time.delayedCall(150, btn.action);
            });

            // Entrance anim
            container.setScale(0);
            this.tweens.add({
                targets: container,
                scale: 1,
                duration: 400,
                delay: i * 100,
                ease: 'Back.easeOut'
            });
        });

        // Controls hint
        const hintY = startY + buttons.length * (buttonHeight + spacing) + 20;
        const hintText = currentLang === 'ar' 
            ? 'اسحب في الأسفل للتحرك • اضغط على العدو للاستهداف • تلقائي الإطلاق'
            : 'Drag at bottom to move • Tap enemy to lock • Auto fire';
        this.add.text(width/2, hintY, hintText, {
            fontSize: '11px',
            color: '#445566',
            align: 'center'
        }).setOrigin(0.5);
    }

    createLanguageToggle() {
        const { width } = this.cameras.main;
        const langBtn = this.add.container(width - 60, 50);
        const bg = this.add.circle(0, 0, 26, 0x112233, 0.8);
        bg.setStrokeStyle(2, 0x00ffff, 0.5);
        bg.setInteractive({ useHandCursor: true });
        const txt = this.add.text(0, 0, currentLang === 'ar' ? 'ع' : 'EN', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        langBtn.add([bg, txt]);

        bg.on('pointerdown', () => {
            const newLang = currentLang === 'ar' ? 'en' : 'ar';
            setLanguage(newLang);
            localStorage.setItem('soul_core_lang', newLang);
            this.scene.restart();
        });
    }

    startGame(sectorId, isContinue) {
        // Play sound
        if (this.cache.audio.exists('buy')) {
            this.sound.play('buy', { volume: 0.5 });
        }
        this.scene.start('GameScene', { sectorId, isContinue });
    }
}
