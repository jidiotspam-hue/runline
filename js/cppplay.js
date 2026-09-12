// C++ "Play" mode: clang + wasm-ld compiled to WebAssembly (browsercc) compile the
// user's program in the browser; the result runs against a WASI shim plus an "rl"
// import namespace that draws to the canvas. rl_next_frame() suspends the wasm
// stack until the next animation frame (JSPI), so games are written as a plain loop.

import { CanvasInput, beep } from "./canvasinput.js";

const CC_BASE = "https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/";
const WASI_SHIM = "https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.4.2/dist/index.js";
const CACHE_NAME = "runline-cpp-toolchain-v1";
const BIG_FILES = ["clang.wasm", "lld.wasm", "sysroot.tar"];

export const RUNLINE_H = `#pragma once
// runline.h - drawing + input for C++ games in runline.
// Write your game as a loop: draw, then call rl::next_frame() to wait for the next frame.
#include <string>

#define RL_IMPORT(name) __attribute__((import_module("rl"), import_name(#name)))
extern "C" {
RL_IMPORT(set_size)      void   rl_set_size(int w, int h);
RL_IMPORT(width)         int    rl_width();
RL_IMPORT(height)        int    rl_height();
RL_IMPORT(color)         void   rl_color(const char* css);
RL_IMPORT(clear)         void   rl_clear();
RL_IMPORT(rect)          void   rl_rect(double x, double y, double w, double h);
RL_IMPORT(stroke_rect)   void   rl_stroke_rect(double x, double y, double w, double h, double line_width);
RL_IMPORT(circle)        void   rl_circle(double x, double y, double r);
RL_IMPORT(line)          void   rl_line(double x1, double y1, double x2, double y2, double line_width);
RL_IMPORT(text)          void   rl_text(double x, double y, const char* s, int size, int align);
RL_IMPORT(key_down)      int    rl_key_down(const char* code);
RL_IMPORT(key_pressed)   int    rl_key_pressed(const char* code);
RL_IMPORT(mouse_x)       double rl_mouse_x();
RL_IMPORT(mouse_y)       double rl_mouse_y();
RL_IMPORT(mouse_down)    int    rl_mouse_down();
RL_IMPORT(mouse_pressed) int    rl_mouse_pressed();
RL_IMPORT(beep)          void   rl_beep(int freq, int ms);
RL_IMPORT(time)          double rl_time();
RL_IMPORT(next_frame)    double rl_next_frame();
}

namespace rl {
inline void set_size(int w, int h) { rl_set_size(w, h); }
inline int width() { return rl_width(); }
inline int height() { return rl_height(); }
inline void clear(const char* color = "#000000") { rl_color(color); rl_clear(); }
inline void rect(double x, double y, double w, double h, const char* color = "#ffffff") { rl_color(color); rl_rect(x, y, w, h); }
inline void stroke_rect(double x, double y, double w, double h, const char* color = "#ffffff", double width = 1) { rl_color(color); rl_stroke_rect(x, y, w, h, width); }
inline void circle(double x, double y, double r, const char* color = "#ffffff") { rl_color(color); rl_circle(x, y, r); }
inline void line(double x1, double y1, double x2, double y2, const char* color = "#ffffff", double width = 1) { rl_color(color); rl_line(x1, y1, x2, y2, width); }
inline void text(double x, double y, const std::string& s, const char* color = "#ffffff", int size = 16, const char* align = "left") {
  rl_color(color);
  int a = align[0] == 'c' ? 1 : align[0] == 'r' ? 2 : 0;
  rl_text(x, y, s.c_str(), size, a);
}
inline bool key_down(const char* code) { return rl_key_down(code) != 0; }
inline bool key_pressed(const char* code) { return rl_key_pressed(code) != 0; }
inline double mouse_x() { return rl_mouse_x(); }
inline double mouse_y() { return rl_mouse_y(); }
inline bool mouse_down() { return rl_mouse_down() != 0; }
inline bool mouse_pressed() { return rl_mouse_pressed() != 0; }
inline void beep(int freq = 440, int ms = 80) { rl_beep(freq, ms); }
inline double time() { return rl_time(); }
// Waits for the next animation frame; returns the seconds since the previous frame.
inline double next_frame() { return rl_next_frame(); }
}
`;

