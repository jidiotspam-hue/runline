// Java "Play" mode via CheerpJ (a JVM in WebAssembly, loaded from Leaning Tech's CDN
// as its Community License requires). javac from tools.jar runs in a JVM that lives in
// this page so compiles stay warm; each program runs in its own same-origin iframe JVM,
// because CheerpJ has no way to kill threads — removing the iframe is the Stop button.
// Compiled classes are shared through CheerpJ's IndexedDB-backed /files/ mount.

const LOADER = "https://cjrtnc.leaningtech.com/4.3/loader.js";
const RUNNER_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script src="${LOADER}"><\/script>
<style>html,body{margin:0;height:100%;background:#1e1f29}#d{width:100%;height:100%}<\/style>
</head><body><div id="d"></div><pre id="console" style="display:none"></pre>
<script>
window.__run = async (className, classPath) => {
  await cheerpjInit({ version: 8, status: "none" });
  cheerpjCreateDisplay(-1, -1, document.getElementById("d"));
  return cheerpjRunMain(className, classPath);
};
<\/script></body></html>`;

// CheerpJ writes every JVM's stdout/stderr into the element with id="console" using
// textContent +=; watch it and hand new text to a callback.
function mirrorConsole(sink, onText) {
  let seen = 0;
  const flush = () => {
    const text = sink.textContent;
    if (text.length < seen) seen = 0;
    if (text.length > seen) {
      onText(text.slice(seen));
      seen = text.length;
    }
  };
  const mo = new MutationObserver(flush);
  mo.observe(sink, { childList: true, characterData: true, subtree: true });
  return () => {
    flush();
    mo.disconnect();
  };
}

function mainClassOf(src) {
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(src);
  const cls = /\bpublic\s+(?:final\s+)?class\s+(\w+)/.exec(src) || /\bclass\s+(\w+)/.exec(src);
  const name = cls ? cls[1] : "Main";
  return { file: name + ".java", className: pkg ? pkg[1] + "." + name : name };
}

export class JavaPlay {
  constructor({ container, consoleSink, onStatus, onOutput, onError, onStopped }) {
    this.container = container;
    this.consoleSink = consoleSink;
    this.onStatus = onStatus || (() => {});
    this.onOutput = onOutput || (() => {});
    this.onError = onError || (() => {});
    this.onStopped = onStopped || (() => {});
    this.loading = null;
    this.lib = null;
    this.runId = 0;
    this.runner = null;
    this.compileOutput = "";
    this.toolsJar = "/app" + new URL("tools.jar", document.baseURI).pathname;
  }

  get running() {
    return this.runner !== null;
  }

  ensureLoaded() {
    if (this.lib) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = (async () => {
      this.onStatus("Loading Java (CheerpJ)… first time can take a while");
      await new Promise((resolve, reject) => {
        if (window.cheerpjInit) return resolve();
        const s = document.createElement("script");
        s.src = LOADER;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Couldn't download the Java runtime. Check your connection."));
        document.head.appendChild(s);
      });
      await window.cheerpjInit({ version: 8, status: "none" });
      mirrorConsole(this.consoleSink, (t) => (this.compileOutput += t));
      this.lib = await window.cheerpjRunLibrary("");
      this.onStatus("Ready");
    })();
    this.loading.catch(() => (this.loading = null));
    return this.loading;
  }

  async mkdirs(path) {
    const File = await this.lib.java.io.File;
    await (await new File(path)).mkdirs();
  }

  async rmTree(path) {
    const File = await this.lib.java.io.File;
    const f = await new File(path);
    if (!(await f.exists())) return;
    if (await f.isDirectory()) {
      const kids = await f.listFiles(); // Java array proxy: index it, don't for..of
      for (let i = 0; i < kids.length; i++) await this.rmTree(await kids[i].getPath());
    }
    await f.delete();
  }

  async compile(src) {
    const id = ++this.runId;
    const outDir = `/files/runline${id}/`;
    const { file, className } = mainClassOf(src);
    window.cheerpOSAddStringFile("/str/" + file, src);
    // Housekeeping strictly before javac: concurrent File ops hung javac in testing.
    if (id > 1) await this.rmTree(`/files/runline${id - 1}/`).catch(() => {});
    await this.mkdirs(outDir);

    this.compileOutput = "";
    this.onStatus("Compiling Java… (a stuck compile means the CDN stalled — reload the page)");
    const exit = await window.cheerpjRunMain(
      "com.sun.tools.javac.Main",
      `${this.toolsJar}:${outDir}`,
      "-d", outDir, "-Xlint:none", "-nowarn", "/str/" + file
    );
    await new Promise((r) => setTimeout(r, 0)); // let the console mirror flush
    return { exit, outDir, className, output: this.compileOutput.replace(/\/str\//g, "") };
  }

  stop() {
    if (!this.runner) return;
    this.runner.stopMirror();
    this.runner.iframe.remove(); // kills the JVM, all threads, timers and windows
    this.runner = null;
    this.onStopped();
  }

  async run(src) {
    this.stop();
    await this.ensureLoaded();
    const { exit, outDir, className, output } = await this.compile(src);
    if (exit !== 0) {
      this.onOutput(output);
      this.onStatus("Compile failed");
      throw new Error("Compile failed — see the messages under the window.");
    }
    this.onStatus("Ready");

    const iframe = document.createElement("iframe");
    iframe.title = "Java program";
    iframe.srcdoc = RUNNER_HTML;
    this.container.appendChild(iframe);
    const runner = { iframe, stopMirror: () => {} };
    this.runner = runner;

    await new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }));
    if (this.runner !== runner) return; // stopped before the JVM came up
    const w = iframe.contentWindow;
    runner.stopMirror = mirrorConsole(w.document.getElementById("console"), (t) => this.onOutput(t));
    // Keyboard goes to CheerpJ's hidden textarea; focus it as soon as the first window exists.
    new MutationObserver((m, mo) => {
      const ta = w.document.querySelector("#cheerpjDisplay textarea");
      if (w.document.querySelector(".cjWindow") && ta) {
        ta.focus();
        mo.disconnect();
      }
    }).observe(w.document.body, { childList: true, subtree: true });

    w.__run(className, outDir).then(
      (code) => {
        if (this.runner !== runner) return;
        this.onOutput(`[program exited with code ${code}]\n`);
        this.stop();
      },
      (err) => {
        if (this.runner !== runner) return;
        this.onError(err);
        this.stop();
      }
    );
  }
}
