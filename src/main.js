/**
 * main.js
 * Entry point: initialises hand tracker, creates game,
 * handles UI screens (loading → start → playing → game-over),
 * and pipes gesture data into the game each frame.
 */

import { HandTracker }     from './handTracker.js';
import { GestureDetector } from './gestureDetector.js';
import { Game, STATE }     from './game.js';

// ── DOM refs ───────────────────────────────────────────────
const loadingScreen  = document.getElementById('loadingScreen');
const startScreen    = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hud            = document.getElementById('hud');
const canvas         = document.getElementById('gameCanvas');
const startBtn       = document.getElementById('startBtn');
const restartBtn     = document.getElementById('restartBtn');
const loadBar        = document.getElementById('loadBar');
const loadTip        = document.getElementById('loadTip');
const waveAnnounce   = document.getElementById('waveAnnounce');
const waveText       = document.getElementById('waveText');

// ── HUD elements ───────────────────────────────────────────
const hudScore     = document.getElementById('hudScore');
const hudWave      = document.getElementById('hudWave');
const hudGunName   = document.getElementById('hudGunName');
const hudAmmo      = document.getElementById('hudAmmo');
const hudHealth    = document.getElementById('hudHealth');
const healthBar    = document.getElementById('healthBar');
const gestureStatus= document.getElementById('gestureStatus');
const finalScore   = document.getElementById('finalScore');
const finalWave    = document.getElementById('finalWave');

// ── FIX: Declare game before calling resizeCanvas ───────────
let game = null;

// ── Resize canvas to window ─────────────────────────────────
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  // This will now safely skip until game is actually initialized
  if (game) game.renderer.resize(canvas.width, canvas.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Instantiate systems ─────────────────────────────────────
const tracker  = new HandTracker(onHandResults);
const detector = new GestureDetector();

// Assign the game instance to the previously declared variable
game = new Game(canvas);

// Current gesture state passed to game
let gestureState = {
  aimX:      canvas.width  / 2,
  aimY:      canvas.height / 2,
  gunPose:   false,
  shoot:     false,
  switchGun: false,
  reload:    false,
};

// ── Hand results callback ───────────────────────────────────
function onHandResults({ landmarks }) {
  const result = detector.detect(landmarks, canvas.width, canvas.height);

  gestureState = {
    aimX:      result.aimX,
    aimY:      result.aimY,
    gunPose:   result.gunPose,
    shoot:     result.shoot,
    switchGun: result.switch,
    reload:    result.reload,
  };

  // Forward to game every frame
  if (game && game.state === STATE.PLAYING) {
    game.updateGesture(gestureState);
  }
}

// ── Loading sequence ────────────────────────────────────────
async function bootstrap() {
  function setLoad(msg, pct) {
    loadTip.textContent  = msg;
    loadBar.style.width  = pct + '%';
  }

  setLoad('Requesting webcam access…', 10);

  try {
    await tracker.init(setLoad);
  } catch (err) {
    setLoad('⚠ Webcam access denied. Please allow camera and reload.', 0);
    console.error(err);
    return;
  }

  setLoad('Ready!', 100);
  await sleep(600);

  // Show start screen
  loadingScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
  game.state = STATE.START;
}

// ── Start button ────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  game.setHUDCallback(updateHUD);
  game.setGameOverCallback(showGameOver);
  game.setWaveStartCallback(showWaveAnnounce);
  game.start();
});

// ── Restart button ───────────────────────────────────────────
restartBtn.addEventListener('click', () => {
  gameOverScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  game = new Game(canvas);
  game.setHUDCallback(updateHUD);
  game.setGameOverCallback(showGameOver);
  game.setWaveStartCallback(showWaveAnnounce);
  game.restart();
});

// ── HUD update callback ─────────────────────────────────────
function updateHUD(data) {
  hudScore.textContent   = data.score;
  hudWave.textContent    = data.wave;
  hudGunName.textContent = data.gunName + (data.reloading ? ' [RELOAD]' : '');
  hudAmmo.textContent    = data.ammo === -1 ? '∞' : data.ammo;
  hudHealth.textContent  = Math.ceil(data.health);
  healthBar.style.width  = data.health + '%';

  // Colour health bar
  const hp = data.health;
  healthBar.style.background =
    hp > 60 ? 'linear-gradient(90deg, #880000, #cc0000)' :
    hp > 30 ? 'linear-gradient(90deg, #994400, #ff6600)' :
              'linear-gradient(90deg, #cc0000, #ff2222)';

  gestureStatus.textContent = data.gesture;
  gestureStatus.style.color = data.gesture.includes('✓') ? '#00ff88' : '#ff8800';

  // Update gun slots
  document.querySelectorAll('.gun-slot').forEach((s) => {
    s.classList.toggle('active', s.dataset.gun === data.gunKey);
  });
}

// ── Game over ────────────────────────────────────────────────
function showGameOver({ score, wave }) {
  hud.classList.add('hidden');
  finalScore.textContent = score;
  finalWave.textContent  = wave;
  gameOverScreen.classList.remove('hidden');
}

// ── Wave announce ─────────────────────────────────────────────
let _waveTimer = null;
function showWaveAnnounce(wave) {
  waveText.textContent = `WAVE  ${wave}`;
  waveAnnounce.classList.remove('hidden');
  if (_waveTimer) clearTimeout(_waveTimer);
  _waveTimer = setTimeout(() => {
    waveAnnounce.classList.add('hidden');
  }, 2500);
}

// ── Keyboard fallback (dev / desktop testing) ────────────────
// Space = shoot  |  F = shoot  |  R = reload  |  Q/E = switch gun
window.addEventListener('keydown', (e) => {
  if (game && game.state !== STATE.PLAYING) return;
  if (e.code === 'Space' || e.code === 'KeyF') {
    game.updateGesture({
      ...gestureState,
      aimX:    gestureState.aimX || canvas.width  / 2,
      aimY:    gestureState.aimY || canvas.height / 2,
      gunPose: true,
      shoot:   true,
    });
  }
  if (e.code === 'KeyR') {
    game.updateGesture({ ...gestureState, reload: true });
  }
  if (e.code === 'KeyE') {
    game.updateGesture({ ...gestureState, switchGun: true });
  }
});

// Move aim with mouse for desktop testing
window.addEventListener('mousemove', (e) => {
  gestureState.aimX = e.clientX;
  gestureState.aimY = e.clientY;
  gestureState.gunPose = true; // mouse = always in gun pose
});

window.addEventListener('click', () => {
  if (game && game.state !== STATE.PLAYING) return;
  game.updateGesture({ ...gestureState, shoot: true });
});

// ── Helpers ───────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Kick everything off ───────────────────────────────────────
bootstrap();