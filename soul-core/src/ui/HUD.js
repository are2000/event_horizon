/**
 * HUD.js
 * ----------------------------------------------------------------------------
 * Screen-space UI drawn on the canvas (no DOM), in CSS pixels.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ HULL       ███████████████░░░░░  100/100 │  green
 *   │ POWER      ████████████░░░░░░░░   78/100 │  cyan
 *   │ HEAT       ██████░░░░░░░░░░░░░░   31/100 │  orange (red past the ceiling)
 *   │ CORROSION  ██░░░░░░░░░░░░░░░░░    6/100  │  purple
 *   │ MASS 34.0 / 100            ⚠ CORE OVERHEAT│
 *   └──────────────────────────────────────────┘
 *   ┌────────┐
 *   │ ◈ SCRAP 128 │                              │  gold, pulses on pickup
 *   └────────┘
 *
 * Plus: minimap (top-right, below the panel), speed/drift readout
 * (bottom-right), hint line, and the debug overlay.
 *
 * Everything here is placeholder geometry + type; when real art lands, only
 * this file changes.
 */
import { CONFIG } from '../config.js';
import { clamp, font, roundRectPath } from '../core/MathUtils.js';

/** Bar definitions: label, colour, and how to read the value. */
const GAUGES = [
  {
    key: 'hull',
    label: 'HULL',
    color: 'gaugeHull',
    current: (s) => s.hull,
    max: (s) => s.maxHull,
    ratio: (ship) => ship.hullRatio,
    critical: (ship) => ship.hullRatio < 0.25,
  },
  {
    key: 'power',
    label: 'POWER',
    color: 'gaugePower',
    current: (s) => s.power,
    max: (s) => s.maxPower,
    ratio: (ship) => ship.powerRatio,
    critical: (ship) => ship.powerRatio < 0.15,
  },
  {
    key: 'heat',
    label: 'HEAT',
    color: 'gaugeHeat',
    current: (s) => s.heat,
    max: (s) => s.maxHeat,
    // Heat can exceed its maximum — the bar fills the redline band in red.
    ratio: (ship) => clamp(ship.heatRatio / CONFIG.systems.heatCeiling, 0, 1),
    over: (ship) => (ship.isOverheating ? 1 - ship.overheatSeverity : 0),
    critical: (ship) => ship.isOverheating,
  },
  {
    key: 'corrosion',
    label: 'CORROSION',
    color: 'gaugeCorrosion',
    current: (s) => s.coreCorrosion,
    max: () => 100,
    ratio: (ship) => ship.corrosionRatio,
    critical: (ship) => ship.corrosionRatio >= CONFIG.systems.meltdownWarning,
  },
];

export class HUD {
  /**
   * @param {import('../core/Viewport.js').Viewport} viewport
   * @param {import('../entities/Ship.js').Ship} ship
   */
  constructor(viewport, ship) {
    this.viewport = viewport;
    this.ship = ship;

    const h = CONFIG.hud;
    this.margin = h.margin;
    this.maxPanelWidth = h.maxPanelWidth;
    this.panelWidth = 300;
    this.barHeight = h.barHeight;
    this.barGap = h.barGap;
    this.labelWidth = h.labelWidth;
    this.valueWidth = h.valueWidth;
    this.minimapSize = 84;

    /** Hint text fades away after the first input. */
    this.hintAlpha = 1;
    this.hintTimer = 0;
    this.hintDismissed = false;

    /** Screen flash (0..1) driven by Game on damage/meltdown. */
    this.flash = 0;

    /* --- scrap counter ---------------------------------------------------- */
    /** 1 -> 0 pulse when scrap lands (drives the chip's glow). */
    this.scrapPulse = 0;
    /** Floating "+N" readouts: { value, t } — max a handful at a time. */
    this.scrapGains = [];

    this.layout();
  }

  /** Point the HUD at a (new) ship — used by Game.restart(). */
  setShip(ship) {
    this.ship = ship;
    return this;
  }

  layout() {
    const vp = this.viewport;
    this.panelWidth = Math.min(vp.width - this.margin * 2, this.maxPanelWidth);
    this.minimapSize = clamp(vp.width * CONFIG.hud.minimapFraction, 64, 108);
    this.barWidth = Math.max(
      80,
      this.panelWidth - this.labelWidth - this.valueWidth - 20, // 20 = padding
    );
    this.panelHeight = 10 + GAUGES.length * (this.barHeight + this.barGap) + 16;
  }

