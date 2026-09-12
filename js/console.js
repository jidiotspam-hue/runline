// Judge0 execution + an interactive, terminal-style console.
//
// Judge0 runs a program once with a fixed stdin, so true interactivity isn't
// possible. Instead, every time the user types a line we re-run the program with
// ALL lines typed so far and splice the inputs into the transcript. For
// deterministic programs this is indistinguishable from a real terminal.

const JUDGE0_BASE = "https://ce.judge0.com";

// Match names from GET /languages so we always pick the newest available version.
const LANG_NAME_PATTERNS = {
  python: /^Python \(3\.(\d+)\.(\d+)\)$/,
  java: /^Java \(JDK (\d+)\.(\d+)\.(\d+)\)$/,
  cpp: /^C\+\+ \(GCC (\d+)\.(\d+)\.(\d+)\)$/,
};

const languageIds = {};

function b64encode(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

function b64decode(s) {
  if (!s) return "";
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    return atob(s);
  }
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function fetchRuntimes() {
  const res = await fetch(`${JUDGE0_BASE}/languages`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const languages = await res.json();
  for (const [lang, pattern] of Object.entries(LANG_NAME_PATTERNS)) {
    let bestId = null;
    let bestVersion = [-1];
    for (const item of languages) {
      const m = item.name.match(pattern);
      if (!m) continue;
      const version = m.slice(1).map(Number);
      if (compareVersions(version, bestVersion) > 0) {
        bestVersion = version;
        bestId = item.id;
      }
    }
    if (bestId !== null) languageIds[lang] = bestId;
  }
  return languageIds;
}

export async function execute(lang, code, stdin) {
  const languageId = languageIds[lang];
  if (languageId === undefined) throw new Error("No runtime available for this language (couldn't reach Judge0).");
  const res = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_code: b64encode(code), language_id: languageId, stdin: b64encode(stdin || "") }),
  });
  if (res.status === 429) throw new Error("The execution service is rate-limiting — wait a moment and try again.");
  if (!res.ok) throw new Error(`Execution service error (HTTP ${res.status}).`);
  const r = await res.json();
  return {
    stdout: b64decode(r.stdout),
    stderr: b64decode(r.stderr),
    compileOutput: b64decode(r.compile_output),
    message: b64decode(r.message),
    status: (r.status && r.status.description) || "",
    time: r.time,
  };
}

export class InteractiveConsole {
  constructor({ output, form, input, onBusy }) {
    this.output = output;
    this.form = form;
    this.input = input;
    this.onBusy = onBusy || (() => {});
    this.lang = null;
    this.code = "";
    this.inputs = [];
    this.marks = [];
    this.lastOut = "";
    this.running = false;
    const send = (e) => {
      e.preventDefault();
      if (this.running) return;
      const text = this.input.value;
      this.input.value = "";
      this.submit(text);
    };
    this.form.addEventListener("submit", send);
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) send(e);
    });
  }

  start(lang, code) {
    this.lang = lang;
    this.code = code;
    this.inputs = [];
    this.marks = [];
    this.lastOut = "";
    this.input.disabled = false;
    return this.run();
  }

  clear() {
    this.output.textContent = "";
  }

  submit(text) {
    if (this.running || !this.lang) return;
    const lines = text.replace(/\r/g, "").split("\n");
    for (const line of lines) {
      this.marks.push(this.lastOut.length);
      this.inputs.push(line);
    }
    return this.run();
  }

  append(text, cls) {
    if (!text) return;
    const span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text;
    this.output.appendChild(span);
  }

  async run() {
    this.running = true;
    this.onBusy(true);
    this.input.disabled = true;
    this.clear();
    this.append("Running…\n", "meta");
    try {
      const stdin = this.inputs.map((l) => l + "\n").join("");
      const r = await execute(this.lang, this.code, stdin);
      this.clear();

      if (r.compileOutput) this.append(r.compileOutput + "\n", "stderr");

      const out = r.stdout;
      const consistent = out.startsWith(this.lastOut) || this.inputs.length === 0;
      if (consistent) {
        let cursor = 0;
        this.inputs.forEach((line, i) => {
          const mark = Math.min(this.marks[i], out.length);
          this.append(out.slice(cursor, mark));
          this.append(line + "\n", "stdin-echo");
          cursor = mark;
        });
        this.append(out.slice(cursor));
      } else {
        this.append(out);
        this.append("\n(Output changed between runs — the program isn't deterministic, so earlier inputs can't be spliced in.)\n", "meta");
      }
      this.lastOut = out;

      // Reading past the end of stdin just means the program wants more input.
      const wantsInput = /EOFError|NoSuchElementException|EOF when reading/.test(r.stderr || "");
      if (wantsInput) {
        this.append("\n⌨ waiting for input — type a line below and press Enter\n", "meta");
      } else {
        if (r.stderr) this.append(r.stderr, "stderr");
        if (r.message) this.append(r.message + "\n", "stderr");
        const tail = r.status && r.status !== "Accepted" ? `[${r.status}]` : `[program finished · ${r.time || "?"}s]`;
        this.append(`\n${tail}\n`, "meta");
      }
    } catch (err) {
      this.clear();
      this.append(`Error: ${err.message}\n`, "stderr");
    } finally {
      this.running = false;
      this.input.disabled = false;
      this.onBusy(false);
      this.output.scrollTop = this.output.scrollHeight;
      this.input.focus({ preventScroll: true });
    }
  }
}
