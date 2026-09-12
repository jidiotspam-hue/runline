# Java-in-the-browser spike: CheerpJ

Date: 2026-09-12. Verdict: **works.** Arbitrary Java 8 source is compiled with the real
`javac` (from `tools.jar`) inside the browser and run, including Swing/AWT with a
`javax.swing.Timer` animation loop and `KeyListener` arrow-key input, with no backend.
Everything below was verified against the live docs source
(`github.com/leaningtech/labs`, `sites/cheerpj/src/content/docs/`) and by running
`spikes/java/index.html` in the Browser pane. `cheerpj.com/docs` itself returns 403 to
non-browser fetchers, so the docs were read from the repo that builds the site.

## What was verified end to end

| Test | Result |
| --- | --- |
| Console program `System.out.println("hi from java")` | Output captured in page. Compile 1.0–1.6 s warm, run 0.6 s. |
| Swing: JFrame + JPanel painting a moving square, `Timer(16)` animation, `KeyListener` | Renders inside the page, animates at full rate (60 log lines/s), arrows move the square, `last key: Left` drawn on canvas. |
| Compile error | javac diagnostics (`/str/Main.java:3: error: incompatible types ...`, caret line, `2 errors`) shown; exit code 1; nothing runs. |
| Run again with different code | New class bytes are picked up every time (per-run output dir + fresh runner JVM). |
| Stop a running Swing program | Immediate; timer output stops (frame count frozen), windows gone. |
| Run while a Swing program is still alive | Previous program is killed, new one starts. |
| Class renamed (`public class Game`) | Derived main class is run; stale `Main.class` from the previous run cannot be picked up. |

## Exact integration recipe

### Loader

```html
<script src="https://cjrtnc.leaningtech.com/4.3/loader.js"></script>
```

CheerpJ **4.3** (changelog: released 2026-04-21) is the newest build on the CDN;
`4.4`, `4.5`, `5.0` return HTTP 204 (do not exist). The loader is 2.5 KB and only
defines the global API; `cj3.js`, `cj3.wasm`, `cj3n8.wasm`, `cheerpOS.js` and the
runtime jars are fetched on demand from the same path. All CDN files are served with
`cache-control: max-age=31536000`. Do **not** self-host: the Community License only
covers loading from `cjrtnc.leaningtech.com`.

Globals exposed by the loader (from `loader.js`): `cheerpjInit`, `cheerpjRunMain`,
`cheerpjRunJar`, `cheerpjRunLibrary`, `cheerpjCreateDisplay`, `cheerpOSAddStringFile`,
`cheerpOSRemoveStringFile`, `cjFileBlob`, `cjGetRuntimeResources`,
`cjGetProguardConfiguration`, `dumpAllThreads` (undocumented, prints a thread dump).

### Init

```js
await cheerpjInit({ version: 8, status: 'none' });
```

- `version`: 8 | 11 | 17. Use **8** because the bundled `tools.jar` is the JDK 8 javac
  and Java 8 has the most complete AWT/Swing support. (Java 17 support is newer and
  was not tested here.)
- `status: 'none'` suppresses CheerpJ's own "Loading..." overlays.
- Other options that matter for a code editor: `javaProperties: ['k=v', ...]`
  (equivalent of `-D`), `overrideShortcuts(evt) => bool` (let Java see browser
  shortcuts like Ctrl+F), `clipboardMode: 'permission'`, `enableInputMethods`
  (default true since 4.0), `licenseKey` (removes the banner; commercial only).
- Must be served over http(s); `file://` does not work.
- One `cheerpjInit` per page/JVM. Measured init: 21–95 ms with a warm browser cache.

### Writing source into the virtual filesystem

```js
cheerpOSAddStringFile('/str/Main.java', sourceString);   // string or Uint8Array
```

Mount points (docs `explanation/File-System-support`):

| Mount | Backed by | JS write | Java write | Notes |
| --- | --- | --- | --- | --- |
| `/app/` | HTTP, root of the site | no | no | `/app/tools.jar` = `https://site/tools.jar`, read with Range requests |
| `/files/` | IndexedDB, persistent per origin | no | yes | shared by every CheerpJ JVM on the origin (this is what makes the two-JVM design work) |
| `/str/` | in-memory | yes | no | **no subdirectories** (`cheerpOSAddStringFile('/str/a/b.java')` logs `Directories are not supported`) |

The file name under `/str/` must equal the public class name (javac rule).

### javac invocation

```js
const exit = await cheerpjRunMain(
  'com.sun.tools.javac.Main',
  '/app/tools.jar:/files/run7/',      // classpath: javac itself + output dir
  '-d', '/files/run7/', '-Xlint:none', '-nowarn', '/str/Main.java');
// exit === 0 on success, 1 on compile errors
```

