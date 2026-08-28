// UMD version - uses global Phaser from CDN script tag
// This is more reliable for preview environments where importmap may fail

import { GAME_CONFIG } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { InventoryScene } from './scenes/InventoryScene.js';
import { RepairScene } from './scenes/RepairScene.js';
import { BossScene } from './scenes/BossScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { VictoryScene } from './scenes/VictoryScene.js';
const Phaser = window.Phaser;


if (!Phaser) {
    console.error('Phaser global not found!');
    document.getElementById('debug-text').textContent = 'Phaser not found! / لم يتم العثور على Phaser';
    throw new Error('Phaser not loaded');
}

console.log('Phaser UMD version:', Phaser.VERSION);

const config = {
    type: Phaser.AUTO,
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height,
    backgroundColor: GAME_CONFIG.backgroundColor,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
        }
    },
    scene: [BootScene, PreloadScene, MainMenuScene, GameScene, InventoryScene, RepairScene, BossScene, GameOverScene, VictoryScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_CONFIG.width,
        height: GAME_CONFIG.height
    },
    input: {
        activePointers: 3
    },
    audio: {
        disableWebAudio: false
    },
    render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false
    }
};

window.addEventListener('load', () => {
    const game = new Phaser.Game(config);

    window.addEventListener('resize', () => {
        if (game.scale) {
            game.scale.refresh();
        }
    });

    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('touchmove', e => {
        if (e.target.closest('#game-container')) {
            e.preventDefault();
        }
    }, { passive: false });

    console.log('Soul Core: The Great Decay - Game initialized (UMD)');
    console.log('Config:', GAME_CONFIG);
    
    // Hide loading screen after boot
    setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        if (ls) {
            ls.classList.add('hidden');
            setTimeout(() => ls.style.display = 'none', 800);
        }
    }, 1000);
});

// Also start immediately if window already loaded
if (document.readyState === 'complete') {
    const game = new Phaser.Game(config);
    console.log('Game started immediately (readyState complete)');
}
