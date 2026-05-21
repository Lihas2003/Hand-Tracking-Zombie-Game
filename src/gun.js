/**
 * gun.js
 * Defines all gun types and the GunManager that tracks
 * the currently selected weapon, ammo, and fire timing.
 */

// ══════════════════════════════════════════════════════════
//  GUN DEFINITIONS
//  fireRate   : ms between shots (lower = faster)
//  damage     : HP removed per hit (shotgun divides among pellets)
//  ammo       : -1 = infinite
//  pellets    : number of simultaneous bullets (shotgun)
//  spread     : half-angle spread in degrees for multiple pellets
//  bulletSpeed: canvas pixels per frame
//  bulletSize : radius in px
//  splashRadius: 0 = no AOE; >0 = damages zombies within radius
//  bulletColor : CSS color string
//  trailColor  : CSS color string
//  reloadTime  : ms to reload
// ══════════════════════════════════════════════════════════

export const GUNS = {
  PISTOL: {
    name:        'PISTOL',
    label:       'P',
    desc:        'Reliable. Infinite ammo.',
    fireRate:    450,
    damage:      30,
    ammo:        -1,           // infinite
    pellets:     1,
    spread:      0,
    bulletSpeed: 14,
    bulletSize:  5,
    splashRadius:0,
    bulletColor: '#ffdd00',
    trailColor:  'rgba(255,200,0,0.35)',
    reloadTime:  0,
    drawGun:     drawPistol,
  },

  SHOTGUN: {
    name:        'SHOTGUN',
    label:       'SG',
    desc:        'Wide spread. High damage.',
    fireRate:    850,
    damage:      80,           // total, split across pellets
    ammo:        40,
    pellets:     7,
    spread:      18,           // ±18°
    bulletSpeed: 11,
    bulletSize:  4,
    splashRadius:0,
    bulletColor: '#ff8822',
    trailColor:  'rgba(255,100,0,0.25)',
    reloadTime:  1400,
    drawGun:     drawShotgun,
  },

  MACHINE_GUN: {
    name:        'MACHINE GUN',
    label:       'MG',
    desc:        'Full-auto. Burns through ammo.',
    fireRate:    90,
    damage:      12,
    ammo:        180,
    pellets:     1,
    spread:      4,            // slight inaccuracy
    bulletSpeed: 16,
    bulletSize:  4,
    splashRadius:0,
    bulletColor: '#00ffaa',
    trailColor:  'rgba(0,255,150,0.3)',
    reloadTime:  2000,
    drawGun:     drawMachineGun,
  },

  SNIPER: {
    name:        'SNIPER',
    label:       'SN',
    desc:        'One-shot power. Slow reload.',
    fireRate:    1400,
    damage:      200,
    ammo:        15,
    pellets:     1,
    spread:      0,
    bulletSpeed: 30,
    bulletSize:  3,
    splashRadius:0,
    bulletColor: '#00eeff',
    trailColor:  'rgba(0,220,255,0.6)',
    reloadTime:  2500,
    drawGun:     drawSniper,
  },

  ROCKET: {
    name:        'ROCKET',
    label:       'RL',
    desc:        'Explosive AOE. 5 rockets only.',
    fireRate:    2200,
    damage:      280,
    ammo:        5,
    pellets:     1,
    spread:      0,
    bulletSpeed: 7,
    bulletSize:  8,
    splashRadius:90,
    bulletColor: '#ff3300',
    trailColor:  'rgba(255,100,0,0.5)',
    reloadTime:  3500,
    drawGun:     drawRocket,
  },
};

export const GUN_ORDER = ['PISTOL', 'SHOTGUN', 'MACHINE_GUN', 'SNIPER', 'ROCKET'];

// ══════════════════════════════════════════════════════════
//  GUN MANAGER
// ══════════════════════════════════════════════════════════
export class GunManager {
  constructor() {
    this.currentIndex = 0;
    this.ammos        = {};
    this.reloading    = false;
    this.reloadEnd    = 0;
    this.lastFired    = 0;

    // Initialise ammo counts
    GUN_ORDER.forEach((key) => {
      this.ammos[key] = GUNS[key].ammo; // -1 = infinite
    });
  }

  // ── Current gun config ─────────────────────────────────
  get current()    { return GUNS[GUN_ORDER[this.currentIndex]]; }
  get currentKey() { return GUN_ORDER[this.currentIndex]; }
  get ammoLeft()   { return this.ammos[this.currentKey]; }

  // ── Switch to next gun ─────────────────────────────────
  switchNext() {
    this.currentIndex = (this.currentIndex + 1) % GUN_ORDER.length;
    this.reloading    = false;
  }

  // ── Can we fire right now? ─────────────────────────────
  canFire(now = Date.now()) {
    if (this.reloading && now < this.reloadEnd) return false;
    if (this.reloading && now >= this.reloadEnd) {
      // Reload finished
      const maxAmmo = this.current.ammo;
      if (maxAmmo !== -1) this.ammos[this.currentKey] = maxAmmo;
      this.reloading = false;
    }
    if (this.ammos[this.currentKey] === 0) return false;
    return now - this.lastFired >= this.current.fireRate;
  }