- `tools.jar` (18,307,716 bytes, JDK 8) is the same file JavaFiddle ships
  (`leaningtech/javafiddle/static/tools.jar`); it lives next to `index.html`.
  The host **must support HTTP Range requests** (GitHub Pages does; `npx serve` does).
- `-d` must already exist. `/files/` always exists; a subdirectory has to be created
  from Java, e.g. via library mode (see below). Compiling into a per-run directory
  guarantees a renamed class never falls back to an old `.class`.
- Main class name is derived from the source (`public class X`, plus `package a.b;`
  if present) exactly like JavaFiddle's `deriveMainClass`.
- javac flags `-proc:none -XDignore.symbol.file=true -extdirs ... -bootclasspath ...`
  were benchmarked and make no measurable difference; not needed.

### Running

```js
const code = await cheerpjRunMain('Main', '/files/run7/');   // resolves with exit code
```

`cheerpjRunMain(className, classPath, ...args)` returns a Promise of the exit code.
**It does not resolve while non-daemon threads are alive**, i.e. for a Swing program
it resolves only on `System.exit` / `EXIT_ON_CLOSE`. Multiple `cheerpjRunMain` calls
can run concurrently in one JVM (javac was run while a Swing app was live).

### Display and keyboard focus

```js
cheerpjCreateDisplay(-1, -1, parentElement);   // -1,-1 = fill parent; parent needs explicit CSS size
```

Creates `<div id="cheerpjDisplay">` inside the parent containing two hidden
`<textarea>`s (keyboard input), a `<canvas>` per window (`.cjWindow` with a
`.cjTitleBar`), and a license banner strip at the bottom
("CHEERPJ COMMUNITY EDITION - FOR PERSONAL AND NON-BUSINESS USE ONLY") that takes
~20 px of the display height. `JFrame.setLocation(20,20)` + `pack()` of a 500x380
panel fits in 640x480. Windows are movable/closable inside the display.

Keyboard: DOM focus must be on CheerpJ's hidden `<textarea>`; clicking anywhere on a
Java window does that. The spike also focuses it automatically when the first
`.cjWindow` appears (`document.querySelector('#cheerpjDisplay textarea').focus()`).
On the Java side a normal focusable `JPanel` with `KeyListener` works, as do
`WHEN_IN_FOCUSED_WINDOW` key bindings and a `KeyEventDispatcher`. Mouse events work.
CheerpJ maps keys from `KeyboardEvent.keyCode`; events with `keyCode: 0` are ignored
(the Browser pane's `key` tool sends those, which is why automation had to dispatch
synthetic events with `keyCode` set; real keyboards are fine).

### stdout / stderr capture

From `cheerpOS.js` (`cheerpOSInitFds` / `cheerpjDefaultConsoleWrite`): fds 0, 1 and 2
of every JVM write to the page element with `id="console"` via
`document.getElementById("console").textContent += str`, else `console.log`. There is
no configurable option in 4.3; this is the mechanism JavaFiddle relies on too.
Consequences:

- Put `<pre id="console">` in the document *of the JVM* (each iframe needs its own).
- Never put child elements in `#console`: `textContent +=` flattens them. The spike
  keeps `#console` hidden and mirrors it into a styled `<pre>` with a `MutationObserver`.
- stdout and stderr are indistinguishable (same fd data object).
- Each write replaces the whole text node, so very chatty programs get O(n^2); clear
  or truncate periodically in the main app.
- There is no stdin (fd 0 has no `inCallback`); `Scanner(System.in)` will block.

### Stop / restart: the design that works

There is **no API to stop a program or kill threads**, and library mode tricks
(`Window.getWindows()` + `dispose()`) do not stop `javax.swing.Timer`s. The working
design, implemented in `index.html`:

1. **Compiler JVM** lives in the page for the whole session (`cheerpjInit` once,
   javac stays warm: ~1 s per compile after the first).
2. **Runner JVM** = a fresh same-origin `<iframe srcdoc=...>` per run. It loads the
   loader, `cheerpjInit`s (21–30 ms, everything cached), `cheerpjCreateDisplay(-1,-1,
   body div)`, and `cheerpjRunMain(className, '/files/runN/')`. Classes compiled by
   the other JVM are visible because `/files/` is IndexedDB on the same origin.
3. **Stop = `iframe.remove()`**. Kills every thread, timer and window instantly.
4. The parent reads the iframe's `#console` (same origin) and the exit code.

Library mode is used only for `/files/` housekeeping in the compiler JVM:

```js
const lib = await cheerpjRunLibrary('');        // std library only
const File = await lib.java.io.File;
await (await new File('/files/run7/')).mkdirs();
// Java arrays come back as proxies: iterate with .length + index, NOT for..of
// (for..of throws "Cannot convert a Symbol value to a number").
```

## Measurements (macOS, Chromium 152 in the Browser pane, 10 cores)

Download (bytes on the wire, compressed where the CDN compresses):

