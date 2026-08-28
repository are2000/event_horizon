# Soul Core: The Great Decay

This branch `arena/01a047e1-event-horizon` contains the new game **Soul Core: The Great Decay** built with Phaser.js for web/mobile portrait.

- **Play:** Open `soul-core-game/index.html` or root `index.html` (redirects)
- **Original Event Horizon:** Still available in `master` branch (archived) - https://github.com/are2000/event_horizon/tree/master
- **Size:** 8.7MB (was 150MB with Unity project) - optimized for 128MB Arena limit
- **Assets:** Selected assets from Event Horizon (GPL v3) copied to `soul-core-game/assets/` with licenses in `ASSET_LICENSES.md`

## Quick Start

```bash
cd soul-core-game
python3 -m http.server 8000
# Open http://localhost:8000
```

## Documentation

- `soul-core-game/README.md` - Full game design, systems, roadmap
- `soul-core-game/PLAN.md` - Development phases
- `soul-core-game/ASSET_LICENSES.md` - Asset licenses

## Original Event Horizon (Archived)

The original open-source Event Horizon Unity game is preserved in the `master` branch:

- Google Play: https://play.google.com/store/apps/details?id=com.ZipasGames.EventHorizon
- Steam: https://store.steampowered.com/app/465000/Event_Horizon/
- Discord: https://discordapp.com/invite/yFFvF7m #mod-dev channel

If you need to restore original files:
```bash
git checkout master -- Starship/
```

## License

- Soul Core code: GPL v3 (due to asset reuse) - see LICENSE.md
- Assets: See ASSET_LICENSES.md - mostly GPL v3 from Event Horizon, future CC0 from Kenney
