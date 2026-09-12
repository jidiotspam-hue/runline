# runline

A code editor that runs in the browser — including on a Chromebook with no Linux, no terminal and nothing to install. Write HTML/JS, Python, Java or C++ and **play what you build**.

**Live:** https://jidiotspam-hue.github.io/runline/

## What it does

| Language | Console | Play (canvas games) |
|---|---|---|
| HTML / CSS / JS | — | Whole multi-file projects (images, sounds, several scripts) preview in a sandboxed frame. |
| Python | Judge0 (remote) | Real CPython via [Pyodide](https://pyodide.org) in the browser, with a small `runline` drawing/input module. |
| C++ | Judge0 (remote) | clang + wasm-ld compiled to WebAssembly ([browsercc](https://github.com/BertalanD/browsercc)) compile your program *in the browser*; it runs against a WASI shim plus a `runline.h` canvas API. |
| Java | Judge0 (remote) | — |

- **Interactive console.** Programs that read stdin are playable: type a line under the output and the program is re-run with everything typed so far, spliced into a terminal-style transcript. Keep programs deterministic (seed your RNG) so the transcript lines up.
- **Bring in real games.** `Open ▾ → Import from GitHub URL` downloads a public repo straight into a project; `.zip` (GitHub's *Download ZIP*) and folder drag-and-drop work too. Asset paths such as `img.src = "img/bird.png"` resolve to project files, even when built at runtime.
- **Projects persist** in IndexedDB; multiple projects, rename/delete, download as zip.
- **No backend.** GitHub Pages serves static files; Pyodide, the C++ toolchain and JSZip are pulled from jsDelivr on first use and cached. Console mode uses the free public [Judge0](https://judge0.com) instance.

## Play API

Python:

```python
import runline as rl

def setup():
    rl.set_size(480, 320)

def update(dt):
    rl.clear("#222")
    if rl.key_down("ArrowRight"): ...
    rl.rect(x, y, 24, 24, "#2ecc71")
    rl.text(10, 24, "Score: 0", "white", 16)
```

C++ (`#include "runline.h"`, same functions in `rl::`, written as a loop):

```cpp
int main() {
  rl::set_size(480, 320);
  double dt = 1.0 / 60;
  while (true) {
    rl::clear("#222");
    if (rl::key_pressed("Space")) ...
    rl::rect(x, y, 24, 24, "#2ecc71");
    dt = rl::next_frame();   // waits for the next animation frame
  }
}
```

Full reference: the **?** button in the toolbar.

## Limits worth knowing

- C++ Play needs WebAssembly JSPI (Chrome 137+; ChromeOS is fine). First use downloads ~28 MB of compiler once. Exceptions are not supported.
- Console mode depends on the public Judge0 instance being up and not rate-limiting.
- The preview's asset resolution covers `src`/`href` attributes, CSS `url()`, `Image`/`Audio`/`fetch`/XHR paths and `setAttribute` — not, for example, module `import` graphs or paths passed to a Service Worker.

## Development

Static files only. Serve the folder with anything (`npx serve .`) and open it; ES modules need http(s), not `file://`. `spikes/` holds the feasibility experiments (with their findings in `NOTES.md`) that led to the C++ and Java integrations.