| Item | Size | When |
| --- | --- | --- |
| `loader.js` + `cj3.js` + `cj3.wasm` + `cheerpOS.js` + `c.js/c.html/css` | 0.28 MB | every JVM, cached for 1 year |
| `cj3n8.wasm` (Java 8 natives) | 1.05 MB | same |
| Runtime jar ranges from `cjrtnc.leaningtech.com/4.3/8/jre/lib/*.jar` (rt.jar is 26.9 MB; only 128 KB chunks that are touched are fetched, inside a hidden `c.html` iframe on the CDN origin) | ~7.5 MB for javac + console, ~9 MB for a Swing program (72 chunks) | first time per browser cache |
| `tools.jar` ranges (40 requests) | 6.8 MB of the 18.3 MB file | **every page load** — Range responses were not served from cache (`transferSize` = body size on reload) |

So a cold first visit is roughly 17 MB, and every later visit still pays ~6.8 MB
for `tools.jar` unless that is fixed (see pitfalls).

Time:

| Step | Measured |
| --- | --- |
| `cheerpjInit` (warm cache) | 21–95 ms |
| First compile in a fresh page, everything already in browser cache | 1.5 s |
| First compile with cold network (jar chunks + tools.jar streaming in) | 46 s |
| Warm compiles (23 samples across benches, console and Swing sources, with/without errors, with/without fs housekeeping) | 0.93–1.7 s |
| Runner JVM init + run of a console `Main` | 0.6–0.8 s |
| Time from clicking Run to a Swing window animating | ~3 s |

## Pitfalls hit

1. **Sporadic compile stalls (7 s, 33 s, 41 s, 72 s).** Four compiles out of ~40
   took far longer than 2 s. `dumpAllThreads()` during the 72 s one showed the javac
   thread in `com.sun.tools.javac.file.Locations$Path.addDirectory` ->
   `java.io.File.listFiles` -> native, i.e. scanning boot-classpath directories on the
   HTTP-backed `/lt/` mount; it eventually completed with exit 0. It did not
   reproduce with: failed compiles, library-mode file ops before/after, runner iframes
   created/destroyed around the compile, or different javac flags. Best explanation is
   a stalled CDN request inside CheerpJ's HTTP filesystem (those requests happen in a
   cross-origin iframe, so they are not observable from the page). Main app should
   show a "compiling..." state and offer a reload if a compile exceeds ~15 s.
2. `cheerpjRunMain` never resolves for GUI programs; a UI that waits for it hangs.
3. Concurrency note: the first version of this spike ran `rmTree` concurrently with
   javac; that was not the cause of the stall, but the spike now sequences all
   library-mode file ops before javac anyway.
4. `#console` element semantics (see above): no child elements, no stderr split.
5. `/str/` has no directories; multi-file projects need every source in `/str/` root
   (javac takes explicit file arguments so package dirs are not required) or in
   `/files/` written from Java.
6. `tools.jar` is re-fetched (6.8 MB of ranges) on every page load. Options: fetch it
   once as a normal cacheable 200 response and write it with
   `cheerpOSAddStringFile('/str/tools.jar', uint8array)` (docs explicitly allow jars
   in `/str/`), then use `/str/tools.jar` on the classpath; or a Service Worker cache.
   Not tested here.
7. The Community License banner occupies the bottom ~20 px of the display; size the
   display accordingly.
8. `javac` needs `-d` to exist and can only be created from Java (library mode).
9. Anonymous inner classes report `getSimpleName() == ""` — only a diagnostic
   red herring, but it cost time.
10. Claude-in-Chrome was not connected, so timings are only from the embedded
    Chromium pane; a real Chromebook will be slower, and the cold ~17 MB download
    matters on school Wi-Fi.

## License

CheerpJ 4.3 Core is distributed under the **CheerpJ Community License** (docs
`23-licensing.md`): free for individuals (including personal projects that generate
income and public-facing games/educational apps), one-person companies, FOSS projects
and technical evaluations. Required action for those: "Give appropriate credits". The
Community License permits unlimited use only when loaded from
`cjrtnc.leaningtech.com`; self-hosting the runtime needs a Commercial License. A
personal, non-commercial GitHub Pages site qualifies. The runtime prints a banner in
the display and console ("CHEERPJ COMMUNITY EDITION - FOR PERSONAL AND NON-BUSINESS
USE ONLY"); only a paid `licenseKey` removes it. `tools.jar` is OpenJDK (GPLv2 +
Classpath Exception); redistributing it unmodified on the site is fine.

## Files

- `/Users/alexisgrimmace/Projects/runline/spikes/java/index.html` — the PoC (compiler JVM in page, runner iframe per run).
- `/Users/alexisgrimmace/Projects/runline/spikes/java/tools.jar` — JDK 8 javac, 18.3 MB, from JavaFiddle.
- Dev server: `preview_start {name: "spike-java"}` (port 4560).