export const hasJSPI = typeof WebAssembly.Suspending === "function" && typeof WebAssembly.promising === "function";

// Chrome's HTTP cache refuses to store the ~40 MB toolchain files, so keep our own
// copy in the Cache API and serve browsercc's fetches from it.
let fetchPatched = false;
function patchFetchForToolchain() {
  if (fetchPatched || !("caches" in globalThis)) return;
  fetchPatched = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input && input.url;
    if (url && url.startsWith(CC_BASE) && BIG_FILES.some((n) => url.endsWith(n))) {
      try {
        const hit = await (await caches.open(CACHE_NAME)).match(url);
        if (hit) return hit;
      } catch {
        /* Cache API unavailable (insecure context) — fall through to the network */
      }
    }
    return orig(input, init);
  };
}

async function prefetchToolchain(onProgress) {
  if (!("caches" in globalThis)) return;
  let cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    return;
  }
  let downloaded = 0;
  let total = 0;
  const missing = [];
  for (const name of BIG_FILES) if (!(await cache.match(CC_BASE + name))) missing.push(name);
  if (!missing.length) return;

  const responses = await Promise.all(missing.map((n) => fetch(CC_BASE + n)));
  for (const r of responses) {
    if (!r.ok) throw new Error(`Couldn't download the C++ compiler (${r.status}).`);
    total += Number(r.headers.get("content-length")) || 0;
  }
  await Promise.all(
    responses.map(async (res, i) => {
      const reader = res.body.getReader();
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        downloaded += value.length;
        if (total) onProgress(`Downloading C++ compiler… ${Math.round((downloaded / total) * 100)}% (one time, ~28 MB)`);
      }
      const buf = new Blob(chunks);
      await cache.put(
        CC_BASE + missing[i],
        new Response(buf, { headers: { "Content-Type": res.headers.get("content-type") || "application/octet-stream" } })
      );
    })
  );
}

export class CppPlay {
  constructor({ canvas, onStatus, onOutput, onError, onStopped }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = new CanvasInput(canvas);
    this.onStatus = onStatus || (() => {});
    this.onOutput = onOutput || (() => {});
    this.onError = onError || (() => {});
    this.onStopped = onStopped || (() => {});
    this.toolchain = null;
    this.loading = null;
    this.compiling = null;
    this.generation = 0;
    this.active = false;
    this.moduleCache = new Map(); // source -> compiled WebAssembly.Module
  }

  get running() {
    return this.active;
  }

  ensureLoaded() {
    if (this.toolchain) return Promise.resolve(this.toolchain);
    if (this.loading) return this.loading;
    this.loading = (async () => {
      patchFetchForToolchain();
      await prefetchToolchain(this.onStatus);
      this.onStatus("Loading C++ compiler…");
      const [cc, shim] = await Promise.all([import(CC_BASE + "index.js"), import(WASI_SHIM)]);
      this.toolchain = { cc, shim };
      return this.toolchain;
    })();
    this.loading.catch(() => (this.loading = null));
    return this.loading;
  }

  stop() {
    this.generation++;
    if (this.active) {
      this.active = false;
      this.onStopped();
    }
  }

  async compile(source) {
    const cached = this.moduleCache.get(source);
    if (cached) return { module: cached, compileOutput: "" };
    const { cc } = await this.ensureLoaded();
    if (this.compiling) await this.compiling.catch(() => {}); // clang isn't re-entrant
    this.onStatus("Compiling C++…");
    this.compiling = cc.compile({
      source,
      fileName: "main.cpp",
      // The sysroot's libc++ is built without exception support, so match it.
      flags: ["-std=c++20", "-O2", "-fno-exceptions"],
      extraFiles: { "runline.h": RUNLINE_H },
    });
    const result = await this.compiling.finally(() => (this.compiling = null));
    if (result.module) {
      this.moduleCache.clear();
      this.moduleCache.set(source, result.module);
    }
    return result;
  }

