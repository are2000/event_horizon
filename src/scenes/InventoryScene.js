import { t, currentLang } from '../data/localization.js';
import { getEquipment } from '../data/equipment.js';
const Phaser = window.Phaser;

export class InventoryScene extends Phaser.Scene {
    constructor() {
        super('InventoryScene');
    }

    init(data) {
        this.inventorySystem = data.inventorySystem;
        this.shipSystem = data.shipSystem;
        this.sectorId = data.sectorId || 1;
        this.fromMenu = data.fromMenu || false;
    }

    create() {
        const { width, height } = this.cameras.main;
        this.selectedIndex = null;
        this.secondSelected = null;

        // Background dim
        const bg = this.add.rectangle(width/2, height/2, width, height, 0x02020a, 0.92);
        bg.setInteractive();
        bg.on('pointerdown', (pointer, localX, localY, event) => {
            // Close if click outside? For now ignore
            event.stopPropagation();
        });

        // Title
        this.add.text(width/2, 50, t('inventory'), {
            fontSize: '24px',
            color: '#00ffff',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Ship summary top
        this.createShipSummary(width);

        // Grid
        this.createGrid(width, height);

        // Equipment list bottom
        this.createEquipmentList(width, height);

        // Buttons
        this.createButtons(width, height);

        // Close button
        const closeBtn = this.add.circle(width - 40, 50, 20, 0x331111, 0.8);
        closeBtn.setStrokeStyle(2, 0xff4444, 0.8);
        closeBtn.setInteractive({ useHandCursor: true });
        const closeTxt = this.add.text(width - 40, 50, '✕', { fontSize: '18px', color: '#ff4444' }).setOrigin(0.5);
        closeBtn.on('pointerdown', () => this.closeInventory(false));

        // Stats preview
        this.statsPreview = this.add.text(width/2, height - 120, '', {
            fontSize: '11px',
            color: '#aaccff',
            fontFamily: 'monospace',
            align: 'center',
            backgroundColor: '#112233aa',
            padding: { x: 10, y: 6 }
        }).setOrigin(0.5);

        this.updateGrid();
        this.updateShipSummary();
    }

    createShipSummary(width) {
        const y = 90;
        const container = this.add.container(width/2, y);
        const bg = this.add.rectangle(0, 0, width - 30, 50, 0x112233, 0.6);
        bg.setStrokeStyle(1, 0x00ffff, 0.2);
        container.add(bg);

        this.summaryText = this.add.text(0, 0, '', {
            fontSize: '10px',
            color: '#ffffff',
            fontFamily: 'monospace',
            align: 'center'
        }).setOrigin(0.5);
        container.add(this.summaryText);
    }

    updateShipSummary() {
        if (!this.shipSystem) {
            this.summaryText.setText('No ship data');
            return;
        }
        const s = this.shipSystem;
        const left = s.equipped.left ? s.equipped.left.id : 'empty';
        const right = s.equipped.right ? s.equipped.right.id : 'empty';
        const rear = s.equipped.rear ? s.equipped.rear.id : 'empty';
        const text = `${t('weight')}: ${s.currentWeight}/${s.maxWeightEffective} | ${t('power')}: ${s.currentPower}/${s.maxPowerEffective} | ${t('heat')}: ${Math.floor(s.currentHeat)}/${s.maxHeat}\nL:${left} R:${right} Rear:${rear}`;
        this.summaryText.setText(text);
    }

    createGrid(width, height) {
        const gridW = 5, gridH = 6;
        const cellSize = 48;
        const gridPixelW = gridW * cellSize;
        const gridPixelH = gridH * cellSize;
        const startX = (width - gridPixelW) / 2;
        const startY = 130;

        this.gridStartX = startX;
        this.gridStartY = startY;
        this.cellSize = cellSize;

        // Grid background
        const gridBg = this.add.rectangle(width/2, startY + gridPixelH/2, gridPixelW + 10, gridPixelH + 10, 0x0a0a1a, 0.8);
        gridBg.setStrokeStyle(2, 0x334455, 0.5);

        this.gridCells = [];
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                const cellX = startX + x * cellSize + cellSize/2;
                const cellY = startY + y * cellSize + cellSize/2;
                const cellBg = this.add.rectangle(cellX, cellY, cellSize - 4, cellSize - 4, 0x1a1a2a, 0.6);
                cellBg.setStrokeStyle(1, 0x334455, 0.3);
                this.gridCells.push({ x, y, bg: cellBg, worldX: cellX, worldY: cellY });
            }
        }

        // Items will be rendered as sprites in cells
        this.itemSprites = [];
    }

