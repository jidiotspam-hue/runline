const JUDGE0_BASE = "https://ce.judge0.com";
const PYODIDE_SCRIPT = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
const STORAGE_PREFIX = "runline:";

const LANGS = {
  html: { judgeLang: null },
  python: { fileName: "main.py", judgeLang: "python" },
  java: { fileName: "Main.java", judgeLang: "java" },
  cpp: { fileName: "main.cpp", judgeLang: "c++" },
};

// Matches language display names from GET /languages to pick the newest
// available version, since Judge0 renumbers/retires language ids over time.
const LANG_NAME_PATTERNS = {
  python: /^Python \(3\.(\d+)\.(\d+)\)$/,
  java: /^Java \(JDK (\d+)\.(\d+)\.(\d+)\)$/,
  cpp: /^C\+\+ \(GCC (\d+)\.(\d+)\.(\d+)\)$/,
};

const CONSOLE_STARTERS = {
  python: 'print("Hello, runline!")\n',
  java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, runline!");\n  }\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n  std::cout << "Hello, runline!" << std::endl;\n  return 0;\n}\n',
};

const PLAY_STARTER = `import runline as rl
import random

WIDTH, HEIGHT = 480, 320
GROUND_Y = 260
GRAVITY = 900.0
JUMP_V = -420.0

player_y = GROUND_Y
player_vy = 0.0
on_ground = True
obstacles = []
coins = []
score = 0
game_over = False
spawn_timer = 0.0
coin_timer = 0.0

def setup():
    rl.set_size(WIDTH, HEIGHT)

def reset():
    global player_y, player_vy, on_ground, obstacles, coins, score, game_over, spawn_timer, coin_timer
    player_y, player_vy, on_ground = GROUND_Y, 0.0, True
    obstacles, coins, score, game_over = [], [], 0, False
    spawn_timer = coin_timer = 0.0

def jump():
    global player_vy, on_ground, game_over
    if game_over:
        reset()
    elif on_ground:
        player_vy, on_ground = JUMP_V, False

def update(dt):
    global player_y, player_vy, on_ground, spawn_timer, coin_timer, score, game_over

    if rl.key_pressed("Space") or rl.key_pressed("ArrowUp"):
        jump()

    rl.clear("#87ceeb")
    rl.rect(0, GROUND_Y + 24, WIDTH, HEIGHT - GROUND_Y - 24, "#5b3a29")

    if not game_over:
        player_vy += GRAVITY * dt
        player_y += player_vy * dt
        if player_y >= GROUND_Y:
            player_y, player_vy, on_ground = GROUND_Y, 0.0, True

        spawn_timer += dt
        if spawn_timer > 1.5:
            spawn_timer = 0.0
            obstacles.append({"x": WIDTH, "w": 20, "h": 30})

        coin_timer += dt
        if coin_timer > 2.1:
            coin_timer = 0.0
            coins.append({"x": WIDTH, "y": GROUND_Y - 60 - random.random() * 60})

        for o in obstacles:
            o["x"] -= 220 * dt
        for c in coins:
            c["x"] -= 220 * dt
        obstacles[:] = [o for o in obstacles if o["x"] + o["w"] > 0]
        coins[:] = [c for c in coins if c["x"] > -20]

        px, py, pw, ph = 40, player_y, 24, 24
        for o in obstacles:
            oy = GROUND_Y - o["h"] + 30
            if px < o["x"] + o["w"] and px + pw > o["x"] and py + ph > oy and py < oy + o["h"]:
                game_over = True

        remaining = []
        for c in coins:
            dx = (px + pw / 2) - c["x"]
            dy = (py + ph / 2) - c["y"]
            if (dx * dx + dy * dy) ** 0.5 < 24:
                score += 1
            else:
                remaining.append(c)
        coins[:] = remaining

    for o in obstacles:
        rl.rect(o["x"], GROUND_Y - o["h"] + 30, o["w"], o["h"], "#e74c3c")
    for c in coins:
        rl.circle(c["x"], c["y"], 12, "gold")

    rl.rect(40, player_y, 24, 24, "#2ecc71")
    rl.text(10, 24, "Score: " + str(score), "#ffffff", 16)

    if game_over:
        rl.rect(0, 0, WIDTH, HEIGHT, "rgba(0,0,0,0.5)")
        rl.text(WIDTH / 2 - 150, HEIGHT / 2, "Game Over — Space to restart", "#ffffff", 20)
`;

