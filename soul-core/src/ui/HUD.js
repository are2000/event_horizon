/**
 * HUD.js
 * ----------------------------------------------------------------------------
 * Screen-space UI drawn on the canvas (no DOM), in CSS pixels:
 *
 *   • resource bars   — the four planned systems: WEIGHT / HEAT / POWER / CORROSION
 *   • speed + drift   — instant feedback for the inertia work in Phase 1
 *   • minimap         — proves the world is bigger than the screen
 *   • hint line       — fades out after the first input
 *   • debug overlay   — FPS, step counts, physics state, modifier breakdown
 *
 * Everything is placeholder geometry + type; when real art lands, only this
 * file changes.
 */
import { CONFIG } from '../config.js';
import { clamp, font, roundRectPath } from '../core/MathUtils.js';

export class HUD {
  /**
   * @param {import('../core/Viewport.js').Viewport} viewport
   * @param {import('../entities/Ship.js').Ship} ship
   */
  constructor(viewport, ship) {
    this.viewport = viewport;
    this.ship = ship;

    this.margin = CONFIG.hud.margin;
    this.barHeight = CONFIG.hud.barHeight;
    this.barGap = CONFIG.hud.barGap;
    this.labelWidth = CONFIG.hud.labelWidth;

    this.barWidth = 120;
    this.panelWidth = 200;
    this.panelHeight = 100;
    this.minimapSize = 84;

    /** Hint fades away once the player touches the stick. */
    this.hintAlpha = 1;
    this.hintTimer = 0;
    this.hintDismissed = false;

    this.layout();
  }

  layout() {
    const vp = this.viewport;
    this.barWidth = clamp(vp.width * CONFIG.hud.barFraction, CONFIG.hud.minBarWidth, CONFIG.hud.maxBarWidth);
    this.panelWidth = this.labelWidth + 10 + this.barWidth + 14;
    this.panelHeight = 22 + 4 * (this.barHeight + this.barGap) + 8;
    this.minimapSize = clamp(vp.width * 0.24, 64, 108);
  }