  notifyInput() {
    this.hintDismissed = true;
  }

  /** Reset transient UI state for a new run. */
  resetRun() {
    this.hintAlpha = 1;
    this.hintTimer = 0;
    this.hintDismissed = false;
    this.flash = 0;
    this.scrapPulse = 0;
    this.scrapGains.length = 0;
  }

  /**
   * Scrap landed. Call on every pickup: the chip pulses and a floating "+N"
   * drifts up out of it, because a number that silently ticks up is a number
   * nobody notices.
   * @param {number} value
   */
  notifyScrap(value) {
    if (value <= 0) return;
    this.scrapPulse = 1;
    if (this.scrapGains.length >= 4) this.scrapGains.shift();
    this.scrapGains.push({ value, t: 0 });
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} info { loop, input, world, systems, particles, camera, debug, frameDt, state }
   */
  render(ctx, info) {
    const vp = this.viewport;
    const safe = vp.safeArea;

    ctx.save();
    ctx.textBaseline = 'middle';

    /* ================================================== gauge panel ======= */
    const px = this.margin + safe.left;
    const py = this.margin + safe.top;

    ctx.fillStyle = 'rgba(4, 8, 18, 0.5)';
    roundRectPath(ctx, px, py, this.panelWidth, this.panelHeight, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 170, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    let y = py + 10 + this.barHeight * 0.5;
    for (let i = 0; i < GAUGES.length; i++) {
      this._drawGauge(ctx, px + 10, y, GAUGES[i], info);
      y += this.barHeight + this.barGap;
    }

    /* ================================================== status line ======= */
    this._drawStatusLine(ctx, px + 10, py + this.panelHeight - 11, info);

    /* ================================================== speed / drift ===== */
    this._drawSpeed(ctx, safe);

    /* ================================================== scrap ============= */
    this._drawScrap(ctx, info, safe);

    /* ================================================== minimap =========== */
    if (info.world) this._drawMinimap(ctx, info.world, info.camera, safe);

    /* ================================================== hint ============== */
    if (this.hintAlpha > 0.01) {
      ctx.textAlign = 'center';
      ctx.font = font(11, 600);
      ctx.globalAlpha = this.hintAlpha;
      ctx.fillStyle = CONFIG.palette.textDim;
      ctx.fillText('DRAG TO THRUST · RELEASE TO DRIFT', vp.width * 0.5, vp.height - safe.bottom - this.margin - 96);
      ctx.globalAlpha = 1;
    }

    /* ================================================== debug ============= */
    if (info.debug) this._drawDebug(ctx, info, safe);

    ctx.restore();
  }

  _drawGauge(ctx, x, y, gauge, info) {
    const p = CONFIG.palette;
    const ship = this.ship;
    const stats = ship.stats;
    const h = this.barHeight;

    /* --- label ------------------------------------------------------------ */
    ctx.textAlign = 'left';
    ctx.font = font(9, 700);
    ctx.fillStyle = gauge.critical(ship) ? p.gaugeCritical : p.textDim;
    ctx.fillText(gauge.label, x, y + 0.5);

    /* --- track ------------------------------------------------------------ */
    const bx = x + this.labelWidth;
    ctx.fillStyle = p.barBg;
    roundRectPath(ctx, bx, y - h * 0.5, this.barWidth, h, h * 0.5);
    ctx.fill();

    /* --- fill -------------------------------------------------------------- */
    const ratio = clamp(gauge.ratio(ship), 0, 1);
    const w = Math.max(0, ratio) * this.barWidth;
    if (w > 0.5) {
      const critical = gauge.critical(ship);
      let color = p[gauge.color];
      if (gauge.key === 'heat' && ship.isOverheating) color = p.gaugeCritical;

      // Critical gauges pulse so you notice them in peripheral vision.
      if (critical) {
        ctx.globalAlpha = 0.65 + 0.35 * Math.abs(Math.sin(ship.age * 6));
      }
      ctx.fillStyle = color;
      roundRectPath(ctx, bx, y - h * 0.5, w, h, h * 0.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* --- redline marker (how far past maxHeat we are) --------------------- */
    if (gauge.key === 'heat' && ship.isOverheating) {
      const ceilingX = bx + (this.barWidth / CONFIG.systems.heatCeiling);
      const overW = w - this.barWidth / CONFIG.systems.heatCeiling;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(ship.age * 12));
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, ceilingX, y - h * 0.5, Math.max(2, overW), h, h * 0.5);
      ctx.fill();
      ctx.restore();
    }

    /* --- value ------------------------------------------------------------ */
    const cur = gauge.current(stats);
    const max = gauge.max(stats);
    ctx.textAlign = 'right';
    ctx.font = font(9, 700);
    ctx.fillStyle = gauge.critical(ship) ? p.gaugeCritical : p.text;
    ctx.fillText(`${Math.round(cur)}/${Math.round(max)}`, x + this.panelWidth - 20, y + 0.5);
  }

  _drawStatusLine(ctx, x, y, info = {}) {
    const p = CONFIG.palette;
    const ship = this.ship;
    ctx.textAlign = 'left';
    ctx.font = font(9, 700);

    /* --- the warning is decided FIRST, so the readouts can yield to it ----- */
    let warning = null;
    let warnColor = p.text;
    if (ship.corrosionRatio >= CONFIG.systems.meltdownWarning) {
      warning = ship.corrosionRatio >= 1 ? 'CORE MELTDOWN' : 'MELTDOWN IMMINENT';
      warnColor = p.gaugeCorrosion;
    } else if (ship.isOverheating) {
      warning = 'CORE OVERHEAT';
      warnColor = p.gaugeCritical;
    } else if (ship.powerRatio < 0.15) {
      warning = 'POWER CRITICAL';
      warnColor = p.gaugePower;
    } else if (ship.hullRatio < 0.25) {
      warning = 'HULL BREACH';
      warnColor = p.gaugeCritical;
    } else if (ship.isOverloaded) {
      warning = 'HOLD FULL - THRUST 0';
      warnColor = p.gaugeCritical;
    } else if (ship.weightRatio > 0.85) {
      warning = 'OVERLOAD';
      warnColor = p.gaugeHeat;
    }

    const rightLimit = x + this.panelWidth - 30; // value column ends here
    const budget = rightLimit - (warning ? ctx.measureText(warning).width + 12 : 0);
    const fits = (w) => cx + w <= budget;
    let cx = x;

    /* --- MASS (weight is a stat, not one of the four bars) ----------------- */
    ctx.fillStyle = p.textDim;
    ctx.fillText('MASS', cx, y);
    const massText = `${ship.stats.weight.toFixed(1)} / ${ship.stats.maxWeight}`;
    ctx.fillStyle = ship.isOverloaded ? p.gaugeCritical : p.weight;
    ctx.fillText(massText, cx + 34, y);
    cx += 34 + ctx.measureText(massText).width + 10;

    /* --- POWER LOAD: what the installed guns cost the reactor -------------- */
    const load = ship.stats.powerLoad ?? 0;
    const regen = ship.stats.powerRegen ?? CONFIG.systems.powerRegen;
    if (load > 0.05 && fits(72)) {
      const loadText = `${load.toFixed(1)}/s`;
      ctx.fillStyle = p.textDim;
      ctx.fillText('LOAD', cx, y);
      ctx.fillStyle = load >= regen ? p.gaugeCritical : p.gaugePower;
      ctx.fillText(loadText, cx + 30, y);
      cx += 30 + ctx.measureText(loadText).width + 10;
    }

    /* --- weapon mounts: one letter per hardpoint --------------------------- */
    const weapons = info.weapons;
    if (weapons && fits(76)) {
      ctx.fillStyle = p.textDim;
      ctx.fillText('GUNS', cx, y);
      cx += 30;
      for (let i = 0; i < weapons.mounts.length; i++) {
        const m = weapons.mounts[i];
        const state = m.state;
        ctx.fillStyle =
          state === 'firing' ? p.gaugeHeat : state === 'tracking' ? p.accent : 'rgba(207,224,255,0.28)';
        ctx.fillText(m.label, cx, y);
        cx += 9;
      }
      cx += 6;
    }

    if (fits(62)) {
      const kills = String(info.kills ?? 0);
      ctx.fillStyle = p.textDim;
      ctx.fillText('KILLS', cx, y);
      ctx.fillStyle = p.text;
      ctx.fillText(kills, cx + 34, y);
      cx += 34 + ctx.measureText(kills).width + 10;
    }

    if (fits(46)) {
      const targets = String(info.targets ?? 0);
      ctx.fillStyle = p.textDim;
      ctx.fillText('TGT', cx, y);
      ctx.fillStyle = p.gaugeCorrosion;
      ctx.fillText(targets, cx + 20, y);
      cx += 20 + ctx.measureText(targets).width + 10;
    }

    if (warning) {
      ctx.textAlign = 'right';
      ctx.fillStyle = warnColor;
      ctx.globalAlpha = 0.7 + 0.3 * Math.abs(Math.sin(ship.age * 5));
      ctx.fillText(`▲ ${warning}`, x + this.panelWidth - 20, y);
      ctx.globalAlpha = 1;
    }
  }

  _drawSpeed(ctx, safe) {
    const vp = this.viewport;
    const p = CONFIG.palette;
    const ship = this.ship;
    const speed = ship.speedValue ?? 0;
    const drift = Math.abs(ship.lateralSpeed);
    const right = vp.width - safe.right - this.margin;
    const bottomY = vp.height - safe.bottom - this.margin;

    ctx.textAlign = 'right';
    ctx.font = font(11, 700);
    ctx.fillStyle = p.text;
    ctx.fillText(`${speed.toFixed(0)} u/s`, right, bottomY - 34);
    ctx.font = font(9, 600);
    ctx.fillStyle = p.textDim;
    ctx.fillText('SPEED', right, bottomY - 20);

    // Drift meter — turns cyan as the ship slides sideways.
    const driftT = clamp(drift / 260, 0, 1);
    ctx.fillStyle = p.textDim;
    ctx.fillText('DRIFT', right, bottomY - 52);
    ctx.fillStyle = p.barBg;
    roundRectPath(ctx, right - 86, bottomY - 56, 70, 4, 2);
    ctx.fill();
    ctx.fillStyle = p.accent;
    roundRectPath(ctx, right - 86, bottomY - 56, Math.max(2, 70 * driftT), 4, 2);
    ctx.fill();
  }

  _drawMinimap(ctx, world, camera, safe) {
    const vp = this.viewport;
    const size = this.minimapSize;
    const x = vp.width - safe.right - this.margin - size;
    const y = this.margin + safe.top + this.panelHeight + 8;
    const scale = size / Math.max(world.width, world.height);
    const p = CONFIG.palette;

    ctx.save();
    ctx.fillStyle = 'rgba(4, 8, 18, 0.45)';
    roundRectPath(ctx, x, y, size, size, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 170, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(120, 140, 180, 0.55)';
    for (let i = 0; i < world.obstacles.length; i++) {
      const o = world.obstacles[i];
      const s = Math.max(1, o.radius * scale);
      ctx.fillRect(x + o.x * scale - s * 0.5, y + o.y * scale - s * 0.5, s, s);
    }

    if (camera) {
      const v = camera.getVisibleRect();
      ctx.strokeStyle = 'rgba(53, 224, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + v.x * scale, y + v.y * scale, v.w * scale, v.h * scale);
    }

    ctx.fillStyle = this.ship.alive ? p.accent : p.gaugeCritical;
    ctx.beginPath();
    ctx.arc(x + this.ship.x * scale, y + this.ship.y * scale, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = font(8, 700);
    ctx.fillStyle = p.textDim;
    ctx.textAlign = 'left';
    ctx.fillText('SECTOR', x + 6, y + size - 8);
    ctx.restore();
  }

  _drawDebug(ctx, info, safe) {
    const vp = this.viewport;
    const loop = info.loop;
    const ship = this.ship;
    const p = CONFIG.palette;
    const s = ship.stats;
    const systems = info.systems;
    const weapons = info.weapons;

    /* --- weapon telemetry --------------------------------------------------- */
    const gunLines = [];
    if (weapons) {
      const mounts = weapons.mounts;
      gunLines.push(
        `guns ${mounts.map((m) => `${m.label}${m.state === 'firing' ? '*' : m.target ? '~' : '-'}`).join(' ')}` +
        `  firing ${weapons.firingCount}/${mounts.length}  kills ${weapons.kills}`,
      );
      // Local angle, legal arc and aiming error, in degrees.
      gunLines.push(
        mounts
          .map((m) => {
            const deg = (r) => ((r * 180) / Math.PI).toFixed(0);
            return `${m.label} ${deg(m.localAngle)}° in[${deg(m.arcCenter - m.arcHalf)}..${deg(m.arcCenter + m.arcHalf)}] e${((m.aimError * 180) / Math.PI).toFixed(0)}°`;
          })
          .join(' | '),
      );
      gunLines.push(
        `beam draw ${weapons.powerDraw.toFixed(1)} pwr/s  targets ${info.targets ?? 0} alive  scans ${info.targeting ? info.targeting.scans : 0}`,
      );
    }

    const lines = [
      `fps ${loop.fps.toFixed(0)}  step ${(loop.fixedStep * 1000).toFixed(1)}ms x${loop.stepsLastFrame}`,
      `upd ${loop.updateMs.toFixed(2)}ms  rnd ${loop.renderMs.toFixed(2)}ms  parts ${info.particles ? info.particles.liveCount : 0}`,
      `pos ${ship.x.toFixed(0)},${ship.y.toFixed(0)}  v ${ship.speedValue.toFixed(0)} u/s  thr ${ship.throttle.toFixed(2)}`,
      `accel ${ship.currentAccel.toFixed(0)}/${s.engineThrust} wu/s²  grip ${(ship.grip * ship.modifiers.gripMul).toFixed(2)}`,
      `weight ${s.weight.toFixed(1)}/${s.maxWeight}  power ${s.power.toFixed(1)}/${s.maxPower}`,
      `heat ${s.heat.toFixed(1)}/${s.maxHeat} (cool ${s.coolingRate}/s)  corr ${s.coreCorrosion.toFixed(1)}%`,
      `hull ${s.hull.toFixed(1)}/${s.maxHull}  alive ${ship.alive}  state ${info.state}`,
      systems ? systems.explain('thrustMul') : '',
      systems ? systems.explain('maxSpeedMul') : '',
      ...gunLines,
      info.cargo ? `hold ${info.cargo.items.length} items  ${info.cargo.totalWeight}kg  load ${info.cargo.powerLoad}/s  ` +
        Object.keys(info.cargo.equipped).map((id) => `${id}:${info.cargo.equipped[id]?.name.replace(' ', '') ?? '-'}`).join(' ') : '',
      info.projectiles !== undefined ? `shells ${info.projectiles.liveCount} live  pickups ${info.pickups ?? 0}` : '',
      info.collision ? `grid ${info.collision.grid.buckets.size} cells / ${info.collision.grid.insertCount} idx  ` +
        `query ${info.collision.grid.lastCandidates} cand  contacts ${info.collision.lastContacts}  ` +
        `sep ${info.collision.lastSeparations}  rams ${info.collision.ramCount}` : '',
      info.runScrap !== undefined
        ? `scrap ${info.runScrap} (bank ${info.scrapBank ?? 0})  loose ${info.scrap ?? 0}  blasts ${info.blasts ? info.blasts.liveCount : 0}`
        : '',
      `cam ${info.camera.x.toFixed(0)},${info.camera.y.toFixed(0)} z${info.camera.zoom.toFixed(3)}`,
      info.input ? info.input.joystick.debugString() : '',
      `view ${vp.width}x${vp.height} @${vp.dpr.toFixed(2)}  safe-b ${safe.bottom}`,
      '[`] debug  [P] pause  [R] restart  [J] jettison  [2] +mass  [6] raider  [7] scrap',
    ];

    ctx.save();
    const w = 320;
    const h = lines.length * 12 + 12;
    const x = Math.max(4, vp.width - safe.right - this.margin - w);
    const y = this.margin + safe.top + this.panelHeight + this.minimapSize + 16;

    ctx.fillStyle = 'rgba(2, 6, 14, 0.72)';
    roundRectPath(ctx, x, y, w, h, 8);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = font(10, 500);
    ctx.fillStyle = p.text;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + 8, y + 12 + i * 12);
    }
    ctx.restore();
  }

  /** @param {number} dt seconds (frame delta — UI animation only) */
  update(dt) {
    if (this.hintDismissed) {
      this.hintTimer += dt;
      this.hintAlpha = Math.max(0, 1 - this.hintTimer * 1.6);
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.scrapPulse > 0) this.scrapPulse = Math.max(0, this.scrapPulse - dt * 2.6);

    for (let i = this.scrapGains.length - 1; i >= 0; i--) {
      const g = this.scrapGains[i];
      g.t += dt;
      if (g.t >= 1.1) this.scrapGains.splice(i, 1);
    }
  }

  /** Where the scrap chip lives (also the origin of the floating +N). */
  _scrapChipRect(safe) {
    return {
      x: this.margin + safe.left,
      y: this.margin + safe.top + this.panelHeight + 6,
      h: 22,
    };
  }

  /**
   * The scrap counter: a compact chip under the gauge panel.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} info render info ({ runScrap, scrapBank, scrap })
   * @param {{top:number,right:number,bottom:number,left:number}} safe
   */
  _drawScrap(ctx, info, safe) {
    const p = CONFIG.palette;
    const box = this._scrapChipRect(safe);
    const pulse = this.scrapPulse;
    const value = String(info.runScrap ?? 0);
    const bank = info.scrapBank ?? 0;

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    /* --- measure ----------------------------------------------------------- */
    ctx.font = font(12, 800);
    const wGlyph = ctx.measureText('◈').width;
    ctx.font = font(9, 700);
    const wLabel = ctx.measureText('SCRAP').width;
    ctx.font = font(13, 800);
    const wValue = ctx.measureText(value).width;
    ctx.font = font(9, 600);
    const bankText = bank > 0 ? `bank ${bank}` : '';
    const wBank = bankText ? ctx.measureText(bankText).width + 10 : 0;

    const w = 10 + wGlyph + 5 + wLabel + 8 + wValue + wBank + 10;
    const h = box.h;

    /* --- chip --------------------------------------------------------------- */
    ctx.fillStyle = 'rgba(4, 8, 18, 0.5)';
    roundRectPath(ctx, box.x, box.y, w, h, 7);
    ctx.fill();
    // The border flares gold on pickup, so the eye is pulled to the number.
    ctx.strokeStyle = p.scrap;
    ctx.globalAlpha = 0.25 + pulse * 0.6;
    ctx.lineWidth = 1 + pulse;
    ctx.stroke();
    ctx.globalAlpha = 1;

    let cx = box.x + 10;
    const cy = box.y + h * 0.5;

    ctx.font = font(12, 800);
    ctx.fillStyle = p.scrap;
    ctx.globalAlpha = 0.8 + pulse * 0.2;
    ctx.fillText('◈', cx, cy);
    cx += wGlyph + 5;

    ctx.font = font(9, 700);
    ctx.fillStyle = p.textDim;
    ctx.fillText('SCRAP', cx, cy);
    cx += wLabel + 8;

    ctx.font = font(13, 800);
    ctx.fillStyle = p.scrap;
    // A hair bigger at the moment of pickup, then it settles back.
    ctx.fillText(value, cx, cy - pulse * 1.2);
    cx += wValue;

    if (bankText) {
      ctx.font = font(9, 600);
      ctx.fillStyle = p.textDim;
      ctx.fillText(bankText, cx + 10, cy);
    }

    /* --- floating +N -------------------------------------------------------- */
    for (let i = 0; i < this.scrapGains.length; i++) {
      const g = this.scrapGains[i];
      const t = g.t / 1.1; // 0..1
      ctx.globalAlpha = (1 - t) * 0.95;
      ctx.font = font(11 + (1 - t) * 2, 800);
      ctx.fillStyle = p.scrap;
      ctx.fillText(`+${g.value}`, box.x + w + 6, cy - 6 - t * 26);
    }

    ctx.restore();
  }

  /** Full-screen damage/alert flash, drawn over everything but the overlay. */
  renderFlash(ctx) {
    if (this.flash <= 0.01) return;
    const vp = this.viewport;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255, 70, 90, ${(this.flash * 0.35).toFixed(3)})`;
    ctx.fillRect(0, 0, vp.width, vp.height);
    ctx.restore();
  }
}

export default HUD;