  // ── Start a manual reload ──────────────────────────────
  startReload(now = Date.now()) {
    if (this.reloading) return;
    if (this.current.ammo === -1) return;         // infinite — no reload needed
    if (this.ammos[this.currentKey] === this.current.ammo) return; // full
    this.reloading = true;
    this.reloadEnd = now + this.current.reloadTime;
  }

  /**
   * Fire the gun. Returns an array of bullet descriptor objects,
   * or [] if unable to fire.
   * @param {number} aimX  canvas aim X
   * @param {number} aimY  canvas aim Y
   * @param {number} fromX origin X (canvas centre or hand pos)
   * @param {number} fromY origin Y
   */
  fire(aimX, aimY, fromX, fromY) {
    const now = Date.now();
    if (!this.canFire(now)) return [];

    this.lastFired = now;
    const gun      = this.current;

    // Reduce ammo
    if (this.ammos[this.currentKey] !== -1) {
      this.ammos[this.currentKey]--;
      // Auto-reload on empty
      if (this.ammos[this.currentKey] === 0 && gun.reloadTime > 0) {
        this.reloading = true;
        this.reloadEnd = now + gun.reloadTime;
      }
    }

    const bullets = [];
    const baseAngle = Math.atan2(aimY - fromY, aimX - fromX); // radians

    for (let i = 0; i < gun.pellets; i++) {
      // Spread: evenly distribute pellets across spread arc
      const spreadRad = (gun.spread * Math.PI) / 180;
      let   pelletAngle;
      if (gun.pellets === 1) {
        pelletAngle = baseAngle + (Math.random() - 0.5) * spreadRad;
      } else {
        const frac   = gun.pellets === 1 ? 0 : i / (gun.pellets - 1); // 0..1
        pelletAngle  = baseAngle - spreadRad / 2 + frac * spreadRad;
        pelletAngle += (Math.random() - 0.5) * (spreadRad * 0.2);    // tiny jitter
      }

      bullets.push({
        x:            fromX,
        y:            fromY,
        vx:           Math.cos(pelletAngle) * gun.bulletSpeed,
        vy:           Math.sin(pelletAngle) * gun.bulletSpeed,
        damage:       gun.pellets > 1 ? gun.damage / gun.pellets : gun.damage,
        splashRadius: gun.splashRadius,
        speed:        gun.bulletSpeed,
        size:         gun.bulletSize,
        color:        gun.bulletColor,
        trail:        gun.trailColor,
        gunKey:       this.currentKey,
        age:          0,              // frames alive
        alive:        true,
        // For rocket: carries explosion flag
        isRocket:     this.currentKey === 'ROCKET',
      });
    }

    return bullets;
  }

  // ── Reload progress 0..1 ──────────────────────────────
  reloadProgress(now = Date.now()) {
    if (!this.reloading) return 1;
    const elapsed = now - (this.reloadEnd - this.current.reloadTime);
    return Math.min(1, elapsed / this.current.reloadTime);
  }
}

// ══════════════════════════════════════════════════════════
//  GUN DRAW FUNCTIONS  (called by renderer for HUD gun icon)
//  ctx origin = gun barrel base; draw facing right
// ══════════════════════════════════════════════════════════
function drawPistol(ctx, color = '#aaa') {
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Barrel
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(28,0); ctx.stroke();
  // Handle
  ctx.beginPath(); ctx.moveTo(8,0); ctx.lineTo(4,14); ctx.stroke();
  // Slide
  ctx.beginPath(); ctx.rect(6, -5, 18, 5); ctx.stroke();
}

function drawShotgun(ctx, color = '#c8a060') {
  ctx.strokeStyle = color; ctx.lineWidth = 3.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Long barrel
  ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(36,0); ctx.stroke();
  // Second barrel (double)
  ctx.beginPath(); ctx.moveTo(-8,4); ctx.lineTo(36,4); ctx.stroke();
  // Stock
  ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(-8,14); ctx.lineTo(-18,18); ctx.stroke();
}

function drawMachineGun(ctx, color = '#3a3') {
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Body
  ctx.beginPath(); ctx.rect(-4,-5,32,10); ctx.stroke();
  // Barrel
  ctx.beginPath(); ctx.moveTo(28,0); ctx.lineTo(44,0); ctx.stroke();
  // Magazine
  ctx.beginPath(); ctx.rect(-2,5,8,14); ctx.stroke();
  // Stock
  ctx.beginPath(); ctx.moveTo(-4,0); ctx.lineTo(-18,6); ctx.stroke();
}

function drawSniper(ctx, color = '#08f') {
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Very long barrel
  ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(52,0); ctx.stroke();
  // Scope
  ctx.beginPath(); ctx.rect(12,-10,16,8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20,-10); ctx.lineTo(20,-2); ctx.stroke();
  // Stock
  ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(-20,8); ctx.stroke();
}

function drawRocket(ctx, color = '#f40') {
  ctx.strokeStyle = color; ctx.lineWidth = 4;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Tube
  ctx.beginPath(); ctx.rect(-6,-6,36,12); ctx.stroke();
  // Tip
  ctx.beginPath(); ctx.moveTo(30,-6); ctx.lineTo(42,0); ctx.lineTo(30,6); ctx.stroke();
  // Fins
  ctx.beginPath(); ctx.moveTo(-6,-6); ctx.lineTo(-18,-12); ctx.lineTo(-6,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6,6);  ctx.lineTo(-18,12);  ctx.lineTo(-6,0); ctx.stroke();
}