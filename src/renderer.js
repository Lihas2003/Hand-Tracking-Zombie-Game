/**
 * renderer.js
 * Handles ALL canvas drawing: background, zombies, bullets,
 * explosions, crosshair, particles, and gun-icon overlay.
 */

import { GUNS } from './gun.js';

// ══════════════════════════════════════════════════════════
//  PARTICLE SYSTEM (blood splats, muzzle flash, explosions)
// ══════════════════════════════════════════════════════════
export class ParticleSystem {
  constructor() { this.particles = []; }

  /**
   * Emit blood particles when zombie is hit.
   */
  emitBlood(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({
        type:  'blood',
        x, y,
        vx:    Math.cos(angle) * speed,
        vy:    Math.sin(angle) * speed - 1,
        life:  30 + Math.random() * 20,
        maxLife: 50,
        size:  2 + Math.random() * 3,
        color: `hsl(${0 + Math.random()*20}, 90%, ${25 + Math.random()*15}%)`,
      });
    }
  }

  /**
   * Muzzle flash at aim point.
   */
  emitMuzzleFlash(x, y) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        type:    'flash',
        x, y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        life:    8 + Math.random() * 6,
        maxLife: 14,
        size:    3 + Math.random() * 4,
        color:   '#ffee00',
      });
    }
  }

  /**
   * Explosion ring + debris.
   */
  emitExplosion(x, y, radius = 80) {
    const count = 30 + Math.round(radius / 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 3 + Math.random() * (radius / 15);
      this.particles.push({
        type:    'explosion',
        x, y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        life:    20 + Math.random() * 20,
        maxLife: 40,
        size:    4 + Math.random() * 6,
        color:   `hsl(${20 + Math.random()*30}, 100%, ${40 + Math.random()*30}%)`,
      });
    }
  }

  /**
   * Death puff for a zombie.
   */
  emitDeath(x, y, zombieColor) {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        type:    'death',
        x, y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed - 2,
        life:    25 + Math.random() * 20,
        maxLife: 45,
        size:    3 + Math.random() * 5,
        color:   zombieColor,
      });
    }
    this.emitBlood(x, y, 15);
  }

  /**
   * Advance all particles by one frame.
   */
  update() {
    this.particles = this.particles.filter((p) => {
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += 0.15; // gravity
      p.life--;
      return p.life > 0;
    });
  }

  /**
   * Draw all particles.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    this.particles.forEach((p) => {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}

// ══════════════════════════════════════════════════════════
//  BULLET TRAILS
// ══════════════════════════════════════════════════════════
export class BulletTrailSystem {
  constructor() { this.trails = []; }

  addPoint(bulletId, x, y, color) {
    if (!this.trails[bulletId]) this.trails[bulletId] = [];
    this.trails[bulletId].push({ x, y, color, age: 0 });
  }

  removeTrail(bulletId) {
    delete this.trails[bulletId];
  }

  update() {
    Object.keys(this.trails).forEach((id) => {
      this.trails[id] = this.trails[id].filter((p) => {
        p.age++; return p.age < 12;
      });
      if (this.trails[id].length === 0) delete this.trails[id];
    });
  }

  draw(ctx) {
    Object.values(this.trails).forEach((pts) => {
      if (pts.length < 2) return;
      for (let i = 1; i < pts.length; i++) {
        const alpha = 1 - pts[i].age / 12;
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = pts[i].color;
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(pts[i-1].x, pts[i-1].y);
        ctx.lineTo(pts[i].x,   pts[i].y);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }
}

// ══════════════════════════════════════════════════════════
//  MAIN RENDERER
// ══════════════════════════════════════════════════════════
export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.W       = canvas.width;
    this.H       = canvas.height;
    this.particles  = new ParticleSystem();
    this.trails     = new BulletTrailSystem();
    this._bgGrad    = null;
    this._buildBg();

    // Screen-shake
    this.shakeX     = 0;
    this.shakeY     = 0;
    this.shakePower = 0;
  }

  resize(w, h) {
    this.W = w; this.H = h;
    this._buildBg();
  }

  // Trigger screen shake
  shake(power = 8) { this.shakePower = Math.max(this.shakePower, power); }

  _buildBg() {
    const ctx = this.ctx;
    this._bgGrad = ctx.createRadialGradient(
      this.W * 0.5, this.H * 0.5, 0,
      this.W * 0.5, this.H * 0.5, Math.hypot(this.W, this.H) * 0.55
    );
    this._bgGrad.addColorStop(0, '#0a1008');
    this._bgGrad.addColorStop(1, '#020302');
  }

  // ── Full frame draw ────────────────────────────────────
  drawFrame({ zombies, bullets, aimX, aimY, gunPose, gunKey, playerHP, frame }) {
    const ctx = this.ctx;

    // Screen shake
    if (this.shakePower > 0) {
      this.shakeX     = (Math.random() - 0.5) * this.shakePower;
      this.shakeY     = (Math.random() - 0.5) * this.shakePower;
      this.shakePower *= 0.7;
      if (this.shakePower < 0.5) this.shakePower = 0;
    } else { this.shakeX = 0; this.shakeY = 0; }

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    // Background
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(-10, -10, this.W + 20, this.H + 20);

    // Grid overlay (horror effect)
    this._drawGrid(ctx, frame);

    // Particles (behind zombies)
    this.trails.update();
    this.trails.draw(ctx);

    // Zombies
    zombies.forEach((z) => this._drawZombie(ctx, z));

    // Bullets
    bullets.forEach((b) => {
      this.trails.addPoint(b.id, b.x, b.y, b.trail);
      this._drawBullet(ctx, b);
    });

    // Particles (over zombies)
    this.particles.update();
    this.particles.draw(ctx);

    // Vignette
    this._drawVignette(ctx, playerHP);

    // Crosshair
    this._drawCrosshair(ctx, aimX, aimY, gunPose, gunKey);

    ctx.restore();
  }

  // ── Grid / scanlines ───────────────────────────────────
  _drawGrid(ctx, frame) {
    ctx.strokeStyle = 'rgba(0,60,0,0.07)';
    ctx.lineWidth   = 1;
    const spacing   = 60;
    for (let x = 0; x < this.W; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke();
    }
    for (let y = 0; y < this.H; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke();
    }
  }

  // ── Zombie drawing ─────────────────────────────────────
  _drawZombie(ctx, z) {
    if (!z.alive) return;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(z.angle);

    const flash = z.isFlashing;
    const col   = flash ? '#ffffff' : z.color;
    const body  = flash ? '#ff8888' : z.bodyColor;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, z.size * 0.7, z.size * 0.8, z.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.size * 0.7, z.size, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, -z.size * 0.6, z.size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (glowing red)
    ctx.fillStyle = flash ? '#fff' : '#ff2200';
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 6;
    [-0.15, 0.15].forEach((ox) => {
      ctx.beginPath();
      ctx.arc(ox * z.size, -z.size * 0.65, z.size * 0.10, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Arms (outstretched)
    ctx.strokeStyle = col; ctx.lineWidth = z.size * 0.22;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(-z.size * 0.6, -z.size * 0.1);
    ctx.lineTo(-z.size * 1.1, z.size * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(z.size * 0.6, -z.size * 0.1);
    ctx.lineTo(z.size * 1.1, z.size * 0.3); ctx.stroke();

    // TANK label
    if (z.type === 'TANK') {
      ctx.fillStyle   = '#aaffaa';
      ctx.font        = `bold ${z.size * 0.4}px monospace`;
      ctx.textAlign   = 'center';
      ctx.fillText('⚠', 0, z.size * 0.2);
    }

    ctx.restore();

    // HP bar (above zombie, world space)
    const bw  = z.size * 2.2;
    const bx  = z.x - bw / 2;
    const by  = z.y - z.size - 14;
    ctx.fillStyle = '#220000';
    ctx.fillRect(bx, by, bw, 5);
    const hpColor = z.hpRatio > 0.5 ? '#00ff55' : z.hpRatio > 0.25 ? '#ffaa00' : '#ff2200';
    ctx.fillStyle = hpColor;
    ctx.fillRect(bx, by, bw * z.hpRatio, 5);
  }

  // ── Bullet drawing ─────────────────────────────────────
  _drawBullet(ctx, b) {
    const gun = GUNS[b.gunKey];

    if (b.isRocket) {
      // Rocket: elongated with flame
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      // Body
      ctx.fillStyle = '#ff5500';
      ctx.shadowColor = '#ff3300'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Nose
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(20,0); ctx.lineTo(12,4); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    // Standard bullet
    ctx.shadowColor = b.color;
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur  = 0;
  }

  // ── Crosshair ─────────────────────────────────────────
  _drawCrosshair(ctx, x, y, gunPose, gunKey) {
    const gun   = GUNS[gunKey] || GUNS['PISTOL'];
    const color = gunPose ? gun.bulletColor : 'rgba(255,255,255,0.35)';
    const size  = gunPose ? 22 : 16;
    const width = gunPose ? 2.5 : 1.5;

    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.shadowColor = color;
    ctx.shadowBlur  = gunPose ? 12 : 0;

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.stroke();

    // Cross
    const gap = size + 5;
    const len = 12;
    // Top
    ctx.beginPath(); ctx.moveTo(x, y - gap); ctx.lineTo(x, y - gap - len); ctx.stroke();
    // Bottom
    ctx.beginPath(); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len); ctx.stroke();
    // Left
    ctx.beginPath(); ctx.moveTo(x - gap, y); ctx.lineTo(x - gap - len, y); ctx.stroke();
    // Right
    ctx.beginPath(); ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y); ctx.stroke();

    // Center dot (only in gun pose)
    if (gunPose) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  // ── Damage vignette (red border when low hp) ──────────
  _drawVignette(ctx, playerHP) {
    const alpha = Math.max(0, (60 - playerHP) / 60) * 0.5;
    const grad  = ctx.createRadialGradient(
      this.W/2, this.H/2, this.H * 0.3,
      this.W/2, this.H/2, this.H * 0.8
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(180,0,0,${alpha + 0.18})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  // ── Explosion flash ────────────────────────────────────
  drawExplosionFlash(x, y, radius) {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0,   'rgba(255,220,100,0.9)');
    grad.addColorStop(0.3, 'rgba(255,100,0,0.6)');
    grad.addColorStop(1,   'rgba(255,50,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    this.particles.emitExplosion(x, y, radius);
  }
}
