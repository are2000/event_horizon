export class PreloadScene extends Phaser.Scene {
    constructor() {
        super('PreloadScene');
    }

    preload() {
        // Loading UI
        const { width, height } = this.cameras.main;
        const loadingText = this.add.text(width/2, height/2 + 100, 'Loading... 0%', {
            fontSize: '18px',
            color: '#00ffff',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        // Progress bar graphics
        const barW = 300, barH = 8;
        const barBg = this.add.rectangle(width/2, height/2 + 60, barW, barH, 0x222233);
        const barFill = this.add.rectangle(width/2 - barW/2, height/2 + 60, 0, barH, 0x00ffff);
        barFill.setOrigin(0, 0.5);

        this.load.on('progress', (p) => {
            const pct = Math.floor(p*100);
            loadingText.setText(`Loading... ${pct}%`);
            barFill.width = barW * p;
            // Update HTML progress if exists
            const htmlProgress = document.getElementById('loading-progress');
            const htmlText = document.getElementById('loading-text');
            if (htmlProgress) htmlProgress.style.width = `${pct}%`;
            if (htmlText) htmlText.textContent = `تحميل... ${pct}% / Loading... ${pct}%`;
        });

        // Load assets
        // Ships
        this.load.image('player', 'assets/ships/player.png');
        this.load.image('fighter', 'assets/ships/fighter.png');
        this.load.image('gunship', 'assets/ships/gunship.png');
        this.load.image('drone', 'assets/ships/drone.png');
        this.load.image('shield_carrier', 'assets/ships/shield_carrier.png');
        this.load.image('elite', 'assets/ships/elite.png');
        this.load.image('behemoth', 'assets/ships/behemoth.png');
        this.load.image('amoeba', 'assets/ships/amoeba.png');

        // Weapons / modules
        this.load.image('cannon', 'assets/weapons/cannon.png');
        this.load.image('laser', 'assets/weapons/laser.png');
        this.load.image('plasma', 'assets/weapons/plasma.png');
        this.load.image('missile', 'assets/weapons/missile.png');
        this.load.image('rocket', 'assets/weapons/rocket.png');
        this.load.image('engine', 'assets/weapons/engine.png');
        this.load.image('reactor', 'assets/weapons/reactor.png');
        this.load.image('shield', 'assets/weapons/shield.png');
        this.load.image('core', 'assets/weapons/core.png');
        this.load.image('armor', 'assets/weapons/armor.png');

        // UI
        this.load.image('panel', 'assets/ui/panel.png');
        this.load.image('panel2', 'assets/ui/panel2.png');
        this.load.image('toolbar', 'assets/ui/toolbar.png');
        this.load.image('content', 'assets/ui/content.png');

        // Audio
        this.load.audio('shot_cannon', 'assets/audio/shot_cannon.wav');
        this.load.audio('shot_laser', 'assets/audio/shot_laser.wav');
        this.load.audio('shot_plasma', 'assets/audio/shot_plasma.wav');
        this.load.audio('shot_missile', 'assets/audio/shot_missile.wav');
        this.load.audio('explosion', 'assets/audio/explosion.wav');
        this.load.audio('hit', 'assets/audio/hit.wav');
        this.load.audio('alarm', 'assets/audio/alarm.wav');
        this.load.audio('buy', 'assets/audio/buy.wav');
        this.load.audio('repair', 'assets/audio/repair.wav');
        this.load.audio('scrap', 'assets/audio/scrap.wav');
        this.load.audio('music_battle', 'assets/audio/music_battle.mp3');

        // Generate placeholder textures for effects
        this.load.on('complete', () => {
            // Create gradient textures procedurally
            this.createPlaceholderTextures();
        });
    }

    createPlaceholderTextures() {
        // Starfield texture
        const starGfx = this.make.graphics({ x: 0, y: 0, add: false });
        starGfx.fillStyle(0xffffff, 1);
        starGfx.fillCircle(1, 1, 1);
        starGfx.generateTexture('star', 2, 2);
        starGfx.clear();

        // Glow texture
        starGfx.fillStyle(0x00ffff, 0.5);
        starGfx.fillCircle(32, 32, 32);
        starGfx.generateTexture('glow', 64, 64);
        starGfx.destroy();
    }

    create() {
        console.log('Preload complete');
        this.scene.start('MainMenuScene');
    }
}