  /** Called when the player first provides movement input. */
  notifyInput() {
    this.hintDismissed = true;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} info { loop, input, world, systems, particles, camera, debug, frameDt }
   */
  render(ctx, info) {
    const vp = this.viewport;
    const safe = vp.safeArea;
    const p = CONFIG.palette;

    ctx.save();
    ctx.textBaseline = 'middle';

    /* =============================================== resource panel ======= */
    const px = this.margin + safe.left;
    const py = this.margin + safe.top;

    ctx.fillStyle = 'rgba(4, 8, 18, 0.45)';
    roundRectPath(ctx, px, py, this.panelWidth, this.panelHeight, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 170, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header
    ctx.font = font(9, 700);
    ctx.fillStyle = p.textDim;
    ctx.textAlign = 'left';
    ctx.fillText('SOUL CORE // CORE STATUS', px + 10, py + 12);

    const r = this.ship.resources;
    const rows = [
      { label: 'WEIGHT', value: r.weight, color: p.weight },
      { label: 'HEAT', value: r.heat, color: p.heat },
      { label: 'POWER', value: r.power, color: p.power },
      { label: 'CORROSION', value: r.corrosion, color: p.corrosion },
    ];

    let y = py + 26;
    for (let i = 0; i < rows.length; i++) {
      this._drawBar(ctx, px + 10, y, this.labelWidth, this.barWidth, rows[i]);
      y += this.barHeight + this.barGap;
    }

    /* =============================================== speed / drift ======== */
    const speed = this.ship.speedValue ?? 0;
    const drift = Math.abs(this.ship.lateralSpeed);
    const bottomY = vp.height - safe.bottom - this.margin;

    ctx.textAlign = 'right';
    ctx.font = font(11, 700);
    ctx.fillStyle = p.text;
    ctx.fillText(`${speed.toFixed(0)} u/s`, vp.width - safe.right - this.margin, bottomY - 34);
    ctx.font = font(9, 600);
    ctx.fillStyle = p.textDim;
    ctx.fillText('SPEED', vp.width - safe.right - this.margin, bottomY - 20);

    // Drift meter — turns cyan as the ship slides sideways.
    const driftT = clamp(drift / 260, 0, 1);
    ctx.fillStyle = p.textDim;
    ctx.fillText('DRIFT', vp.width - safe.right - this.margin, bottomY - 52);
    ctx.fillStyle = p.barBg;
    roundRectPath(ctx, vp.width - safe.right - this.margin - 86, bottomY - 56, 70, 4, 2);
    ctx.fill();
    ctx.fillStyle = p.accent;
    roundRectPath(ctx, vp.width - safe.right - this.margin - 86, bottomY - 56, Math.max(2, 70 * driftT), 4, 2);
    ctx.fill();

    /* =============================================== minimap ============== */
    if (info.world) this._drawMinimap(ctx, info.world, info.camera, safe);

    /* =============================================== hint ================= */
    if (this.hintAlpha > 0.01) {
      ctx.textAlign = 'center';
      ctx.font = font(11, 600);
      ctx.globalAlpha = this.hintAlpha;
      ctx.fillStyle = p.textDim;
      ctx.fillText('DRAG TO THRUST · RELEASE TO DRIFT', vp.width * 0.5, bottomY - 96);
      ctx.globalAlpha = 1;
    }

    /* =============================================== debug ================ */
    if (info.debug) this._drawDebug(ctx, info, px, py);

    ctx.restore();
  }

  _drawBar(ctx, x, y, labelW, barW, row) {
    const p = CONFIG.palette;
    const h = this.barHeight;

    ctx.textAlign = 'left';
    ctx.font = font(9, 700);
    ctx.fillStyle = p.textDim;
    ctx.fillText(row.label, x, y + h * 0.5 + 0.5);

    const bx = x + labelW + 10;
    ctx.fillStyle = p.barBg;
    roundRectPath(ctx, bx, y, barW, h, h * 0.5);
    ctx.fill();

    const w = Math.max(0, Math.min(1, row.value)) * barW;
    if (w > 0.5) {
      ctx.fillStyle = row.color;
      roundRectPath(ctx, bx, y, w, h, h * 0.5);
      ctx.fill();
    }
  }

  _drawMinimap(ctx, world, camera, safe) {
    const vp = this.viewport;
    const size = this.minimapSize;
    const x = vp.width - safe.right - this.margin - size;
    const y = this.margin + safe.top;
    const scale = size / Math.max(world.width, world.height);
    const p = CONFIG.palette;

    ctx.save();
    ctx.fillStyle = 'rgba(4, 8, 18, 0.45)';
    roundRectPath(ctx, x, y, size, size, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 170, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Obstacles
    ctx.fillStyle = 'rgba(120, 140, 180, 0.55)';
    for (let i = 0; i < world.obstacles.length; i++) {
      const o = world.obstacles[i];
      const s = Math.max(1, o.radius * scale);
      ctx.fillRect(x + o.x * scale - s * 0.5, y + o.y * scale - s * 0.5, s, s);
    }

    // Visible viewport rectangle (what the camera currently shows).
    if (camera) {
      const v = camera.getVisibleRect();
      ctx.strokeStyle = 'rgba(53, 224, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + v.x * scale, y + v.y * scale, v.w * scale, v.h * scale);
    }

    // Ship
    ctx.fillStyle = p.accent;
    const sx = x + this.ship.x * scale;
    const sy = y + this.ship.y * scale;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = font(8, 700);
    ctx.fillStyle = p.textDim;
    ctx.textAlign = 'left';
    ctx.fillText('SECTOR', x + 6, y + size - 8);
    ctx.restore();
  }

  _drawDebug(ctx, info, px, py) {
    const vp = this.viewport;
    const safe = vp.safeArea;
    const loop = info.loop;
    const ship = this.ship;
    const p = CONFIG.palette;

    const lines = [
      `fps ${loop.fps.toFixed(0)}  step ${(loop.fixedStep * 1000).toFixed(1)}ms x${loop.stepsLastFrame}`,
      `upd ${loop.updateMs.toFixed(2)}ms  rnd ${loop.renderMs.toFixed(2)}ms  parts ${info.particles ? info.particles.liveCount : 0}`,
      `pos ${ship.x.toFixed(0)},${ship.y.toFixed(0)}  vel ${ship.vx.toFixed(0)},${ship.vy.toFixed(0)} (${(ship.speedValue ?? 0).toFixed(0)} u/s)`,
      `fwd ${ship.forwardSpeed.toFixed(0)}  lat ${ship.lateralSpeed.toFixed(0)}  thr ${ship.throttle.toFixed(2)}`,
      `cam ${info.camera.x.toFixed(0)},${info.camera.y.toFixed(0)} z${info.camera.zoom.toFixed(3)}`,
      `${info.input ? info.input.joystick.debugString() : ''}`,
      `mods ${info.systems ? info.systems.dump() : ''}`,
      `view ${vp.width}x${vp.height} @${vp.dpr.toFixed(2)}  safe-b ${safe.bottom}`,
      '[`] debug  [P] pause  [R] respawn  [1..4] gauges',
    ];

    ctx.save();
    const w = 300;
    const h = lines.length * 12 + 12;
    const x = vp.width - safe.right - this.margin - w;
    const y = py + this.minimapSize + this.margin + 8;

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

  /** @param {number} dt seconds (frame delta, used for UI animation only) */
  update(dt) {
    if (this.hintDismissed) {
      this.hintTimer += dt;
      this.hintAlpha = Math.max(0, 1 - this.hintTimer * 1.6);
    }
  }
}

export default HUD;
