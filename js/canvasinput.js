// Keyboard + pointer state for a game canvas, shared by the Play runtimes.
// keysPressed / mouse.pressed are edge-triggered and cleared by endFrame().

export class CanvasInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, pressed: false };

    canvas.addEventListener("keydown", (e) => {
      if (!this.keysDown.has(e.code)) this.keysPressed.add(e.code);
      this.keysDown.add(e.code);
      if (!e.metaKey && !e.ctrlKey) e.preventDefault();
    });
    canvas.addEventListener("keyup", (e) => this.keysDown.delete(e.code));
    canvas.addEventListener("blur", () => this.keysDown.clear());

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.focus();
      pos(e);
      this.mouse.down = true;
      this.mouse.pressed = true;
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", pos);
    canvas.addEventListener("pointerup", () => (this.mouse.down = false));
    canvas.addEventListener("pointercancel", () => (this.mouse.down = false));
  }

  reset() {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.mouse.down = false;
    this.mouse.pressed = false;
  }

  endFrame() {
    this.keysPressed.clear();
    this.mouse.pressed = false;
  }
}

let audioCtx = null;
export function beep(freq, ms) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + ms / 1000);
  } catch {
    /* audio not available */
  }
}