const COIN_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAiUlEQVR4nGNgGOqAkRhFO9q4/2MT96j6SlA/IzkGk2IRIzGGu3t/xapm51ZugpYw4jMcl8G4LMJmCROlhiOrxRakTJQaTsgSDB9QGzBRw/X4fEE/H9AKMNHM5OFngQc0FyJnf1IBthxN3yDyoMAXO3GURxg+IMeSnXgKu4EprulS4VCrymQY8gAA1ldPIgEVzBEAAAAASUVORK5CYII=";

const STARTER_INDEX_HTML = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Square Runner</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="canvas" width="480" height="320"></canvas>
  <script src="game.js"></script>
</body>
</html>
`;

const STARTER_STYLE_CSS = `html, body {
  margin: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #222;
}

canvas {
  background: #87ceeb;
  border: 4px solid #333;
}
`;

const STARTER_GAME_JS = `const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const coinImg = new Image();
coinImg.src = "assets/coin.png";

const player = { x: 40, y: 260, w: 24, h: 24, vy: 0, onGround: true };
const GRAVITY = 0.6;
const JUMP = -11;
const GROUND_Y = 260;

let obstacles = [];
let coins = [];
let frame = 0;
let score = 0;
let gameOver = false;

function reset() {
  player.y = GROUND_Y;
  player.vy = 0;
  obstacles = [];
  coins = [];
  frame = 0;
  score = 0;
  gameOver = false;
}

function jump() {
  if (gameOver) { reset(); return; }
  if (player.onGround) {
    player.vy = JUMP;
    player.onGround = false;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    jump();
  }
});
canvas.addEventListener("click", jump);

