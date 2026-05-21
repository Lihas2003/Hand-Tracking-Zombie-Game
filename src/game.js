/**
 * game.js
 * Core game state machine: LOADING → START → PLAYING → WAVE_CLEAR → GAME_OVER
 * Manages bullets, collision detection, scoring, health, waves.
 */

import { GunManager, GUN_ORDER } from './gun.js';
import { ZombieSpawner }         from './zombie.js';
import { Renderer }              from './renderer.js';

export const STATE = {
  LOADING:    'LOADING',
  START:      'START',
  PLAYING:    'PLAYING',
  WAVE_CLEAR: 'WAVE_CLEAR',
  GAME_OVER:  'GAME_OVER',
};

// Give every bullet a unique numeric ID
let _bulletId = 0;

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas   = canvas;
    this.renderer = new Renderer(canvas);

    this.state    = STATE.LOADING;
    this.frame    = 0;

    // Player
    this.playerHP = 100;
    this.score    = 0;
    this.wave     = 1;

    // Subsystems
    this.gunManager = new GunManager();
    this.spawner    = new ZombieSpawner();
    this.spawner.startWave(1);

    // Active collections
    this.bullets  = [];

    // Aim / gesture state (filled each frame by main.js)
    this.aimX     = canvas.width  / 2;
    this.aimY     = canvas.height / 2;
    this.gunPose  = false;

    // Wave clear delay
    this._waveClearTimer  = 0;
    this._waveClearDelay  = 180; // frames (~3 s at 60fps)

    // Damage throttle (player takes damage max once per 30 frames)
    this._damageCooldown = 0;

    // RAF handle
    this._rafId = null;

    // Listeners for UI updates
    this._onHUDUpdate = null; // callback(hudData)
    this._onGameOver  = null;
    this._onWaveStart = null;
  }

  // ── Public API ─────────────────────────────────────────

  setHUDCallback(fn)      { this._onHUDUpdate = fn; }
  setGameOverCallback(fn) { this._onGameOver  = fn; }
  setWaveStartCallback(fn){ this._onWaveStart = fn; }

  start() {
    this.state    = STATE.PLAYING;
    this._rafId   = requestAnimationFrame(() => this._loop());
    this._onWaveStart?.(this.wave);
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  restart() {
    this.stop();
    this.playerHP = 100;
    this.score    = 0;
    this.wave     = 1;
    this.bullets  = [];
    this.gunManager  = new GunManager();
    this.spawner     = new ZombieSpawner();
    this.spawner.startWave(1);
    this._waveClearTimer = 0;
    this._damageCooldown = 0;
    this.state = STATE.PLAYING;
    this._rafId = requestAnimationFrame(() => this._loop());
    this._onWaveStart?.(this.wave);
  }

  /** Called by main.js each frame with fresh gesture data */
  updateGesture({ aimX, aimY, gunPose, shoot, switchGun, reload }) {
    this.aimX    = aimX;
    this.aimY    = aimY;
    this.gunPose = gunPose;

    if (this.state !== STATE.PLAYING) return;

    // Switch gun
    if (switchGun) {
      this.gunManager.switchNext();
      this._updateGunBar();
    }

    // Reload
    if (reload) {
      this.gunManager.startReload();
    }

    // Shoot
    if (shoot && gunPose) {
      const fromX = this.canvas.width  / 2;
      const fromY = this.canvas.height / 2;
      const newBullets = this.gunManager.fire(aimX, aimY, fromX, fromY);
      newBullets.forEach((b) => { b.id = _bulletId++; });
      this.bullets.push(...newBullets);

      if (newBullets.length > 0) {
        this.renderer.particles.emitMuzzleFlash(aimX, aimY);
        if (this.gunManager.currentKey === 'ROCKET') {
          this.renderer.shake(12);
        }
      }
    }
  }

  // ── Main loop ──────────────────────────────────────────
  _loop() {
    if (this.state !== STATE.PLAYING && this.state !== STATE.WAVE_CLEAR) return;

    this.frame++;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // ── Wave clear delay ─────────────────────────────────
    if (this.state === STATE.WAVE_CLEAR) {
      this._waveClearTimer--;
      if (this._waveClearTimer <= 0) {
        this.wave++;
        this.spawner.startWave(this.wave);
        this._onWaveStart?.(this.wave);
        this.state = STATE.PLAYING;
      }
      // Still render during cooldown
      this._render();
      this._rafId = requestAnimationFrame(() => this._loop());
      return;
    }

    // ── Spawn ────────────────────────────────────────────
    this.spawner.tick(W, H);

    // ── Update zombies ───────────────────────────────────
    const zombies = this.spawner.zombies.filter(z => z.alive);
    zombies.forEach((z) => z.update(W / 2, H / 2, this.frame));

    // ── Bullet movement & collision ───────────────────────
    this._updateBullets(zombies);

    // ── Player damage ─────────────────────────────────────
    this._checkPlayerDamage(zombies, W, H);

    // ── Check wave complete ───────────────────────────────
    if (this.spawner.isWaveComplete) {
      this.state           = STATE.WAVE_CLEAR;
      this._waveClearTimer = this._waveClearDelay;
    }

    // ── Render ───────────────────────────────────────────
    this._render();

    // ── HUD update ────────────────────────────────────────
    this._onHUDUpdate?.({
      score:          this.score,
      wave:           this.wave,
      health:         this.playerHP,
      ammo:           this.gunManager.ammoLeft,
      gunName:        this.gunManager.current.name,
      gunKey:         this.gunManager.currentKey,
      reloading:      this.gunManager.reloading,
      reloadProgress: this.gunManager.reloadProgress(),
      gesture:        this.gunPose ? 'GUN POSE ✓' : 'NO GUN POSE',
    });

    this._rafId = requestAnimationFrame(() => this._loop());
  }

  // ── Bullet logic ───────────────────────────────────────
  _updateBullets(zombies) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const toRemove = new Set();

    this.bullets.forEach((b) => {
      if (!b.alive) return;

      b.x   += b.vx;
      b.y   += b.vy;
      b.age++;

      // Out of bounds
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        b.alive = false;
        toRemove.add(b.id);
        this.renderer.trails.removeTrail(b.id);
        return;
      }

      // Collide with zombies
      for (const z of zombies) {
        if (!z.alive) continue;
        const dist = Math.hypot(b.x - z.x, b.y - z.y);
        const hitRadius = b.isRocket ? b.splashRadius : b.size + z.size;

        if (dist < hitRadius) {
          if (b.isRocket) {
            // Splash damage to all zombies in radius
            this._rocketSplash(b.x, b.y, b.splashRadius, b.damage);
            this.renderer.drawExplosionFlash(b.x, b.y, b.splashRadius);
            this.renderer.shake(18);
          } else {
            z.hit(b.damage);
            this.renderer.particles.emitBlood(b.x, b.y, 6);
            if (!z.alive) {
              this._onZombieDied(z);
            }
          }
          b.alive = false;
          toRemove.add(b.id);
          this.renderer.trails.removeTrail(b.id);
          break;
        }
      }
    });

    this.bullets = this.bullets.filter((b) => b.alive);
  }

  _rocketSplash(x, y, radius, damage) {
    this.spawner.zombies.forEach((z) => {
      if (!z.alive) return;
      if (Math.hypot(x - z.x, y - z.y) < radius + z.size) {
        z.hit(damage);
        this.renderer.particles.emitBlood(z.x, z.y, 8);
        if (!z.alive) this._onZombieDied(z);
      }
    });
  }

  _onZombieDied(z) {
    this.renderer.particles.emitDeath(z.x, z.y, z.color);
    this.score += z.score;
    this.spawner.zombies = this.spawner.zombies.filter(s => s.id !== z.id);
    this.spawner.registerKill();
  }

  // ── Player damage ─────────────────────────────────────
  _checkPlayerDamage(zombies, W, H) {
    if (this._damageCooldown > 0) { this._damageCooldown--; return; }

    const cx = W / 2, cy = H / 2;
    for (const z of zombies) {
      if (!z.alive) continue;
      if (z.touchesPoint(cx, cy, 30)) {
        // Exploder — one-shot burst damage
        if (z.explosive) {
          this.playerHP -= z.damage;
          this.renderer.drawExplosionFlash(z.x, z.y, z.explosionR);
          this.renderer.shake(20);
          z.alive = false;
          this.spawner.zombies = this.spawner.zombies.filter(s => s.id !== z.id);
          this.spawner.registerKill();
        } else {
          this.playerHP -= z.damage * (1 / 60); // per-frame damage ~8 HP/s
        }

        this.renderer.shake(4);
        this._damageCooldown = 10;

        if (this.playerHP <= 0) {
          this.playerHP = 0;
          this._triggerGameOver();
          return;
        }
      }
    }

    // Passive HP regen (1 HP/3s when not being hit)
    if (this.frame % 180 === 0 && this.playerHP < 100) {
      this.playerHP = Math.min(100, this.playerHP + 1);
    }
  }

  _triggerGameOver() {
    this.state = STATE.GAME_OVER;
    this.stop();
    this._onGameOver?.({ score: this.score, wave: this.wave });
  }

  // ── Render call ────────────────────────────────────────
  _render() {
    this.renderer.drawFrame({
      zombies:   this.spawner.zombies,
      bullets:   this.bullets,
      aimX:      this.aimX,
      aimY:      this.aimY,
      gunPose:   this.gunPose,
      gunKey:    this.gunManager.currentKey,
      playerHP:  this.playerHP,
      frame:     this.frame,
    });
  }

  _updateGunBar() {
    const slots = document.querySelectorAll('.gun-slot');
    const key   = this.gunManager.currentKey;
    slots.forEach((s) => {
      s.classList.toggle('active', s.dataset.gun === key);
    });
  }
}