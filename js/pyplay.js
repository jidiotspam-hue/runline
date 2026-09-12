// Python "Play" mode: real CPython (Pyodide, WebAssembly) running client-side,
// with a small `runline` module bound to an HTML canvas + keyboard/pointer input.
// The user defines setup() and update(dt); JS drives the frame loop.

import { CanvasInput, beep } from "./canvasinput.js";

const PYODIDE_SCRIPT = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";

const RUNLINE_PY = `
import js

def set_size(w, h):
    js.RL.setSize(w, h)

def width():
    return js.RL.canvas.width

def height():
    return js.RL.canvas.height

def clear(color="#000000"):
    js.RL.clear(color)

def rect(x, y, w, h, color="#ffffff"):
    js.RL.rect(x, y, w, h, color)

def stroke_rect(x, y, w, h, color="#ffffff", width=1):
    js.RL.strokeRect(x, y, w, h, color, width)

def circle(x, y, r, color="#ffffff"):
    js.RL.circle(x, y, r, color)

def line(x1, y1, x2, y2, color="#ffffff", width=1):
    js.RL.line(x1, y1, x2, y2, color, width)

def text(x, y, s, color="#ffffff", size=16, align="left"):
    js.RL.text(x, y, str(s), color, size, align)

def key_down(name):
    return bool(js.RL.keyDown(name))

def key_pressed(name):
    return bool(js.RL.keyPressed(name))

def mouse_x():
    return js.RL.mouseX()

def mouse_y():
    return js.RL.mouseY()

def mouse_down():
    return bool(js.RL.mouseDown())

def mouse_pressed():
    return bool(js.RL.mousePressed())

def beep(freq=440, ms=80):
    js.RL.beep(freq, ms)

def stop():
    js.RL.requestStop()
`;

export class PyPlay {
  constructor({ canvas, onStatus, onOutput, onError, onStopped }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = new CanvasInput(canvas);
    this.onStatus = onStatus || (() => {});
    this.onOutput = onOutput || (() => {});
    this.onError = onError || (() => {});
    this.onStopped = onStopped || (() => {});
    this.pyodide = null;
    this.loading = null;
    this.frame = null;
    this.stopRequested = false;
    this.generation = 0;
  }

  // --- API surface reached from Python via js.RL ---
  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }
  clear(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }
  strokeRect(x, y, w, h, color, width) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.strokeRect(x, y, w, h);
  }
  circle(x, y, r, color) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }
  line(x1, y1, x2, y2, color, width) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }
  text(x, y, s, color, size, align) {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px sans-serif`;
    this.ctx.textAlign = align || "left";
    this.ctx.fillText(s, x, y);
    this.ctx.textAlign = "left";
  }
  keyDown(name) {
    return this.input.keysDown.has(name);
  }
  keyPressed(name) {
    return this.input.keysPressed.has(name);
  }
  mouseX() {
    return this.input.mouse.x;
  }
  mouseY() {
    return this.input.mouse.y;
  }
  mouseDown() {
    return this.input.mouse.down;
  }
  mousePressed() {
    return this.input.mouse.pressed;
  }
  beep(freq, ms) {
    beep(freq, ms);
  }
  requestStop() {
    this.stopRequested = true;
  }

  // --- runtime ---
  ensureLoaded() {
    if (this.pyodide) return Promise.resolve(this.pyodide);
    if (this.loading) return this.loading;
    this.loading = (async () => {
      this.onStatus("Loading Python runtime… (first time only, ~10s)");
      await new Promise((resolve, reject) => {
        if (window.loadPyodide) return resolve();
        const s = document.createElement("script");
        s.src = PYODIDE_SCRIPT;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Couldn't download the Python runtime. Check your connection."));
        document.head.appendChild(s);
      });
      const py = await window.loadPyodide();
      py.setStdout({ batched: (line) => this.onOutput(line + "\n") });
      py.setStderr({ batched: (line) => this.onOutput(line + "\n") });
      await py.runPythonAsync(
        `import sys, types\n_m = types.ModuleType("runline")\nexec(${JSON.stringify(RUNLINE_PY)}, _m.__dict__)\nsys.modules["runline"] = _m`
      );
      this.pyodide = py;
      this.onStatus("Ready");
      return py;
    })();
    this.loading.catch(() => (this.loading = null));
    return this.loading;
  }

  stop() {
    this.generation++;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  get running() {
    return this.frame !== null;
  }

  async run(code) {
    this.stop();
    const gen = this.generation;
    this.stopRequested = false;
    this.input.reset();
    window.RL = this;

    const py = await this.ensureLoaded();
    if (gen !== this.generation) return; // stopped or restarted while loading
    // Fresh globals each run so stale state from a previous game can't leak.
    const globals = py.globals.get("dict")();
    globals.set("__name__", "__main__");
    py.runPython(code, { globals });

    const setup = globals.get("setup");
    if (setup) setup();
    const update = globals.get("update");
    if (!update) throw new Error("Define an update(dt) function — it's called every frame.");

    this.canvas.focus({ preventScroll: true });
    let last = performance.now();
    const tick = (now) => {
      if (gen !== this.generation) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      try {
        update(dt);
      } catch (err) {
        this.stop();
        this.onError(err);
        this.onStopped();
        return;
      }
      this.input.endFrame();
      if (this.stopRequested) {
        this.stop();
        this.onStopped();
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
}