function update() {
  if (gameOver) return;
  frame++;

  player.vy += GRAVITY;
  player.y += player.vy;
  if (player.y >= GROUND_Y) {
    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
  }

  if (frame % 90 === 0) obstacles.push({ x: canvas.width, y: GROUND_Y, w: 20, h: 30 });
  if (frame % 130 === 0) coins.push({ x: canvas.width, y: GROUND_Y - 60 - Math.random() * 60, r: 12 });

  obstacles.forEach((o) => (o.x -= 4));
  coins.forEach((c) => (c.x -= 4));
  obstacles = obstacles.filter((o) => o.x + o.w > 0);
  coins = coins.filter((c) => c.x + c.r > 0);

  for (const o of obstacles) {
    const oy = o.y - o.h + 30;
    if (player.x < o.x + o.w && player.x + player.w > o.x && player.y + player.h > oy && player.y < oy + o.h) {
      gameOver = true;
    }
  }

  coins = coins.filter((c) => {
    const dx = player.x + player.w / 2 - c.x;
    const dy = player.y + player.h / 2 - c.y;
    if (Math.sqrt(dx * dx + dy * dy) < c.r + 12) {
      score += 1;
      return false;
    }
    return true;
  });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#5b3a29";
  ctx.fillRect(0, GROUND_Y + 24, canvas.width, canvas.height - GROUND_Y - 24);

  ctx.fillStyle = "#e74c3c";
  obstacles.forEach((o) => ctx.fillRect(o.x, o.y - o.h + 30, o.w, o.h));

  coins.forEach((c) => {
    if (coinImg.complete && coinImg.naturalWidth) {
      ctx.drawImage(coinImg, c.x - 12, c.y - 12, 24, 24);
    } else {
      ctx.fillStyle = "gold";
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = "#2ecc71";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.fillText("Score: " + score, 10, 24);

  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over — click or Space to restart", canvas.width / 2, canvas.height / 2);
    ctx.textAlign = "left";
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
`;

const RUNLINE_PY_MODULE_SRC = `
import js

def set_size(w, h):
    js.RL.setSize(w, h)

def clear(color="#000000"):
    js.RL.clear(color)

def rect(x, y, w, h, color="#ffffff"):
    js.RL.rect(x, y, w, h, color)

def circle(x, y, r, color="#ffffff"):
    js.RL.circle(x, y, r, color)

def text(x, y, s, color="#ffffff", size=16):
    js.RL.text(x, y, str(s), color, size)

def key_down(name):
    return bool(js.RL.keyDown(name))

def key_pressed(name):
    return bool(js.RL.keyPressed(name))

def width():
    return js.RL.canvas.width

def height():
    return js.RL.canvas.height
`;

// ---- DOM ----

const langSelect = document.getElementById("lang-select");
const fileTabsEl = document.getElementById("file-tabs");
const pythonModeToggle = document.getElementById("python-mode-toggle");
const btnModeConsole = document.getElementById("btn-mode-console");
const btnModePlay = document.getElementById("btn-mode-play");
const btnNew = document.getElementById("btn-new");
const btnOpen = document.getElementById("btn-open");
const fileInput = document.getElementById("file-input");
const assetInput = document.getElementById("asset-input");
const btnSave = document.getElementById("btn-save");
const btnRun = document.getElementById("btn-run");
const btnClearOutput = document.getElementById("btn-clear-output");
const runtimeStatus = document.getElementById("runtime-status");
const outputLabel = document.getElementById("output-label");
const previewFrame = document.getElementById("preview-frame");
const outputText = document.getElementById("output-text");
const stdinWrap = document.getElementById("stdin-wrap");
const stdinBox = document.getElementById("stdin-box");
const assetPreview = document.getElementById("asset-preview");
const playWrap = document.getElementById("play-wrap");
const playCanvas = document.getElementById("play-canvas");
const playError = document.getElementById("play-error");

let currentLang = "html";
let pythonMode = localStorage.getItem(STORAGE_PREFIX + "pythonMode") || "console";
let languageIds = {}; // judgeLang -> Judge0 language id
let htmlProject = loadHtmlProject();

const cm = CodeMirror.fromTextArea(document.getElementById("editor"), {
  lineNumbers: true,
  theme: "dracula",
  mode: "htmlmixed",
  indentUnit: 2,
  tabSize: 2,
  autofocus: true,
});

// ---- generic per-language (non-html) storage ----

function storageKey(lang) {
  if (lang === "python") return `${STORAGE_PREFIX}python:${pythonMode}`;
  return STORAGE_PREFIX + lang;
}

function starterFor(lang) {
  if (lang === "python") return pythonMode === "play" ? PLAY_STARTER : CONSOLE_STARTERS.python;
  return CONSOLE_STARTERS[lang];
}

function loadLangContent(lang) {
  const saved = localStorage.getItem(storageKey(lang));
  return saved !== null ? saved : starterFor(lang);
}

function saveLangContent(lang, content) {
  localStorage.setItem(storageKey(lang), content);
}

function modeForFilename(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "css") return "css";
  if (ext === "js") return "javascript";
  if (ext === "py") return "python";
  if (ext === "java") return "text/x-java";
  if (ext === "cpp" || ext === "cc" || ext === "cxx") return "text/x-c++src";
  return "htmlmixed";
}

// ---- html multi-file project ----

function defaultHtmlProject() {
  return {
    activeFile: "index.html",
    files: {
      "index.html": { content: STARTER_INDEX_HTML, binary: false },
      "style.css": { content: STARTER_STYLE_CSS, binary: false },
      "game.js": { content: STARTER_GAME_JS, binary: false },
      "assets/coin.png": { content: COIN_PNG_BASE64, binary: true, mime: "image/png" },
    },
  };
}

function loadHtmlProject() {
  const raw = localStorage.getItem(STORAGE_PREFIX + "html:project");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.files && Object.keys(parsed.files).length) return parsed;
    } catch (err) {
      /* fall through to default */
    }
  }
  return defaultHtmlProject();
}

function saveHtmlProject() {
  try {
    localStorage.setItem(STORAGE_PREFIX + "html:project", JSON.stringify(htmlProject));
  } catch (err) {
    setStatus("Project too large to autosave locally, but it'll keep working this session");
  }
}

function renderFileTabs() {
  fileTabsEl.innerHTML = "";
  const names = Object.keys(htmlProject.files);
  for (const name of names) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "file-tab" + (name === htmlProject.activeFile ? " active" : "");

    const label = document.createElement("span");
    label.textContent = name;
    tab.appendChild(label);

    if (names.length > 1) {
      const close = document.createElement("span");
      close.className = "file-tab-close";
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Delete ${name}?`)) return;
        delete htmlProject.files[name];
        if (htmlProject.activeFile === name) {
          htmlProject.activeFile = Object.keys(htmlProject.files)[0];
        }
        saveHtmlProject();
        renderFileTabs();
        loadActiveFileIntoEditor();
      });
      tab.appendChild(close);
    }

    tab.addEventListener("click", () => switchToFile(name));
    fileTabsEl.appendChild(tab);
  }
}

