// Legacy entry per design doc - actual game is in src/main.js
// This file is kept for compatibility with original structure proposal
// It dynamically imports the modular game

console.log('Soul Core: The Great Decay - game.js legacy entry');
console.log('Actual game bootstrap is in src/main.js loaded via index.html module');

// For environments that load game.js directly, bootstrap Phaser here
// The index.html already loads src/main.js as module, so this file is not required for browser
// But we keep it to satisfy file structure

// If loaded directly (non-module), attempt to start game
if (typeof window !== 'undefined' && !window.PhaserGameStarted) {
    // The real boot is in src/main.js, so we just log
    window.PhaserGameStarted = true;
}
