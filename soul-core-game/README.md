# Soul Core: The Great Decay

**Top-down Roguelite Space Survival + Modular Ship Customization + Merge**
Portrait Mobile, Phaser.js, Web-first

## Vision
You control the "Soul Core" of a hybrid exploration ship carrying the last genetic code and data stock of an entire civilization. The galaxy is in a collapse phase called **The Great Decay**. Stopping means corrosion reaches the core and the last trace of life perishes. Final goal: Reach **The Eye of the Anomaly / Genesis Core** and plant the core to recreate the galaxy.

## Core Pillars
1. **Every power has a cost** - No perfect piece. Strongest weapon consumes power, generates heat, takes space, adds weight.
2. **Equipment changes behavior not just stats** - Installing Laser/Cannon/Plasma/Missile changes cannon shape, rotation, firing, VFX, sound.
3. **Fully modular ship** - Hull, engines, armor, hangar, cannons, lighting, damage and corrosion layers are independent parts.
4. **Constant pressure** - Corrosion increases during run, so player cannot explore forever.
5. **Short clear decisions on mobile** - Every choice understandable in seconds, big touch UI.

## How to Play
- **Movement**: Drag joystick at bottom center (WASD/Arrows on desktop for testing)
- **Shooting**: Automatic based on targeting priority
- **Manual Target**: Tap enemy to lock (5 sec)
- **Target Priorities**: Closest / Weakest / Dangerous / Manual (tap)
- **Collect**: Scrap (yellow) and equipment pickups (cyan glow)
- **Repair Station**: Green circle - tap hint to open repair/inventory
- **Exit Gate**: Purple gate - clears when base destroyed + enemies dead
- **Inventory**: Backpack button top-right of bottom UI - merge identical tier to upgrade, equip to mounts

## Systems (4 Central)
1. **Weight** → affects movement (acceleration, speed, turn)
2. **Power** → affects weapon firing, shield
3. **Heat** → accumulates from weapons + engines, causes performance drop when over limit
4. **Corrosion** → affects Soul Core health, equipment performance, VFX

## Weapons
- **Laser**: Direct beam, high accuracy, continuous heat
- **Cannon**: Bullet projectiles, high damage per shot, recoil
- **Plasma**: Big slow projectile, high damage, AoE on impact, high heat
- **Missile**: Fires toward cannon first, tracking after arm delay, limited turn

### Mount Arcs
- **Right Mount**: Front + right arc, no far left, gradual turn
- **Left Mount**: Front + left arc, no far right
- **Rear Mount**: Rear arc, defense or missiles

## Inventory & Merge
- Grid 5x6 initially
- Small item: 1 cell, medium: 2, large: 3+
- Merge rule: `2 identical same type+ tier → 1 higher tier`
- UI: ship summary top, grid middle, mounts bottom, merge/equip/unequip buttons

## Sectors
1. **Scrap Belt** - weak enemies, many resources, learn movement + inventory
2. **Patrol Zone** - moving ships, importance of targeting
3. **Scavenger Base** - first multi-part base (turrets, generators)
4. **Corrosion Storm** - environmental damage, fast corrosion rise
5. **Behemoth Zone** - big enemies, physics distortions, Boss

### Enemy Base Multi-Part
```
Base
├── Detection Array
├── Defensive Turrets
├── Shield Generator
├── Repair Station
├── Scrap Storage
└── Base Core
```

### Boss: Void Behemoth
Phases: Outer protection → destroy pull points → area attacks → inner core exposed → rage + increased corrosion → destroy core

## Roguelite Progression
- On loss: run ends, most temp equipment lost, keep permanent resources
- Permanent upgrades: expand inventory grid, max weight, power capacity, cooling, hull health, corrosion resistance, new mounts, engine efficiency, rare equipment chance, hangar ability
- New Game+ after Genesis Core: Corrupted Galaxy with different physics, hybrid enemies, new weapons, special merge equipment

## Tech Stack
- **Phaser.js 3.80.1** via CDN ESM (+esm)
- **Portrait 720x1280** - FIT scale, centered
- **Arcade Physics**
- **LocalStorage SaveSystem**
- **Arabic + English** localization (RTL support)

## Project Structure
```
soul-core-game/
├── index.html
├── style.css
├── game.js (legacy entry per doc)
├── src/
│   ├── main.js (real entry)
│   ├── config.js
│   ├── data/
│   │   ├── equipment.js
│   │   ├── ships.js
│   │   └── localization.js
│   ├── systems/
│   │   ├── ship-system.js
│   │   ├── inventory-system.js
│   │   ├── weapon-system.js
│   │   ├── targeting-system.js
│   │   ├── corrosion-system.js
│   │   ├── enemy-ai.js
│   │   ├── sector-system.js
│   │   ├── save-system.js
│   │   └── audio-system.js
│   └── scenes/
│       ├── BootScene.js
│       ├── PreloadScene.js
│       ├── MainMenuScene.js
│       ├── GameScene.js
│       ├── InventoryScene.js
│       ├── RepairScene.js
│       ├── BossScene.js
│       ├── GameOverScene.js
│       └── VictoryScene.js
├── assets/
│   ├── ships/
│   ├── weapons/
│   ├── ui/
│   ├── audio/
│   └── effects/
├── ASSET_LICENSES.md
└── README.md
```

## Development Phases (per doc section 22)
1. Game Design ✓ (doc complete)
2. Core Prototype ✓ (movement, camera, enemies, shooting, corrosion)
3. Systems Integration ✓ (power, weight, heat, cooling, independent weapons, arcs)
4. Inventory ✓ (grid, stacking, merge, equip, remove, stats preview)
5. Combat Vertical Slice ✓ (Laser, Cannon, Plasma, Missile, VFX)
6. World Slice ✓ (open sector, repair station, enemy base, exit)
7. Boss Slice ✓ (simplified multi-phase)
8. Roguelite ✓ (save, permanent upgrades, loss, retry)
9. Alpha → test 15 min continuous, bugfix, different devices, perf
10. Mobile Packaging (later) - Capacitor, APK, real device test, AAB

## Vertical Slice Success Criteria (per doc section 23)
Player can:
- Enter sector
- Move freely
- Face enemies
- Use 4 weapon types
- See ship behavior change
- Face base
- Repair ship
- Reach Boss
- Win or lose

## Quality Criteria
- Works inside game, not only separate file
- Works with touch on portrait
- No cartoonish unintended rotation/transitions
- Uses independent parts when needed
- Acceptable performance on mobile
- Clear failure state
- Testable and reproducible bugs
- No unclear license dependency

## Running Locally
```bash
# From soul-core-game folder
python3 -m http.server 8000
# or
npx serve .
# Open http://localhost:8000
```

Or use the dev server in this repo (Arena preview will proxy).

## Asset Sources
All current assets from Event Horizon open-source repo (GPL v3) - see ASSET_LICENSES.md
Future: Kenney CC0 packs for final release

## License
GPL v3 (inherited from Event Horizon open-source) for code that uses its assets. Original game logic is original but asset usage requires GPL compliance until replaced with CC0.

## Roadmap
- [x] Vertical Slice
- [ ] Replace music with CC0
- [ ] Add Hangar + Fighters (post-VS)
- [ ] Sector Map Scene
- [ ] More enemy types + behaviors
- [ ] Permanent upgrade tree UI
- [ ] Sound polish + music layers based on corrosion
- [ ] Particle effects polish
- [ ] Mobile APK via Capacitor