function switchToFile(name) {
  if (!htmlProject.files[name]) return;
  htmlProject.activeFile = name;
  saveHtmlProject();
  renderFileTabs();
  loadActiveFileIntoEditor();
}

function loadActiveFileIntoEditor() {
  const file = htmlProject.files[htmlProject.activeFile];
  if (!file) return;
  if (file.binary) {
    cm.setOption("readOnly", true);
    document.querySelector(".editor-pane .CodeMirror").style.display = "none";
    assetPreview.hidden = false;
    renderAssetPreview(file);
  } else {
    cm.setOption("readOnly", false);
    document.querySelector(".editor-pane .CodeMirror").style.display = "";
    assetPreview.hidden = true;
    cm.setOption("mode", modeForFilename(htmlProject.activeFile));
    cm.setValue(file.content);
  }
}

function renderAssetPreview(file) {
  assetPreview.innerHTML = "";
  const mime = file.mime || "application/octet-stream";
  if (mime.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = `data:${mime};base64,${file.content}`;
    assetPreview.appendChild(img);
  } else if (mime.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = `data:${mime};base64,${file.content}`;
    assetPreview.appendChild(audio);
  } else {
    const p = document.createElement("p");
    p.textContent = "Binary asset — no inline preview available.";
    assetPreview.appendChild(p);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TEXT_EXTENSIONS = new Set(["html", "htm", "css", "js", "json", "txt", "svg"]);

assetInput.addEventListener("change", async () => {
  const chosen = Array.from(assetInput.files);
  let lastAdded = null;
  for (const f of chosen) {
    const ext = f.name.split(".").pop().toLowerCase();
    const isText = TEXT_EXTENSIONS.has(ext);
    const suggestedPath = prompt(`Path for "${f.name}" inside the project:`, isText ? f.name : `assets/${f.name}`);
    if (suggestedPath === null) continue;
    const path = suggestedPath.trim();
    if (!path) continue;
    if (isText) {
      htmlProject.files[path] = { content: await f.text(), binary: false };
    } else {
      htmlProject.files[path] = { content: await fileToBase64(f), binary: true, mime: f.type || "application/octet-stream" };
    }
    lastAdded = path;
  }
  assetInput.value = "";
  if (lastAdded) {
    saveHtmlProject();
    htmlProject.activeFile = lastAdded;
    renderFileTabs();
    loadActiveFileIntoEditor();
  }
});

// ---- preview rewriting: inline multi-file project into one sandboxed document ----

function normalizeProjectPath(p) {
  return p.trim().replace(/^\.\//, "").replace(/^\//, "").split("?")[0].split("#")[0];
}

function buildAssetMap(files) {
  const map = {};
  for (const [name, file] of Object.entries(files)) {
    if (!file.binary) continue;
    map[normalizeProjectPath(name)] = `data:${file.mime || "application/octet-stream"};base64,${file.content}`;
  }
  return map;
}

function rewriteCssUrls(css, assetMap) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, quote, path) => {
    const dataUrl = assetMap[normalizeProjectPath(path)];
    return dataUrl ? `url(${quote}${dataUrl}${quote})` : whole;
  });
}

