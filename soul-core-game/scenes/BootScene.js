import { setLanguage, currentLang } from '../data/localization.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Minimal preload for boot
    }

    create() {
        // Setup language from save or browser
        const savedLang = localStorage.getItem('soul_core_lang');
        if (savedLang) {
            setLanguage(savedLang);
        } else {
            const browserLang = navigator.language.startsWith('ar') ? 'ar' : 'en';
            setLanguage(browserLang);
        }

        // Hide HTML loading screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => loadingScreen.style.display = 'none', 800);
        }

        // Device detection
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

        console.log('Soul Core Boot - Lang:', currentLang, 'Mobile:', this.isMobile);

        this.scene.start('PreloadScene');
    }
}
