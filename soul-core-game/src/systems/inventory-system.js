import { getEquipment, getMergeResult } from '../data/equipment.js';

export class InventorySystem {
    constructor(width = 5, height = 6) {
        this.width = width;
        this.height = height;
        this.grid = Array(height).fill(null).map(() => Array(width).fill(null));
        this.items = []; // list of { equipment, x, y, count }
        this.scrap = 0;
    }

    // Try to place item, returns position or null
    findSpace(cells) {
        // cells = number of cells needed (vertical stacking)
        // For simplicity, we place in first available contiguous vertical space
        // small=1, medium=2, large=3+
        for (let y = 0; y <= this.height - cells; y++) {
            for (let x = 0; x < this.width; x++) {
                let free = true;
                for (let dy = 0; dy < cells; dy++) {
                    if (this.grid[y + dy][x] !== null) {
                        free = false;
                        break;
                    }
                }
                if (free) return { x, y };
            }
        }
        return null;
    }

    addItem(equipmentId, count = 1) {
        const eq = getEquipment(equipmentId);
        if (!eq) return false;

        // Check if same item already exists and stackable? Per design, similar pieces show in one card with quantity
        // We'll try to stack if same id and tier and category != weapon? Actually all stack but weapons count
        // For simplicity, allow stacking: if item exists with same id, increase count
        const existing = this.items.find(it => it.equipment.id === equipmentId);
        if (existing && eq.cells === 1) {
            existing.count += count;
            return true;
        }

        const pos = this.findSpace(eq.cells);
        if (!pos) return false; // no space

        // occupy grid
        for (let dy = 0; dy < eq.cells; dy++) {
            this.grid[pos.y + dy][pos.x] = equipmentId;
        }

        this.items.push({
            equipment: eq,
            x: pos.x,
            y: pos.y,
            count: count
        });
        return true;
    }

    removeItem(index) {
        const item = this.items[index];
        if (!item) return null;
        for (let dy = 0; dy < item.equipment.cells; dy++) {
            if (this.grid[item.y + dy] && this.grid[item.y + dy][item.x] !== undefined) {
                this.grid[item.y + dy][item.x] = null;
            }
        }
        this.items.splice(index, 1);
        return item;
    }

    // Merge two items of same type/tier
    tryMerge(indexA, indexB) {
        if (indexA === indexB) return null;
        const a = this.items[indexA];
        const b = this.items[indexB];
        if (!a || !b) return null;
        if (a.equipment.id !== b.equipment.id) return null;
        if (a.count < 1 || b.count < 1) return null;

        const result = getMergeResult(a.equipment.id, b.equipment.id);
        if (!result) return null;

        // Remove both
        // Remove higher index first
        const high = Math.max(indexA, indexB);
        const low = Math.min(indexA, indexB);
        this.removeItem(high);
        this.removeItem(low);

        // Add result
        const added = this.addItem(result.id, 1);
        if (!added) {
            // if no space, refund one? For now return to inventory first item
            this.addItem(a.equipment.id, 1);
            this.addItem(b.equipment.id, 1);
            return null;
        }

        return result;
    }

    getItems() {
        return this.items;
    }

    expandGrid(newWidth, newHeight) {
        // Expand grid, keep old items
        const oldGrid = this.grid;
        const oldHeight = this.height;
        const oldWidth = this.width;

        this.width = Math.max(this.width, newWidth);
        this.height = Math.max(this.height, newHeight);
        this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(null));

        // Re-place old items
        for (let y = 0; y < oldHeight; y++) {
            for (let x = 0; x < oldWidth; x++) {
                if (oldGrid[y][x] !== null) {
                    this.grid[y][x] = oldGrid[y][x];
                }
            }
        }
    }

    serialize() {
        return {
            width: this.width,
            height: this.height,
            items: this.items.map(it => ({ id: it.equipment.id, x: it.x, y: it.y, count: it.count })),
            scrap: this.scrap
        };
    }

    deserialize(data) {
        if (!data) return;
        this.width = data.width || 5;
        this.height = data.height || 6;
        this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(null));
        this.items = [];
        this.scrap = data.scrap || 0;
        if (data.items) {
            for (const saved of data.items) {
                const eq = getEquipment(saved.id);
                if (eq) {
                    // occupy grid
                    for (let dy = 0; dy < eq.cells; dy++) {
                        if (this.grid[saved.y + dy]) {
                            this.grid[saved.y + dy][saved.x] = saved.id;
                        }
                    }
                    this.items.push({
                        equipment: eq,
                        x: saved.x,
                        y: saved.y,
                        count: saved.count || 1
                    });
                }
            }
        }
    }
}
