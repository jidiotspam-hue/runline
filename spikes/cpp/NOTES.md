# Spike: compile and run C++ entirely in the browser

Date: 2026-09-12. Verified live in the Browser pane (Chrome) against `spikes/cpp/index.html`
served by `npx serve` on port 4561 (`preview_start {name:"spike-cpp"}`).

## Verdict: viable

Arbitrary C++ (clang 20.1.2 targeting wasm32-wasi, full libc++) compiles and runs
client-side with no server, and C++ can call JS-implemented functions declared via
`__attribute__((import_module("rl"), import_name("rect")))`, so a canvas/keyboard
game API is straightforward. JSPI (`WebAssembly.Suspending`, Chrome 137+) lets a plain
`for` game loop in C++ block on the next animation frame.

Measured in this spike (M-series Mac, self-hosted assets from localhost):

| step | first use | warm |
|---|---|---|
| download clang.wasm + lld.wasm + sysroot.tar | ~1.3 s (gzip, 28 MB on the wire, 94 MB decoded) | 0 (memory) |
| `#include <cstdio>` hello: compile + link | 1620 ms (includes wasm instantiation) | 1415-1630 ms |
| run hello | <1 ms | |
| canvas demo, 600 frames with JSPI `rl_next_frame` | 4971 ms (= 60 fps) | |
| same from jsDelivr CDN (cross-origin, brotli 27.6 MB) | 1853 ms compile+link incl. ~1.1 s download | |

Compile errors come back as normal clang diagnostics (file:line:col, caret, "2 errors generated.").

## What was used

**browsercc 0.1.1** (npm, MIT, by Daniel Bertalan, published 2025-04-19,
repo https://github.com/BertalanD/browsercc). It is clang + wasm-ld built with Emscripten
(so they run as ordinary Emscripten modules with a MEMFS), plus a wasi-sdk sysroot tarball.
Chosen over binji/wasm-clang because it is a current LLVM (20.1.2), targets
`wasi_snapshot_preview1`, exposes the real clang driver (so `-std=c++20`, `-O2`, `-I`,
`-D` etc. all work), and ships as a single npm package with CORS-enabled hosting on jsDelivr.

Assets (raw size / brotli on jsDelivr / gzip from `serve`):

| file | URL (`https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/` + name) | raw | br | gzip |
|---|---|---|---|---|
| clang.wasm | clang.wasm | 42,553,880 | 13.9 MB | 14.3 MB |
| lld.wasm | lld.wasm | 23,202,572 | 8.1 MB | 8.4 MB |
| sysroot.tar | sysroot.tar (1594 entries: wasi-libc, libc++, libc++abi, compiler-rt, crt1.o) | 28,620,800 | 5.5 MB | 5.5 MB |
| clang.js / lld.js / index.js | Emscripten glue + compile() API | 74 KB / 72 KB / 5 KB | | |
| stdc++.h.pch (optional) | precompiled STL header, only used with `-O2 -std=c++20 -fno-exceptions` | 19,359,928 | | |

Total needed: **94.4 MB decoded, ~27.5 MB compressed** on the wire. The PCH is not used by the spike.
All files return `access-control-allow-origin: *` from jsDelivr, so they can be fetched cross-origin
from GitHub Pages without self-hosting. Largest single file is 42.5 MB, under GitHub's 100 MB
hard limit (and under the 50 MB warning threshold), so self-hosting on Pages is also allowed.

**@bjorn3/browser_wasi_shim 0.4.2** (MIT/Apache-2.0, 80 KB) provides the
`wasi_snapshot_preview1` imports (fd_write, proc_exit, clock, args...) for the *compiled
program*. Copied into `assets/wasi_shim/`.

Everything is copied into `spikes/cpp/assets/` (90 MB total; `?cdn=1` switches the page to jsDelivr).
`git check-ignore` shows the assets are NOT ignored, so do not commit them as-is (see pitfalls).

## Exact invocation

```js
import { compile } from "./assets/browsercc/index.js";           // or the jsDelivr URL
import { WASI, File, OpenFile, ConsoleStdout, WASIProcExit } from "./assets/wasi_shim/index.js";

// 1. compile + link. browsercc runs `clang++ main.cpp -std=c++20 -O2 -###` to get the
//    cc1 and wasm-ld command lines, runs cc1 to an .o, then wasm-ld against the sysroot.
const { module, compileOutput } = await compile({
  source, fileName: "main.cpp", flags: ["-std=c++20", "-O2"],
  // extraFiles: { "util.h": "..." }   // multi-file projects: written into the compiler FS
});
if (!module) showErrors(compileOutput);       // clang diagnostics, stderr text

// 2. instantiate with WASI + our own "rl" import namespace
const fds = [new OpenFile(new File(new Uint8Array(0))),           // stdin
             new ConsoleStdout(d => log(dec.decode(d))),           // stdout
             new ConsoleStdout(d => log(dec.decode(d)))];          // stderr
const wasi = new WASI(["main"], [], fds);
const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: wasi.wasiImport,
  rl: {
    clear: () => ctx.clearRect(0, 0, cv.width, cv.height),
    color: (r, g, b) => { ctx.fillStyle = `rgb(${r},${g},${b})`; },
    rect:  (x, y, w, h) => ctx.fillRect(x, y, w, h),
    key:   (code) => keysDown.has(code) ? 1 : 0,
    next_frame: new WebAssembly.Suspending(() => new Promise(requestAnimationFrame)),
  },
});
wasi.inst = instance;
try { await WebAssembly.promising(instance.exports._start)(); }
catch (e) { if (e instanceof WASIProcExit) exitCode = e.code; else throw e; }
```

C++ side (this exact code was compiled and run in the spike):

```cpp
#define RL(name) __attribute__((import_module("rl"), import_name(#name)))
RL(clear)      void rl_clear();
RL(color)      void rl_color(int r, int g, int b);
RL(rect)       void rl_rect(int x, int y, int w, int h);
RL(key)        int  rl_key(int keyCode);
RL(next_frame) void rl_next_frame();   // suspends the wasm stack until the next rAF

