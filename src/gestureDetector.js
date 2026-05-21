/**
 * gestureDetector.js
 * Detects game-relevant hand gestures from MediaPipe landmarks.
 *
 * Gestures:
 * GUN_POSE  — index finger up, others curled  (aim mode & auto-shoot)
 * SWITCH    — two fingers (index+middle) up    (cycle gun)
 * RELOAD    — open palm (all 5 fingers up)     (reload)
 */

import { LM } from './handTracker.js';

// ── Tuning constants ─────────────────────────────────────
const SWITCH_COOLDOWN_MS  = 600;    // ms between switch triggers
const RELOAD_COOLDOWN_MS  = 1000;   // ms between reload triggers

export class GestureDetector {
  constructor() {
    this._prevLandmarks     = null;
    this._lastSwitchTime    = 0;
    this._lastReloadTime    = 0;

    // Smoothed aim point (lerp)
    this.aimX = 0;
    this.aimY = 0;
  }

  /**
   * Process a new frame's landmarks and return detected gestures.
   * @param {Array|null} landmarks   21 MediaPipe landmark objects
   * @param {number} canvasW
   * @param {number} canvasH
   * @returns {GestureResult}
   */
  detect(landmarks, canvasW, canvasH) {
    /** @type {GestureResult} */
    const result = {
      gunPose:  false,
      shoot:    false,
      switch:   false,
      reload:   false,
      aimX:     this.aimX,
      aimY:     this.aimY,
      gesture:  'NONE',
    };

    if (!landmarks) {
      this._prevLandmarks = null;
      return result;
    }

    const lm   = landmarks;
    const now  = Date.now();

    // ── 1. Finger extension checks ─────────────────────
    const indexUp  = this._fingerExtended(lm, LM.INDEX_MCP,  LM.INDEX_TIP);
    const middleUp = this._fingerExtended(lm, LM.MIDDLE_MCP, LM.MIDDLE_TIP);
    const ringUp   = this._fingerExtended(lm, LM.RING_MCP,   LM.RING_TIP);
    const pinkyUp  = this._fingerExtended(lm, LM.PINKY_MCP,  LM.PINKY_TIP);
    const thumbUp  = this._thumbExtended(lm);

    // ── 2. Aim point from index finger tip (mirrored) ──
    const rawX = (1 - lm[LM.INDEX_TIP].x) * canvasW; // mirror X
    const rawY = lm[LM.INDEX_TIP].y * canvasH;
    this.aimX = this.aimX + (rawX - this.aimX) * 0.35; // lerp smooth
    this.aimY = this.aimY + (rawY - this.aimY) * 0.35;
    result.aimX = this.aimX;
    result.aimY = this.aimY;

    // ── 3. OPEN PALM → RELOAD ──────────────────────────
    if (indexUp && middleUp && ringUp && pinkyUp && thumbUp) {
      result.gesture = 'RELOAD';
      result.reload  = now - this._lastReloadTime > RELOAD_COOLDOWN_MS;
      if (result.reload) this._lastReloadTime = now;
      this._prevLandmarks = lm;
      return result;
    }

    // ── 4. TWO FINGERS → SWITCH GUN ───────────────────
    if (indexUp && middleUp && !ringUp && !pinkyUp) {
      result.gesture = 'SWITCH';
      result.switch  = now - this._lastSwitchTime > SWITCH_COOLDOWN_MS;
      if (result.switch) this._lastSwitchTime = now;
      this._prevLandmarks = lm;
      return result;
    }

    // ── 5. GUN POSE → index up, others down ───────────
    if (indexUp && !middleUp && !ringUp && !pinkyUp) {
      result.gunPose = true;
      result.shoot   = true; // Auto-fire whenever aiming
      result.gesture = 'AUTO_SHOOT';
    } else {
      result.gesture = 'NO_GUN';
    }

    this._prevLandmarks = lm;
    return result;
  }

  // ── Helpers ────────────────────────────────────────────

  /** Returns true if a finger's tip is clearly above its MCP (base knuckle) */
  _fingerExtended(lm, mcpIdx, tipIdx) {
    return lm[tipIdx].y < lm[mcpIdx].y - 0.04;
  }

  /** Thumb check: tip is to the left (or right) of its MCP */
  _thumbExtended(lm) {
    const dx = Math.abs(lm[LM.THUMB_TIP].x - lm[LM.THUMB_MCP].x);
    const dy = Math.abs(lm[LM.THUMB_TIP].y - lm[LM.THUMB_MCP].y);
    return dx > 0.05 || dy > 0.05;
  }
}

/**
 * @typedef {Object} GestureResult
 * @property {boolean} gunPose
 * @property {boolean} shoot
 * @property {boolean} switch
 * @property {boolean} reload
 * @property {number}  aimX
 * @property {number}  aimY
 * @property {string}  gesture  human-readable label
 */