  makeImports(gen, getMemory) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const input = this.input;
    const alive = () => {
      if (gen !== this.generation) throw new Error("stopped");
    };
    const str = (ptr) => {
      const mem = new Uint8Array(getMemory().buffer);
      let end = ptr;
      while (end < mem.length && mem[end] !== 0) end++;
      return new TextDecoder().decode(mem.subarray(ptr, end));
    };
    let last = performance.now();
    const nextFrame = () =>
      new Promise((resolve, reject) => {
        requestAnimationFrame((now) => {
          if (gen !== this.generation) return reject(new Error("stopped"));
          input.endFrame();
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          resolve(dt);
        });
      });
    return {
      set_size: (w, h) => { alive(); canvas.width = w; canvas.height = h; },
      width: () => canvas.width,
      height: () => canvas.height,
      color: (p) => { ctx.fillStyle = ctx.strokeStyle = str(p); },
      clear: () => { alive(); ctx.fillRect(0, 0, canvas.width, canvas.height); },
      rect: (x, y, w, h) => { alive(); ctx.fillRect(x, y, w, h); },
      stroke_rect: (x, y, w, h, lw) => { alive(); ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); },
      circle: (x, y, r) => { alive(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); },
      line: (x1, y1, x2, y2, lw) => { alive(); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
      text: (x, y, p, size, align) => {
        alive();
        ctx.font = `${size}px sans-serif`;
        ctx.textAlign = align === 1 ? "center" : align === 2 ? "right" : "left";
        ctx.fillText(str(p), x, y);
        ctx.textAlign = "left";
      },
      key_down: (p) => (input.keysDown.has(str(p)) ? 1 : 0),
      key_pressed: (p) => (input.keysPressed.has(str(p)) ? 1 : 0),
      mouse_x: () => input.mouse.x,
      mouse_y: () => input.mouse.y,
      mouse_down: () => (input.mouse.down ? 1 : 0),
      mouse_pressed: () => (input.mouse.pressed ? 1 : 0),
      beep: (f, ms) => beep(f, ms),
      time: () => performance.now() / 1000,
      next_frame: new WebAssembly.Suspending(nextFrame),
    };
  }

  async run(source) {
    this.stop();
    if (!hasJSPI) {
      throw new Error("C++ Play needs a browser with WebAssembly JSPI (Chrome 137 or newer). Console mode still works.");
    }
    const gen = ++this.generation;
    this.input.reset();

    const { module, compileOutput } = await this.compile(source);
    if (gen !== this.generation) return;
    if (compileOutput.trim()) this.onOutput(compileOutput.trim() + "\n");
    if (!module) {
      this.onStatus("Compile failed");
      throw new Error("Compile failed — see the messages under the canvas.");
    }

    const { WASI, File, OpenFile, ConsoleStdout, WASIProcExit } = this.toolchain.shim;
    const out = new TextDecoder();
    const err = new TextDecoder();
    const fds = [
      new OpenFile(new File(new Uint8Array(0))),
      new ConsoleStdout((d) => this.onOutput(out.decode(d, { stream: true }))),
      new ConsoleStdout((d) => this.onOutput(err.decode(d, { stream: true }))),
    ];
    const wasi = new WASI(["main"], [], fds);
    let instance;
    instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.wasiImport,
      rl: this.makeImports(gen, () => instance.exports.memory),
    });
    wasi.inst = instance;

    this.onStatus("Ready");
    this.active = true;
    this.canvas.focus({ preventScroll: true });

    // The program runs until it exits or is stopped; resolve now so the UI can
    // show the Stop button while it plays.
    (async () => {
      try {
        await WebAssembly.promising(instance.exports._start)();
        if (gen === this.generation) this.onOutput("[program finished]\n");
      } catch (e) {
        if (e instanceof WASIProcExit) {
          if (gen === this.generation) this.onOutput(`[program exited with code ${e.code}]\n`);
        } else if (!(e && e.message === "stopped")) {
          if (gen === this.generation) this.onError(e);
        }
      } finally {
        if (gen === this.generation) {
          this.active = false;
          this.onStopped();
        }
      }
    })();
  }
}