function buildAssetShimScript(assetMap) {
  return `(function(){
  var ASSETS = ${JSON.stringify(assetMap)};
  function resolve(v){
    if (typeof v !== "string") return v;
    var norm = v.replace(/^\\.\\//, "").replace(/^\\//, "");
    return Object.prototype.hasOwnProperty.call(ASSETS, norm) ? ASSETS[norm] : v;
  }
  [window.HTMLImageElement, window.HTMLMediaElement].forEach(function(ctor){
    if (!ctor) return;
    var desc = Object.getOwnPropertyDescriptor(ctor.prototype, "src");
    if (!desc || !desc.set) return;
    Object.defineProperty(ctor.prototype, "src", {
      configurable: true,
      get: desc.get,
      set: function(v){ desc.set.call(this, resolve(v)); },
    });
  });
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init){
      if (typeof input === "string") input = resolve(input);
      return origFetch.call(this, input, init);
    };
  }
  var origOpen = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
  if (origOpen) {
    window.XMLHttpRequest.prototype.open = function(method, url){
      var args = Array.prototype.slice.call(arguments);
      args[1] = resolve(url);
      return origOpen.apply(this, args);
    };
  }
})();`;
}

function findTextFile(files, src) {
  const norm = normalizeProjectPath(src);
  const file = files[norm];
  return file && !file.binary ? file.content : null;
}

function buildProjectPreviewHtml(files) {
  const entryName = files["index.html"] ? "index.html" : Object.keys(files).find((n) => n.endsWith(".html"));
  if (!entryName) return "<p style='font-family:sans-serif;padding:20px'>Add an index.html file to preview this project.</p>";

  const normalizedFiles = {};
  for (const [name, f] of Object.entries(files)) normalizedFiles[normalizeProjectPath(name)] = f;

  const assetMap = buildAssetMap(files);
  const doc = new DOMParser().parseFromString(files[entryName].content, "text/html");

  doc.querySelectorAll('link[rel="stylesheet"][href]').forEach((link) => {
    const css = findTextFile(normalizedFiles, link.getAttribute("href"));
    if (css === null) return;
    const style = doc.createElement("style");
    style.textContent = rewriteCssUrls(css, assetMap);
    link.replaceWith(style);
  });

  doc.querySelectorAll("script[src]").forEach((script) => {
    const js = findTextFile(normalizedFiles, script.getAttribute("src"));
    if (js === null) return;
    const inline = doc.createElement("script");
    inline.textContent = js;
    script.replaceWith(inline);
  });

  doc.querySelectorAll("img[src], audio[src], video[src], source[src]").forEach((el) => {
    const dataUrl = assetMap[normalizeProjectPath(el.getAttribute("src"))];
    if (dataUrl) el.setAttribute("src", dataUrl);
  });

  const shim = doc.createElement("script");
  shim.textContent = buildAssetShimScript(assetMap);
  doc.head.insertBefore(shim, doc.head.firstChild || null);

  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}

// ---- top-level language / mode switching ----

function stopPlayLoop() {
  if (playAnimHandle) cancelAnimationFrame(playAnimHandle);
  playAnimHandle = null;
}

