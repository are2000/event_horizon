/**
 * Loop.js
 * ----------------------------------------------------------------------------
 * requestAnimationFrame driver with a FIXED-STEP accumulator.
 *
 * Design notes
 * ------------
 * 1) Delta time: the raw delta between frames is clamped, so a backgrounded
 *    tab or a GC pause cannot teleport the ship through an asteroid.
 *
 * 2) Fixed timestep: physics always advances in identical slices (1/120s).
 *    Without this, drift/inertia feel different on a 60Hz phone vs a 120Hz
 *    phone and collisions become non-deterministic — fatal for a roguelite
 *    where we later want seeded, replayable runs.
 *
 * 3) Render interpolation: leftover accumulator time is handed to the
 *    renderer as `alpha` (0..1). Entities store their previous transform and
 *    lerp toward the current one, so a 120Hz sim looks buttery on a 60Hz
 *    display instead of juddering.
 */
import { CONFIG } from '../config.js';

export class Loop {
  /**
   * @param {object} opts
   * @param {(dt:number)=>void} opts.update  fixed-step simulation
   * @param {(alpha:number, frameDt:number)=>void} opts.render
   * @param {number} [opts.fixedStep]
   * @param {number} [opts.maxFrameTime]
   * @param {number} [opts.maxSteps]
   */
  constructor({ update, render, fixedStep, maxFrameTime, maxSteps, timeScale }) {
    this.update = update;
    this.render = render;

    this.fixedStep = fixedStep ?? CONFIG.loop.fixedStep;
    this.maxFrameTime = maxFrameTime ?? CONFIG.loop.maxFrameTime;
    this.maxSteps = maxSteps ?? CONFIG.loop.maxSteps;
    this.timeScale = timeScale ?? CONFIG.loop.timeScale;

    this.running = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.rafId = 0;

    // Telemetry (used by the debug overlay).
    this.fps = 0;
    this.frameDt = 0;
    this.stepsLastFrame = 0;
    this.updateMs = 0;
    this.renderMs = 0;
    this.elapsed = 0; // total simulated time, seconds
    this.frameCount = 0;

    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * Call after the tab regains focus / the app resumes: drops the huge
   * "time away" delta and re-bases the clock.
   */
  resetTiming() {
    this.lastTime = performance.now();
    this.accumulator = 0;
  }

  _tick(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._tick);

    // --- 1. raw delta time, guarded -------------------------------------
    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = 0;
    // Clamp: a long stall is skipped, not simulated.
    frameDt = Math.min(frameDt, this.maxFrameTime);
    this.frameDt = frameDt;
    this.fps = frameDt > 0 ? this.fps * 0.9 + (1 / frameDt) * 0.1 : this.fps;

    // --- 2. fixed-step simulation --------------------------------------
    this.accumulator += frameDt * this.timeScale;

    const t0 = performance.now();
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < this.maxSteps) {
      this.update(this.fixedStep);
      this.accumulator -= this.fixedStep;
      this.elapsed += this.fixedStep;
      steps++;
    }
    // If we hit the step cap we are running too slow to catch up: drop the
    // backlog instead of falling further behind every frame.
    if (steps >= this.maxSteps) this.accumulator = 0;
    this.stepsLastFrame = steps;
    this.updateMs = performance.now() - t0;

    // --- 3. interpolated render ----------------------------------------
    const alpha = this.accumulator / this.fixedStep;
    const t1 = performance.now();
    this.render(alpha, frameDt);
    this.renderMs = performance.now() - t1;

    this.frameCount++;
  }
}

export default Loop;