int main() {
  for (int frame = 0; frame < 600; frame++) {
    if (rl_key(39)) x += 3;
    rl_clear(); rl_color(255,120,0); rl_rect(x, y, 40, 40);
    rl_next_frame();
  }
}
```

No linker flags are needed: undeclared imports are simply left as wasm imports by wasm-ld
when they carry `import_module`/`import_name`. Both the `rl` and `wasi_snapshot_preview1`
namespaces coexist in one import object.

## How a runline canvas/keyboard binding would be wired

1. Ship a header `runline.h` in `extraFiles` that declares the `rl_*` imports (and thin C++
   wrappers: `rl::rect(...)`, `rl::text(...)`, `rl::key_down(Key::Left)`). Users
   `#include "runline.h"`.
2. On the JS side, one object per namespace: drawing calls forward to a 2D context
   (`fillRect`, `strokeRect`, `arc`, `fillText`, `drawImage` from a preloaded sprite table),
   input calls read a `Set` filled by `keydown`/`keyup` on the canvas (plus mouse x/y/buttons),
   `rl_next_frame` is a `WebAssembly.Suspending` wrapping `requestAnimationFrame`,
   `rl_time_ms` returns `performance.now()`.
3. Strings cross the boundary as `(ptr, len)` into `instance.exports.memory.buffer`, same
   as `fd_write` does.
4. Run the program in a **Worker** with an `OffscreenCanvas` (`canvas.transferControlToOffscreen()`)
   so an infinite loop cannot freeze the editor and Stop is `worker.terminate()`. Keyboard
   state is forwarded by `postMessage` into a `SharedArrayBuffer`-free Set on the worker
   side (or plain messages, since the worker yields every frame via JSPI).
   `requestAnimationFrame` exists in dedicated workers in Chrome, so the JSPI trick
   works there too.
5. Without JSPI (Safari, older browsers) fall back to a callback style: user writes
   `void rl_frame()` and JS drives it from rAF; `main()` just sets up. The spike already
   detects `WebAssembly.Suspending` and reports it in the status line.

## Licensing

- clang/LLVM/lld: Apache-2.0 with LLVM exceptions.
- wasi-libc: Apache-2.0 / MIT / BSD (musl); libc++, libc++abi, compiler-rt: Apache-2.0 with LLVM exceptions. All redistributable; ship the LICENSE texts alongside the wasm.
- browsercc glue and build scripts: MIT.
- @bjorn3/browser_wasi_shim: MIT or Apache-2.0.
- No license requires attribution in the UI; a credits line is polite.

## Pitfalls found

1. **Browser HTTP cache refuses the big files.** Chrome logged `net::ERR_CACHE_WRITE_FAILURE`
   for clang.wasm/lld.wasm/sysroot.tar three times, i.e. the ~40 MB responses were not stored in
   the disk cache, so every page load would re-download 27 MB. Fix: fetch once, store the
   `ArrayBuffer`s in the Cache API or IndexedDB/OPFS (no size problem there), and hand them to
   Emscripten via `locateFile`/`instantiateWasm`, or better, cache the compiled
   `WebAssembly.Module` in IndexedDB so instantiation is also skipped.
2. **browsercc's `compile()` is wasteful**: it instantiates clang twice per compile (once with
   `-###` to get the driver command lines, once to actually compile), and re-extracts the
   28 MB sysroot tar into both the clang and lld MEMFS on every call. That is why a warm
   hello-world still takes ~1.4 s. The `-###` result is deterministic for a given flag set,
   so cache it; keep the clang/lld instances alive between compiles (the FS persists).
   Expect ~0.3-0.5 s per compile after that. The resource log shows clang.wasm requested
   twice on first use for this reason.