function updateChromeForLangMode() {
  const isHtml = currentLang === "html";
  const isPython = currentLang === "python";
  const isPlay = isPython && pythonMode === "play";

  fileTabsEl.hidden = !isHtml;
  pythonModeToggle.hidden = !isPython;
  stdinWrap.hidden = isHtml || isPlay;

  if (isHtml) {
    outputLabel.textContent = "Preview";
    showOutputPane("preview");
  } else if (isPlay) {
    outputLabel.textContent = "Play";
    showOutputPane("play");
  } else {
    outputLabel.textContent = "Output";
    showOutputPane("text");
  }
}

function switchLang(lang) {
  if (lang === currentLang) return;
  if (currentLang === "html") {
    // already saved on every edit
  } else {
    saveLangContent(currentLang, cm.getValue());
  }
  stopPlayLoop();
  currentLang = lang;
  langSelect.value = lang;

  if (lang === "html") {
    document.querySelector(".editor-pane .CodeMirror").style.display = "";
    assetPreview.hidden = true;
    cm.setOption("readOnly", false);
    renderFileTabs();
    loadActiveFileIntoEditor();
  } else {
    document.querySelector(".editor-pane .CodeMirror").style.display = "";
    assetPreview.hidden = true;
    cm.setOption("readOnly", false);
    cm.setOption("mode", modeForFilename(LANGS[lang].fileName));
    cm.setValue(loadLangContent(lang));
  }
  updateChromeForLangMode();
}

cm.on("change", () => {
  if (currentLang === "html") {
    const file = htmlProject.files[htmlProject.activeFile];
    if (file && !file.binary) {
      file.content = cm.getValue();
      saveHtmlProject();
    }
  } else {
    saveLangContent(currentLang, cm.getValue());
  }
});

langSelect.addEventListener("change", () => switchLang(langSelect.value));

function setPythonMode(mode) {
  if (mode === pythonMode) return;
  if (currentLang === "python") saveLangContent("python", cm.getValue());
  stopPlayLoop();
  pythonMode = mode;
  localStorage.setItem(STORAGE_PREFIX + "pythonMode", mode);
  btnModeConsole.classList.toggle("active", mode === "console");
  btnModePlay.classList.toggle("active", mode === "play");
  if (currentLang === "python") {
    cm.setValue(loadLangContent("python"));
    updateChromeForLangMode();
  }
}

btnModeConsole.addEventListener("click", () => setPythonMode("console"));
btnModePlay.addEventListener("click", () => setPythonMode("play"));

btnNew.addEventListener("click", () => {
  if (currentLang === "html") {
    if (!confirm("Start a new HTML project? This clears all files in the current project.")) return;
    htmlProject = defaultHtmlProject();
    saveHtmlProject();
    renderFileTabs();
    loadActiveFileIntoEditor();
    return;
  }
  if (!confirm(`Start a new ${currentLang.toUpperCase()} file? This clears the current editor content.`)) return;
  cm.setValue(starterFor(currentLang));
  saveLangContent(currentLang, cm.getValue());
});

btnOpen.addEventListener("click", () => {
  if (currentLang === "html") assetInput.click();
  else fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  const extToLang = { html: "html", htm: "html", css: "html", js: "html", py: "python", java: "java", cpp: "cpp", cc: "cpp", cxx: "cpp" };
  const lang = extToLang[ext] || currentLang;
  const reader = new FileReader();
  reader.onload = () => {
    if (lang === "html") {
      htmlProject = { activeFile: file.name, files: { [file.name]: { content: reader.result, binary: false } } };
      saveHtmlProject();
      stopPlayLoop();
      currentLang = "html";
      langSelect.value = "html";
      document.querySelector(".editor-pane .CodeMirror").style.display = "";
      assetPreview.hidden = true;
      cm.setOption("readOnly", false);
      renderFileTabs();
      loadActiveFileIntoEditor();
      updateChromeForLangMode();
    } else {
      if (lang !== currentLang) saveLangContent(currentLang, cm.getValue());
      stopPlayLoop();
      currentLang = lang;
      langSelect.value = lang;
      document.querySelector(".editor-pane .CodeMirror").style.display = "";
      assetPreview.hidden = true;
      cm.setOption("readOnly", false);
      cm.setOption("mode", modeForFilename(LANGS[lang].fileName));
      cm.setValue(reader.result);
      saveLangContent(lang, cm.getValue());
      updateChromeForLangMode();
    }
  };
  reader.readAsText(file);
  fileInput.value = "";
});

