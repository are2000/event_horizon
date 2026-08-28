import Phaser from 'phaser';
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

// Hide HTML loading after Phaser boots
window.addEventListener('load', () => {
    const game = new Phaser.Game(config);

    // Handle resize for mobile portrait
    window.addEventListener('resize', () => {
        if (game.scale) {
            game.scale.refresh();
        }
    });

    // Prevent context menu
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Prevent scrolling
    document.addEventListener('touchmove', e => {
        if (e.target.closest('#game-container')) {
            e.preventDefault();
        }
    }, { passive: false });

    console.log('Soul Core: The Great Decay - Game initialized');
    console.log('Config:', GAME_CONFIG);
});
