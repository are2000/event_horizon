import { t, currentLang } from '../data/localization.js';
const Phaser = window.Phaser;

export class RepairScene extends Phaser.Scene {
    constructor() {
        super('RepairScene');
    }

    init(data) {
        this.shipSystem = data.shipSystem;
        this.inventorySystem = data.inventorySystem;
    }

    create() {
        const { width, height } = this.cameras.main;

        // Background
        this.add.rectangle(width/2, height/2, width, height, 0x001122, 0.93);

        this.add.text(width/2, 50, t('repair'), {
            fontSize: '22px',
            color: '#00ff88',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Ship status
        const statusY = 100;
        this.hullText = this.add.text(width/2, statusY, '', { fontSize: '14px', color: '#ffffff', fontFamily: 'monospace', align: 'center' }).setOrigin(0.5);
        this.corrText = this.add.text(width/2, statusY + 24, '', { fontSize: '14px', color: '#ffaa00', fontFamily: 'monospace', align: 'center' }).setOrigin(0.5);
        this.scrapText = this.add.text(width/2, statusY + 48, '', { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace', align: 'center' }).setOrigin(0.5);

        this.updateStatus();

        // Repair options
        this.createRepairOptions(width, height);

        // Close button
        const closeBtn = this.add.container(width/2, height - 50);
        const closeBg = this.add.rectangle(0, 0, 200, 44, 0x112233, 0.9);
        closeBg.setStrokeStyle(2, 0x00ffff, 0.5);
        closeBg.setInteractive({ useHandCursor: true });
        const closeTxt = this.add.text(0, 0, currentLang === 'ar' ? 'إغلاق' : 'CLOSE', { fontSize: '14px', color: '#00ffff', fontFamily: 'monospace' }).setOrigin(0.5);
        closeBtn.add([closeBg, closeTxt]);
        closeBg.on('pointerdown', () => this.closeRepair());

        // Message
        this.messageText = this.add.text(width/2, height - 100, '', {
            fontSize: '12px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 4 },
            fontFamily: 'monospace'
        }).setOrigin(0.5).setVisible(false);
    }

    updateStatus() {
        const s = this.shipSystem;
        this.hullText.setText(`${t('hull')}: ${Math.floor(s.hull)}/${s.maxHullEffective} (${Math.floor(s.hull/s.maxHullEffective*100)}%)`);
        this.corrText.setText(`${t('corrosion')}: ${Math.floor(s.corrosion)}% - ${s.getCorrosionState()}`);
        this.scrapText.setText(`${t('scrap')}: ${s.scrap}`);
    }

    createRepairOptions(width, height) {
        const startY = 200;
        const options = [
            { id: 'hull_25', label: currentLang === 'ar' ? 'إصلاح الهيكل 25%' : 'Repair Hull 25%', cost: 30, action: () => this.repairHull(0.25) },
            { id: 'hull_full', label: currentLang === 'ar' ? 'إصلاح كامل' : 'Full Repair', cost: 100, action: () => this.repairHull(1) },
            { id: 'corr_20', label: currentLang === 'ar' ? 'إزالة تآكل 20%' : 'Remove Corrosion 20%', cost: 40, action: () => this.repairCorrosion(20) },
            { id: 'corr_full', label: currentLang === 'ar' ? 'تطهير تآكل كامل' : 'Full Corrosion Cleanse', cost: 150, action: () => this.repairCorrosion(100) },
            { id: 'upgrade_hull', label: currentLang === 'ar' ? 'ترقية هيكل دائمة +20' : 'Perma Hull +20', cost: 200, action: () => this.permaUpgrade('maxHull') },
            { id: 'upgrade_cooling', label: currentLang === 'ar' ? 'ترقية تبريد +10' : 'Cooling +10', cost: 180, action: () => this.permaUpgrade('cooling') },
        ];

        this.optionButtons = [];
        options.forEach((opt, i) => {
            const y = startY + i * 62;
            const container = this.add.container(width/2, y);
            const bg = this.add.rectangle(0, 0, width - 40, 52, 0x112233, 0.8);
            bg.setStrokeStyle(1, 0x00ff88, 0.4);
            bg.setInteractive({ useHandCursor: true });

            const label = this.add.text(- (width - 60)/2 + 10, 0, opt.label, { fontSize: '13px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0, 0.5);
            const cost = this.add.text((width - 60)/2 - 10, 0, `◈ ${opt.cost}`, { fontSize: '13px', color: '#ffcc00', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(1, 0.5);

            container.add([bg, label, cost]);

            bg.on('pointerover', () => {
                bg.setFillStyle(0x1a3344, 0.9);
                bg.setStrokeStyle(2, 0x00ff88, 0.8);
            });
            bg.on('pointerout', () => {
                bg.setFillStyle(0x112233, 0.8);
                bg.setStrokeStyle(1, 0x00ff88, 0.4);
            });
            bg.on('pointerdown', () => {
                if (this.shipSystem.scrap >= opt.cost) {
                    opt.action();
                    this.shipSystem.scrap -= opt.cost;
                    this.updateStatus();
                    this.showMessage(currentLang === 'ar' ? 'تم!' : 'Done!', 0x00ff88);
                    if (this.cache.audio.exists('repair')) this.sound.play('repair', { volume: 0.6 });
                } else {
                    this.showMessage(currentLang === 'ar' ? 'خردة غير كافية' : 'Not enough scrap', 0xff4444);
                }
            });

            this.optionButtons.push(container);
        });
    }

    repairHull(percent) {
        const amount = this.shipSystem.maxHullEffective * percent;
        this.shipSystem.repairHull(amount);
    }

    repairCorrosion(percent) {
        this.shipSystem.repairCorrosion(percent);
    }

    permaUpgrade(type) {
        if (!this.shipSystem.permanentUpgrades) this.shipSystem.permanentUpgrades = {};
        if (type === 'maxHull') {
            this.shipSystem.permanentUpgrades.maxHull = (this.shipSystem.permanentUpgrades.maxHull || 0) + 20;
        } else if (type === 'cooling') {
            this.shipSystem.permanentUpgrades.cooling = (this.shipSystem.permanentUpgrades.cooling || 0) + 10;
        }
        this.shipSystem.calculateStats();
    }

    showMessage(text, color) {
        this.messageText.setText(text);
        this.messageText.setColor(`#${color.toString(16).padStart(6,'0')}`);
        this.messageText.setVisible(true);
        this.time.delayedCall(2000, () => this.messageText.setVisible(false));
    }

    closeRepair() {
        this.scene.stop();
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
            gameScene.events.emit('resumeRepair');
        }
    }
}