btnSave.addEventListener("click", () => {
  let name;
  let content;
  let mime = "text/plain";

  if (currentLang === "html") {
    const file = htmlProject.files[htmlProject.activeFile];
    name = htmlProject.activeFile;
    if (file.binary) {
      const bytes = atob(file.content);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      content = arr;
      mime = file.mime || "application/octet-stream";
    } else {
      content = file.content;
    }
  } else {
    name = LANGS[currentLang].fileName;
    content = cm.getValue();
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
});

btnClearOutput.addEventListener("click", () => {
  outputText.textContent = "";
  previewFrame.srcdoc = "";
  playError.hidden = true;
  playError.textContent = "";
});

function showOutputPane(kind) {
  previewFrame.hidden = kind !== "preview";
  outputText.hidden = kind !== "text";
  playWrap.hidden = kind !== "play";
}

function setStatus(msg) {
  runtimeStatus.textContent = msg;
}

// ---- Judge0 (console run for python/java/cpp) ----

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickLatestLanguageId(languages, pattern) {
  let bestId = null;
  let bestVersion = [-1];
  for (const item of languages) {
    const match = item.name.match(pattern);
    if (!match) continue;
    const version = match.slice(1).map(Number);
    if (compareVersions(version, bestVersion) > 0) {
      bestVersion = version;
      bestId = item.id;
    }
  }
  return bestId;
}

async function fetchRuntimes() {
  setStatus("Loading runtimes…");
  try {
    const res = await fetch(`${JUDGE0_BASE}/languages`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const languages = await res.json();
    for (const [lang, pattern] of Object.entries(LANG_NAME_PATTERNS)) {
      const id = pickLatestLanguageId(languages, pattern);
      if (id !== null) languageIds[lang] = id;
    }
    setStatus("Ready");
  } catch (err) {
    setStatus("Runtime list unavailable — Run will still try");
  }
}

function appendOutput(text, cls) {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  outputText.appendChild(span);
}

async function runConsole(judgeLang, code) {
  showOutputPane("text");
  outputText.textContent = "";
  appendOutput("Running…\n", "meta");
  btnRun.disabled = true;

  try {
    const languageId = languageIds[judgeLang];
    if (languageId === undefined) throw new Error("no runtime available for this language");

    const res = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_code: code, language_id: languageId, stdin: stdinBox.value }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();

    outputText.textContent = "";
    if (result.compile_output) appendOutput(result.compile_output, "stderr");
    if (result.stdout) appendOutput(result.stdout);
    if (result.stderr) appendOutput(result.stderr, "stderr");
    if (result.message) appendOutput(`${result.message}\n`, "stderr");

    const status = result.status || {};
    if (status.description && status.description !== "Accepted") {
      appendOutput(`\n[${status.description}]`, "meta");
    } else {
      appendOutput(`\n[done in ${result.time || "?"}s]`, "meta");
    }
  } catch (err) {
    outputText.textContent = "";
    appendOutput(`Error running code: ${err.message}\nThe execution service (Judge0) may be unreachable or rate-limited.`, "stderr");
  } finally {
    btnRun.disabled = false;
  }
}

// ---- Pyodide (Play mode: animated canvas games) ----

const RL = {
  canvas: null,
  ctx: null,
  keysDown: new Set(),
  keysPressed: new Set(),
  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  },
  clear(color) {
    this.ctx.fillStyle = color || "#000000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  },
  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color || "#ffffff";
    this.ctx.fillRect(x, y, w, h);
  },
  circle(x, y, r, color) {
    this.ctx.fillStyle = color || "#ffffff";
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  },
  text(x, y, str, color, size) {
    this.ctx.fillStyle = color || "#ffffff";
    this.ctx.font = `${size || 16}px sans-serif`;
    this.ctx.fillText(str, x, y);
  },
  keyDown(name) {
    return this.keysDown.has(name);
  },
  keyPressed(name) {
    return this.keysPressed.has(name);
  },
};

