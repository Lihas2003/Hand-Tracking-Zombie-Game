/**
 * handTracker.js
 * Initialises MediaPipe Hands and streams landmark data
 * via a callback every frame the camera fires.
 */

export class HandTracker {
  /**
   * @param {Function} onResultsCb  Called each frame with { landmarks, handedness }
   *                                landmarks = array of 21 {x,y,z} objects (null if no hand)
   */
  constructor(onResultsCb) {
    this.onResultsCb = onResultsCb;
    this.ready       = false;
    this.camera      = null;
    this.hands       = null;
  }

  // ── Public: start tracking ─────────────────────────────
  async init(onLoadProgress) {
    onLoadProgress?.('Loading MediaPipe Hands model…', 30);

    // 1. Create Hands instance
    this.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`
    });

    this.hands.setOptions({
      maxNumHands:            1,
      modelComplexity:        1,
      minDetectionConfidence: 0.78,
      minTrackingConfidence:  0.72,
    });

    this.hands.onResults((results) => this._handleResults(results));

    onLoadProgress?.('Starting webcam…', 60);

    // 2. Attach to <video id="webcam">
    const videoEl = document.getElementById('webcam');

    await new Promise((resolve, reject) => {
      this.camera = new Camera(videoEl, {
        onFrame: async () => {
          if (this.hands) {
            await this.hands.send({ image: videoEl });
          }
        },
        width:  1280,
        height: 720,
      });

      this.camera.start()
        .then(() => {
          this.ready = true;
          onLoadProgress?.('Hand tracker ready!', 100);
          resolve();
        })
        .catch(reject);
    });
  }

  // ── Public: stop tracking ──────────────────────────────
  stop() {
    this.camera?.stop();
    this.ready = false;
  }

  // ── Private: process results ───────────────────────────
  _handleResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      // No hand detected
      this.onResultsCb({ landmarks: null, handedness: null });
      return;
    }

    const landmarks   = results.multiHandLandmarks[0];   // 21 points [{x,y,z}, …]
    const handedness  = results.multiHandedness?.[0]?.label ?? 'Right'; // 'Left' | 'Right'

    this.onResultsCb({ landmarks, handedness });
  }
}

// ── Landmark index constants (MediaPipe naming) ─────────
export const LM = {
  WRIST:       0,
  THUMB_CMC:   1,  THUMB_MCP:   2,  THUMB_IP:    3,  THUMB_TIP:   4,
  INDEX_MCP:   5,  INDEX_PIP:   6,  INDEX_DIP:   7,  INDEX_TIP:   8,
  MIDDLE_MCP:  9,  MIDDLE_PIP:  10, MIDDLE_DIP:  11, MIDDLE_TIP:  12,
  RING_MCP:    13, RING_PIP:    14, RING_DIP:    15, RING_TIP:    16,
  PINKY_MCP:   17, PINKY_PIP:   18, PINKY_DIP:   19, PINKY_TIP:   20,
};