    updateGrid() {
        // Clear previous
        this.itemSprites.forEach(s => s.destroy());
        this.itemSprites = [];

        if (!this.inventorySystem) return;

        const items = this.inventorySystem.getItems();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const { x, y, equipment, count } = item;
            const worldX = this.gridStartX + x * this.cellSize + this.cellSize/2;
            const worldY = this.gridStartY + y * this.cellSize + this.cellSize/2 + (equipment.cells - 1) * this.cellSize/2;

            const container = this.add.container(worldX, worldY);
            
            // Cell highlight based on selection
            const isSelected = this.selectedIndex === i;
            const isSecond = this.secondSelected === i;
            const bgColor = isSelected ? 0x00ffff : isSecond ? 0xffff00 : 0x334455;
            const bgAlpha = isSelected || isSecond ? 0.4 : 0.2;

            // Equipment visual
            let icon;
            if (this.textures.exists(equipment.icon)) {
                icon = this.add.sprite(0, 0, equipment.icon);
                icon.setScale(0.5);
            } else {
                // Color based on type
                const colors = {
                    laser: 0x00ffff,
                    cannon: 0xffaa00,
                    plasma: 0xff00ff,
                    missile: 0x66ff66,
                    reactor: 0x00aaff,
                    engine: 0xaaaaff,
                    shield: 0x4444ff,
                    cooler: 0x88ffff,
                    armor: 0xaaaaaa
                };
                const col = colors[equipment.weaponType || equipment.category] || 0xffffff;
                icon = this.add.circle(0, 0, 16, col, 0.8);
                icon.setStrokeStyle(2, 0xffffff, 0.6);
            }

            // Tier badge
            const tierBadge = this.add.circle(14, -14, 8, 0x000000, 0.7);
            tierBadge.setStrokeStyle(1, 0xffffff, 0.5);
            const tierText = this.add.text(14, -14, `${equipment.tier}`, { fontSize: '10px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5);

            // Count if >1
            let countText = null;
            if (count > 1) {
                countText = this.add.text(-14, 14, `x${count}`, { fontSize: '10px', color: '#ffcc00', backgroundColor: '#000000aa', fontFamily: 'monospace' }).setOrigin(0.5);
            }

            // Cells indicator (height)
            if (equipment.cells > 1) {
                const heightBar = this.add.rectangle(-18, 0, 4, equipment.cells * this.cellSize - 8, 0x00ffff, 0.3);
            }

            container.add([icon, tierBadge, tierText]);
            if (countText) container.add(countText);

            // Interactive
            const hitArea = this.add.rectangle(0, 0, this.cellSize - 4, equipment.cells * this.cellSize - 4, 0x000000, 0);
            hitArea.setInteractive({ useHandCursor: true });
            container.add(hitArea);
            container.setSize(this.cellSize, equipment.cells * this.cellSize);
            container.setDepth(1);

            hitArea.on('pointerdown', () => {
                this.onItemSelected(i);
            });

            // Selection highlight
            if (isSelected || isSecond) {
                const highlight = this.add.rectangle(0, 0, this.cellSize - 2, equipment.cells * this.cellSize - 2, 0x000000, 0);
                highlight.setStrokeStyle(3, bgColor, 0.9);
                container.add(highlight);
            }

            this.itemSprites.push(container);
        }

        // Update stats preview if selected
        if (this.selectedIndex !== null) {
            const item = items[this.selectedIndex];
            if (item) {
                const eq = item.equipment;
                const preview = `${eq.id} | ${t('weight')}:${eq.weight} ${t('power')}:${eq.power} ${t('heat')}:${eq.heat}\nDMG:${eq.stats.damage || '-'} RNG:${eq.stats.range || '-'} FR:${eq.stats.fireRate || '-'}`;
                this.statsPreview.setText(preview);
            }
        } else {
            this.statsPreview.setText(currentLang === 'ar' ? 'اختر عنصرين متطابقين للدمج\nاضغط على عنصر ثم زر تركيب' : 'Select 2 identical to merge\nTap item then Equip button');
        }
    }

    onItemSelected(index) {
        if (this.selectedIndex === null) {
            this.selectedIndex = index;
        } else if (this.selectedIndex === index) {
            this.selectedIndex = null;
            this.secondSelected = null;
        } else if (this.secondSelected === null) {
            this.secondSelected = index;
            // Try merge automatically if same id
            const items = this.inventorySystem.getItems();
            const a = items[this.selectedIndex];
            const b = items[this.secondSelected];
            if (a && b && a.equipment.id === b.equipment.id) {
                this.tryMerge();
            }
        } else {
            this.selectedIndex = index;
            this.secondSelected = null;
        }
        this.updateGrid();
    }

    createEquipmentList(width, height) {
        // Bottom area for mount selection - simplified
        const y = height - 200;
        const mounts = ['left', 'right', 'rear', 'reactor', 'engine', 'shield', 'cooler', 'armor'];
        const mountLabels = {
            left: currentLang === 'ar' ? 'يسار' : 'LEFT',
            right: currentLang === 'ar' ? 'يمين' : 'RIGHT',
            rear: currentLang === 'ar' ? 'خلف' : 'REAR',
            reactor: 'REACTOR',
            engine: 'ENGINE',
            shield: 'SHIELD',
            cooler: 'COOLER',
            armor: 'ARMOR'
        };

        this.mountButtons = [];
        let x = 20;
        for (const mount of mounts) {
            const btn = this.add.container(x, y);
            const bg = this.add.rectangle(0, 0, 55, 28, 0x112233, 0.8);
            bg.setStrokeStyle(1, 0x556677, 0.4);
            bg.setInteractive({ useHandCursor: true });
            const label = this.add.text(0, 0, mountLabels[mount], { fontSize: '8px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5);
            btn.add([bg, label]);
            btn.setSize(55, 28);

            bg.on('pointerdown', () => {
                this.selectedMount = mount;
                this.updateMountButtons();
            });

            this.mountButtons.push({ mount, bg });
            this.add.existing(btn);
            x += 60;
            if (x > width - 60) {
                x = 20;
                // Next row would go out of view, so limit to first row for now
                if (mount === 'rear') break;
            }
        }
        this.selectedMount = 'left';
        this.updateMountButtons();
    }

    updateMountButtons() {
        for (const b of this.mountButtons) {
            if (b.mount === this.selectedMount) {
                b.bg.setFillStyle(0x00ffff, 0.3);
                b.bg.setStrokeStyle(2, 0x00ffff, 1);
            } else {
                b.bg.setFillStyle(0x112233, 0.8);
                b.bg.setStrokeStyle(1, 0x556677, 0.4);
            }
        }
    }

    createButtons(width, height) {
        const btnY = height - 70;
        
        // Merge button
        const mergeBtn = this.add.container(width*0.25, btnY);
        const mergeBg = this.add.rectangle(0, 0, 110, 44, 0x332200, 0.8);
        mergeBg.setStrokeStyle(2, 0xffcc00, 0.6);
        mergeBg.setInteractive({ useHandCursor: true });
        const mergeTxt = this.add.text(0, 0, t('merge'), { fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        mergeBtn.add([mergeBg, mergeTxt]);
        mergeBg.on('pointerdown', () => this.tryMerge());

        // Equip button
        const equipBtn = this.add.container(width*0.5, btnY);
        const equipBg = this.add.rectangle(0, 0, 110, 44, 0x003322, 0.8);
        equipBg.setStrokeStyle(2, 0x00ff88, 0.6);
        equipBg.setInteractive({ useHandCursor: true });
        const equipTxt = this.add.text(0, 0, t('equip'), { fontSize: '14px', color: '#00ff88', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        equipBtn.add([equipBg, equipTxt]);
        equipBg.on('pointerdown', () => this.tryEquip());

        // Unequip button
        const unequipBtn = this.add.container(width*0.75, btnY);
        const unequipBg = this.add.rectangle(0, 0, 110, 44, 0x330000, 0.8);
        unequipBg.setStrokeStyle(2, 0xff4444, 0.6);
        unequipBg.setInteractive({ useHandCursor: true });
        const unequipTxt = this.add.text(0, 0, t('unequip'), { fontSize: '12px', color: '#ff8888', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5);
        unequipBtn.add([unequipBg, unequipTxt]);
        unequipBg.on('pointerdown', () => this.tryUnequip());

        // Close
        const closeBtn = this.add.container(width/2, height - 25);
        const closeBg = this.add.rectangle(0, 0, 200, 36, 0x112233, 0.8);
        closeBg.setStrokeStyle(1, 0x00ffff, 0.4);
        closeBg.setInteractive({ useHandCursor: true });
        const closeTxt = this.add.text(0, 0, currentLang === 'ar' ? 'إغلاق وحفظ' : 'CLOSE & SAVE', { fontSize: '12px', color: '#aaccff', fontFamily: 'monospace' }).setOrigin(0.5);
        closeBtn.add([closeBg, closeTxt]);
        closeBg.on('pointerdown', () => this.closeInventory(true));
    }

    tryMerge() {
        if (this.selectedIndex === null || this.secondSelected === null) {
            this.showMessage(currentLang === 'ar' ? 'اختر عنصرين' : 'Select 2 items');
            return;
        }
        const result = this.inventorySystem.tryMerge(this.selectedIndex, this.secondSelected);
        if (result) {
            this.showMessage(`${currentLang === 'ar' ? 'تم الدمج!' : 'Merged!'} ${result.id}`, 0x00ff88);
            this.selectedIndex = null;
            this.secondSelected = null;
            this.updateGrid();
            this.updateShipSummary();
        } else {
            this.showMessage(currentLang === 'ar' ? 'لا يمكن الدمج' : 'Cannot merge', 0xff4444);
        }
    }

    tryEquip() {
        if (this.selectedIndex === null) {
            this.showMessage(currentLang === 'ar' ? 'اختر عنصراً' : 'Select item');
            return;
        }
        if (!this.shipSystem) {
            this.showMessage('No ship', 0xff4444);
            return;
        }
        const items = this.inventorySystem.getItems();
        const item = items[this.selectedIndex];
        if (!item) return;

        const eq = item.equipment;
        const mount = this.selectedMount;

        const check = this.shipSystem.canEquip(eq, mount);
        if (!check.ok) {
            this.showMessage(check.reason, 0xff4444);
            return;
        }

        // If mount occupied, move old to inventory
        let old = null;
        if (mount === 'left' || mount === 'right' || mount === 'rear') {
            old = this.shipSystem.equipped[mount];
            if (old) {
                const added = this.inventorySystem.addItem(old.id);
                if (!added) {
                    this.showMessage('Inventory full', 0xff4444);
                    return;
                }
            }
        }

        this.shipSystem.equip(eq, mount);
        // Remove from inventory
        this.inventorySystem.removeItem(this.selectedIndex);
        if (old) {
            // Old already added
        }

        this.selectedIndex = null;
        this.updateGrid();
        this.updateShipSummary();
        this.showMessage(`${t('equip')}: ${eq.id} -> ${mount}`, 0x00ff88);
    }

    tryUnequip() {
        if (!this.shipSystem) return;
        const mount = this.selectedMount;
        let old = null;
        if (mount === 'left' || mount === 'right' || mount === 'rear') {
            old = this.shipSystem.equipped[mount];
            if (old) {
                const added = this.inventorySystem.addItem(old.id);
                if (added) {
                    this.shipSystem.unequip(mount);
                    this.showMessage(`${t('unequip')}: ${old.id}`, 0xffaa00);
                } else {
                    this.showMessage('Inventory full', 0xff4444);
                }
            } else {
                this.showMessage('Empty slot', 0xaaaaaa);
            }
        } else {
            // Utility
            const list = this.shipSystem.equipped[mount];
            if (list && list.length > 0) {
                old = list[0];
                const added = this.inventorySystem.addItem(old.id);
                if (added) {
                    this.shipSystem.unequip(mount, 0);
                    this.showMessage(`${t('unequip')}: ${old.id}`, 0xffaa00);
                } else {
                    this.showMessage('Inventory full', 0xff4444);
                }
            }
        }
        this.updateGrid();
        this.updateShipSummary();
    }

    showMessage(text, color = 0xffffff) {
        if (this.messageText) this.messageText.destroy();
        const { width, height } = this.cameras.main;
        this.messageText = this.add.text(width/2, height - 100, text, {
            fontSize: '12px',
            color: `#${color.toString(16).padStart(6,'0')}`,
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 4 },
            fontFamily: 'monospace'
        }).setOrigin(0.5);
        this.time.delayedCall(2000, () => {
            if (this.messageText) {
                this.messageText.destroy();
                this.messageText = null;
            }
        });
    }

    closeInventory(updated = true) {
        if (this.fromMenu) {
            this.scene.start('MainMenuScene');
        } else {
            this.scene.stop();
            const gameScene = this.scene.get('GameScene');
            if (gameScene) {
                gameScene.events.emit('resumeInventory', { updated });
            }
        }
    }
}