let pyodide = null;
let pyodideLoadingPromise = null;
let playAnimHandle = null;
let playLastTime = 0;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      if (window.loadPyodide) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function ensurePyodide() {
  if (pyodide) return Promise.resolve(pyodide);
  if (pyodideLoadingPromise) return pyodideLoadingPromise;
  pyodideLoadingPromise = (async () => {
    await loadScriptOnce(PYODIDE_SCRIPT);
    pyodide = await window.loadPyodide();
    RL.canvas = playCanvas;
    RL.ctx = playCanvas.getContext("2d");
    window.RL = RL;

    window.addEventListener("keydown", (e) => {
      if (cm.hasFocus()) return;
      RL.keysDown.add(e.code);
      RL.keysPressed.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      if (cm.hasFocus()) return;
      RL.keysDown.delete(e.code);
    });

    await pyodide.runPythonAsync(
      `import sys, types\n_m = types.ModuleType("runline")\nexec(${JSON.stringify(RUNLINE_PY_MODULE_SRC)}, _m.__dict__)\nsys.modules["runline"] = _m`
    );
    return pyodide;
  })();
  return pyodideLoadingPromise;
}

function showPlayError(err) {
  playError.hidden = false;
  playError.textContent = String((err && err.message) || err);
}

async function runPythonPlay(code) {
  stopPlayLoop();
  RL.keysDown.clear();
  RL.keysPressed.clear();
  showOutputPane("play");
  playError.hidden = true;
  playError.textContent = "";
  btnRun.disabled = true;

  try {
    setStatus("Loading Python runtime… (first run can take ~10s)");
    await ensurePyodide();
    setStatus("Ready");

    pyodide.runPython(code);
    const globals = pyodide.globals;
    const setupFn = globals.get("setup");
    if (setupFn) setupFn();
    const updateFn = globals.get("update");
    if (!updateFn) throw new Error("Define an update(dt) function in your code.");

    playLastTime = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - playLastTime) / 1000, 0.05);
      playLastTime = now;
      try {
        updateFn(dt);
      } catch (err) {
        stopPlayLoop();
        showPlayError(err);
        return;
      }
      RL.keysPressed.clear();
      playAnimHandle = requestAnimationFrame(tick);
    };
    playAnimHandle = requestAnimationFrame(tick);
  } catch (err) {
    showPlayError(err);
  } finally {
    btnRun.disabled = false;
  }
}

// ---- Run ----

async function runCode() {
  if (currentLang === "html") {
    showOutputPane("preview");
    previewFrame.srcdoc = buildProjectPreviewHtml(htmlProject.files);
    return;
  }
  if (currentLang === "python" && pythonMode === "play") {
    await runPythonPlay(cm.getValue());
    return;
  }
  await runConsole(LANGS[currentLang].judgeLang, cm.getValue());
}

btnRun.addEventListener("click", runCode);

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    runCode();
  }
});

// ---- init ----

renderFileTabs();
loadActiveFileIntoEditor();
btnModeConsole.classList.toggle("active", pythonMode === "console");
btnModePlay.classList.toggle("active", pythonMode === "play");
updateChromeForLangMode();
fetchRuntimes();
