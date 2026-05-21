/**
 * zombie.js
 * Zombie class: multiple types, edge spawning, pathfinding toward player.
 */

// ══════════════════════════════════════════════════════════
//  ZOMBIE TYPES
// ══════════════════════════════════════════════════════════
const ZOMBIE_TYPES = {
  WALKER: {
    label:      'WALKER',
    hp:         80,
    speed:      0.9,
    size:       22,
    color:      '#4a8040',
    bodyColor:  '#3a6030',
    score:      10,
    damage:     8,     // damage to player per second while touching
  },
  RUNNER: {
    label:      'RUNNER',
    hp:         50,
    speed:      2.4,
    size:       17,
    color:      '#8a5020',
    bodyColor:  '#6a3810',
    score:      15,
    damage:     12,
  },
  TANK: {
    label:      'TANK',
    hp:         400,
    speed:      0.45,
    size:       36,
    color:      '#557755',
    bodyColor:  '#335533',
    score:      50,
    damage:     25,
  },
  EXPLODER: {
    label:      'EXPLODER',
    hp:         60,
    speed:      1.3,
    size:       20,
    color:      '#aa3300',
    bodyColor:  '#882200',
    score:      20,
    damage:     60,    // explodes when reaching player
    explosive:  true,
    explosionR: 80,
  },
};

let _zombieId = 0;

export class Zombie {
  /**
   * @param {number} canvasW
   * @param {number} canvasH
   * @param {number} wave    current wave number — increases difficulty
   */
  constructor(canvasW, canvasH, wave = 1) {
    this.id   = _zombieId++;
    this.type = this._pickType(wave);
    const cfg  = ZOMBIE_TYPES[this.type];

    // Scale with wave
    const waveScale = 1 + (wave - 1) * 0.12;
    this.maxHp   = Math.round(cfg.hp * waveScale);
    this.hp      = this.maxHp;
    this.speed   = cfg.speed * (1 + (wave - 1) * 0.05);
    this.size    = cfg.size;
    this.color   = cfg.color;
    this.bodyColor = cfg.bodyColor;
    this.score   = cfg.score;
    this.damage  = cfg.damage;
    this.explosive  = cfg.explosive  ?? false;
    this.explosionR = cfg.explosionR ?? 0;

    // Spawn on a random edge
    this._spawnOnEdge(canvasW, canvasH);

    this.alive     = true;
    this.flashTimer = 0;   // frames to show hit-flash
    this.angle     = 0;    // for drawing direction
    // Random wobble offset for organic movement
    this.wobblePhase = Math.random() * Math.PI * 2;
    this.wobbleAmp   = 0.3 + Math.random() * 0.4;
  }

  // ── Choose type based on wave probabilities ────────────
  _pickType(wave) {
    const r = Math.random();
    if (wave < 2)  return r < 0.9  ? 'WALKER' : 'RUNNER';
    if (wave < 4)  return r < 0.6  ? 'WALKER' : r < 0.85 ? 'RUNNER' : 'TANK';
    if (wave < 6)  return r < 0.45 ? 'WALKER' : r < 0.70 ? 'RUNNER' : r < 0.85 ? 'TANK' : 'EXPLODER';
    // wave 6+
    return r < 0.35 ? 'WALKER' : r < 0.58 ? 'RUNNER' : r < 0.75 ? 'TANK' : 'EXPLODER';
  }

  // ── Spawn outside canvas bounds ────────────────────────
  _spawnOnEdge(W, H) {
    const side = Math.floor(Math.random() * 4);
    const MARGIN = 30;
    switch (side) {
      case 0: this.x = Math.random() * W;  this.y = -MARGIN;      break; // top
      case 1: this.x = W + MARGIN;          this.y = Math.random() * H; break; // right
      case 2: this.x = Math.random() * W;  this.y = H + MARGIN;   break; // bottom
      case 3: this.x = -MARGIN;             this.y = Math.random() * H; break; // left
    }
  }

  // ── Update position toward target ─────────────────────
  /**
   * @param {number} tx  target x (crosshair / canvas center)
   * @param {number} ty  target y
   * @param {number} frame global frame count (for wobble)
   */
  update(tx, ty, frame) {
    if (!this.alive) return;

    const dx   = tx - this.x;
    const dy   = ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Angle toward target with slight sinusoidal wobble
    const wobble = Math.sin(frame * 0.04 + this.wobblePhase) * this.wobbleAmp;
    const cosA   = Math.cos(wobble);
    const sinA   = Math.sin(wobble);
    const nx     = (dx / dist) * cosA - (dy / dist) * sinA;
    const ny     = (dx / dist) * sinA + (dy / dist) * cosA;

    this.x += nx * this.speed;
    this.y += ny * this.speed;

    this.angle = Math.atan2(ny, nx);
    if (this.flashTimer > 0) this.flashTimer--;
  }

  // ── Take damage ────────────────────────────────────────
  hit(dmg) {
    this.hp         -= dmg;
    this.flashTimer  = 6;
    if (this.hp <= 0) {
      this.hp    = 0;
      this.alive = false;
    }
  }

  // ── Is zombie touching player (canvas centre area)? ───
  touchesPoint(px, py, threshold = 0) {
    return Math.hypot(this.x - px, this.y - py) < this.size + threshold;
  }

  // ── Data for renderer ──────────────────────────────────
  get isFlashing() { return this.flashTimer > 0; }
  get hpRatio()    { return this.hp / this.maxHp; }
}

// ══════════════════════════════════════════════════════════
//  SPAWN MANAGER
// ══════════════════════════════════════════════════════════
export class ZombieSpawner {
  constructor() {
    this.wave       = 1;
    this.zombies    = [];
    this.spawnTimer = 0;
    this.waveKills  = 0;
    this.zombiesThisWave = this._zombiesForWave(1);
    this.spawned    = 0;
    this._waveComplete = false;
  }

  // How many zombies in this wave
  _zombiesForWave(w) { return 8 + w * 4; }

  startWave(w) {
    this.wave         = w;
    this.waveKills    = 0;
    this.spawned      = 0;
    this.zombiesThisWave = this._zombiesForWave(w);
    this._waveComplete   = false;
    this.spawnTimer   = 0;
  }

  /**
   * Call every frame. Returns newly created Zombie instances.
   * @param {number} canvasW
   * @param {number} canvasH
   * @returns {Zombie[]}  newly spawned zombies this frame
   */
  tick(canvasW, canvasH) {
    if (this._waveComplete) return [];

    this.spawnTimer++;

    // Spawn interval shrinks with wave (min 30 frames)
    const interval = Math.max(30, 80 - this.wave * 6);
    const maxAlive = Math.min(20 + this.wave * 3, 60);

    const newZombies = [];

    if (
      this.spawnTimer >= interval &&
      this.spawned < this.zombiesThisWave &&
      this.zombies.length < maxAlive
    ) {
      const z = new Zombie(canvasW, canvasH, this.wave);
      this.zombies.push(z);
      newZombies.push(z);
      this.spawned++;
      this.spawnTimer = 0;
    }

    return newZombies;
  }

  /** Call when a zombie dies */
  registerKill() {
    this.waveKills++;
    if (this.waveKills >= this.zombiesThisWave) {
      this._waveComplete = true;
    }
  }

  get isWaveComplete() { return this._waveComplete && this.zombies.filter(z => z.alive).length === 0; }
}