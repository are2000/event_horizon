export class AudioSystem {
    constructor(scene) {
        this.scene = scene;
        this.sounds = {};
        this.music = null;
        this.enabled = true;
        this.musicEnabled = true;
    }

    preload() {
        // Preload is handled in PreloadScene, this just maps
    }

    create() {
        try {
            // Create sounds if loaded
            const keys = ['shot_cannon', 'shot_laser', 'shot_plasma', 'shot_missile', 'explosion', 'hit', 'alarm', 'buy', 'repair', 'scrap'];
            for (const key of keys) {
                if (this.scene.sound.locked) {
                    // will be created on unlock
                    continue;
                }
                if (this.scene.cache.audio.exists(key) || this.scene.textures.exists(key)) {
                    // For audio, check sound cache
                }
            }
        } catch (e) {
            console.warn('Audio create failed', e);
        }
    }

    playShot(type) {
        if (!this.enabled) return;
        try {
            const map = {
                cannon: 'shot_cannon',
                laser: 'shot_laser',
                plasma: 'shot_plasma',
                missile: 'shot_missile'
            };
            const key = map[type] || 'shot_cannon';
            if (this.scene.cache.audio.exists(key)) {
                this.scene.sound.play(key, { volume: 0.4 });
            }
        } catch {}
    }

    playExplosion() {
        if (!this.enabled) return;
        try {
            if (this.scene.cache.audio.exists('explosion')) {
                this.scene.sound.play('explosion', { volume: 0.5 });
            }
        } catch {}
    }

    playHit() {
        if (!this.enabled) return;
        try {
            if (this.scene.cache.audio.exists('hit')) {
                this.scene.sound.play('hit', { volume: 0.3 });
            }
        } catch {}
    }

    playScrap() {
        if (!this.enabled) return;
        try {
            if (this.scene.cache.audio.exists('scrap')) {
                this.scene.sound.play('scrap', { volume: 0.6 });
            }
        } catch {}
    }

    playAlarm() {
        if (!this.enabled) return;
        try {
            if (this.scene.cache.audio.exists('alarm')) {
                this.scene.sound.play('alarm', { volume: 0.5 });
            }
        } catch {}
    }

    playMusic(key = 'music_battle') {
        if (!this.musicEnabled) return;
        try {
            if (this.music) this.music.stop();
            if (this.scene.cache.audio.exists(key)) {
                this.music = this.scene.sound.add(key, { volume: 0.25, loop: true });
                this.music.play();
            }
        } catch {}
    }

    stopMusic() {
        try {
            if (this.music) this.music.stop();
        } catch {}
    }
}