3. **Compile blocks the main thread** for ~1.5 s in the spike. Move `compile()` into a Worker
   (the Emscripten glue detects `WorkerGlobalScope`). Do it in the same worker that runs the program.
4. **Memory**: clang.wasm + lld.wasm + two sysroot copies in MEMFS sits around 300-400 MB
   of JS heap on first compile. Fine on a 4 GB Chromebook, but do not also keep Pyodide
   loaded in the same tab. Consider tearing the compiler worker down after N minutes idle.
5. **JSPI needed for the blocking `rl_next_frame` style.** Chrome 137+ (ChromeOS is
   evergreen, so fine); Firefox has shipped it per the interop tracker; Safari has not.
   Feature-detect and offer the callback style as fallback.
6. **stdin / `std::cin`**: WASI `fd_read` on stdin is synchronous. Either preload input
   text into the `File` before running (works today) or wrap `fd_read` in
   `WebAssembly.Suspending` to prompt the user interactively (same JSPI trick).
7. **Exceptions**: wasi-sdk's libc++ in this sysroot is built with exceptions disabled
   (the PCH is only valid with `-fno-exceptions`); `throw` will likely fail at link or
   trap. Not tested; steer users to error codes or test before promising it.
8. **First-run download** is ~27.5 MB compressed. On a school Chromebook on shared Wi-Fi
   (say 20 Mbit/s) that is 10-15 s once, then cached (see 1). Show a progress bar; the
   `Content-Length` headers are present. Prefetch when the user selects C++.
9. **Repo size**: committing 90 MB of assets to `runline` bloats every clone forever.
   Prefer loading from jsDelivr (CORS ok, brotli, pinned to `browsercc@0.1.1`) or put the
   assets in a separate `runline-cpp-assets` Pages repo. If self-hosting on Pages, GitHub
   serves gzip (binji's 31 MB clang came back as 10.7 MB) so wire size is similar.
10. `serve`/GitHub Pages both send `application/wasm`, so `instantiateStreaming` works.

## Alternatives examined

- **binji/wasm-clang** (https://github.com/binji/wasm-clang, demo https://binji.github.io/wasm-clang/).
  Assets on binji.github.io with `access-control-allow-origin: *`:
  `clang` 31,214,472 B, `lld` 19,490,094 B, `memfs` 345,442 B, `sysroot.tar` 9,297,920 B
  (60 MB total; 10.7 MB gzip for clang). Built for CppCon 2019 from a 2019 LLVM fork; the
  binaries import the obsolete `wasi_unstable` namespace and the driver is bypassed
  (`clang -cc1 -emit-obj -isysroot / ...` then `wasm-ld --no-threads --export-dynamic -z stack-size=1048576
  crt1.o main.o -lc -lc++ -lc++abi -lcanvas`). It already demonstrates the exact import
  pattern we want (its `-lcanvas` library + `env.canvas_*` JS imports draw to a canvas), which
  is what confirmed the approach. Smaller, but frozen at a 2019 clang, needs its custom
  `memfs` wasm, and has no C++20. Use as fallback only.
- **Emception** (https://github.com/jprendes/emception, demo https://jprendes.github.io/emception/).
  Full Emscripten (llvm-box + binaryen-box + Python-in-wasm for emcc) so programs get the
  Emscripten runtime, SDL etc. Third-party estimates put the distribution around 150 MB
  compressed; the demo lazy-loads brotli `.pack` bundles through a worker. Heavier, less
  maintained (last releases 2022-2023), and the Emscripten runtime is not needed for our
  tiny `rl_*` API. Ruled out for size/complexity, not for feasibility.
- **Judge0 / Piston** (status quo): needs network and a third-party server, no canvas,
  rate-limited. Keep as fallback only for browsers without wasm/JSPI.
- Not pursued: tcc-in-wasm (C only, no libc++), Cheerp (proprietary toolchain, native binary).

## Recommendation

Adopt browsercc + browser_wasi_shim. Concretely for runline:

1. Load `browsercc@0.1.1` from jsDelivr (pinned) in a dedicated `cpp.worker.js`; cache the
   three big buffers in the Cache API on first fetch and show a progress bar.
2. Hoist the clang/lld instances out of `compile()` (fork the 140-line `index.js`) so
   repeat compiles are sub-second.
3. Ship `runline.h` with the `rl_*` imports; render into an `OffscreenCanvas` in the worker;
   `Stop` = `worker.terminate()`.
4. Keep the Judge0 path only as a fallback when `WebAssembly.Suspending` is missing.
