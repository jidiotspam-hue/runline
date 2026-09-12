const JUDGE0_BASE = "https://ce.judge0.com";

const LANGS = {
  html: {
    mode: "htmlmixed",
    ext: "html",
    fileName: null,
    judgeLang: null,
    starter: "<!doctype html>\n<html>\n  <head>\n    <title>Hello</title>\n  </head>\n  <body>\n    <h1>Hello, runline!</h1>\n  </body>\n</html>\n",
  },
  python: {
    mode: "python",
    ext: "py",
    fileName: "main.py",
    judgeLang: "python",
    starter: "print(\"Hello, runline!\")\n",
  },
  java: {
    mode: "text/x-java",
    ext: "java",
    fileName: "Main.java",
    judgeLang: "java",
    starter: "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello, runline!\");\n  }\n}\n",
  },
  cpp: {
    mode: "text/x-c++src",
    ext: "cpp",
    fileName: "main.cpp",
    judgeLang: "cpp",
    starter: "#include <iostream>\n\nint main() {\n  std::cout << \"Hello, runline!\" << std::endl;\n  return 0;\n}\n",
  },
};

// Matches language display names from GET /languages to pick the newest
// available version, since Judge0 renumbers/retires language ids over time.
const LANG_NAME_PATTERNS = {
  python: /^Python \(3\.(\d+)\.(\d+)\)$/,
  java: /^Java \(JDK (\d+)\.(\d+)\.(\d+)\)$/,
  cpp: /^C\+\+ \(GCC (\d+)\.(\d+)\.(\d+)\)$/,
};

const STORAGE_PREFIX = "runline:";

const langSelect = document.getElementById("lang-select");
const btnNew = document.getElementById("btn-new");
const btnOpen = document.getElementById("btn-open");
const fileInput = document.getElementById("file-input");
const btnSave = document.getElementById("btn-save");
const btnRun = document.getElementById("btn-run");
const btnClearOutput = document.getElementById("btn-clear-output");
const runtimeStatus = document.getElementById("runtime-status");
const outputLabel = document.getElementById("output-label");
const previewFrame = document.getElementById("preview-frame");
const outputText = document.getElementById("output-text");
const stdinWrap = document.getElementById("stdin-wrap");
const stdinBox = document.getElementById("stdin-box");

let currentLang = "html";
let languageIds = {}; // judgeLang -> Judge0 language id

const cm = CodeMirror.fromTextArea(document.getElementById("editor"), {
  lineNumbers: true,
  theme: "dracula",
  mode: LANGS[currentLang].mode,
  indentUnit: 2,
  tabSize: 2,
  autofocus: true,
});

function storageKey(lang) {
  return STORAGE_PREFIX + lang;
}

function loadLangContent(lang) {
  const saved = localStorage.getItem(storageKey(lang));
  return saved !== null ? saved : LANGS[lang].starter;
}

function saveLangContent(lang, content) {
  localStorage.setItem(storageKey(lang), content);
}

function switchLang(lang) {
  saveLangContent(currentLang, cm.getValue());
  currentLang = lang;
  langSelect.value = lang;
  cm.setOption("mode", LANGS[lang].mode);
  cm.setValue(loadLangContent(lang));
  stdinWrap.hidden = lang === "html";
  outputLabel.textContent = lang === "html" ? "Preview" : "Output";
  showOutputPane(lang === "html" ? "preview" : "text");
}

cm.on("change", () => {
  saveLangContent(currentLang, cm.getValue());
});

langSelect.addEventListener("change", () => switchLang(langSelect.value));

btnNew.addEventListener("click", () => {
  if (!confirm(`Start a new ${currentLang.toUpperCase()} file? This clears the current editor content.`)) return;
  cm.setValue(LANGS[currentLang].starter);
  saveLangContent(currentLang, cm.getValue());
});

btnOpen.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  const extToLang = { html: "html", htm: "html", py: "python", java: "java", cpp: "cpp", cc: "cpp", cxx: "cpp" };
  const lang = extToLang[ext] || currentLang;
  const reader = new FileReader();
  reader.onload = () => {
    if (lang !== currentLang) {
      saveLangContent(currentLang, cm.getValue());
      currentLang = lang;
      langSelect.value = lang;
      cm.setOption("mode", LANGS[lang].mode);
      stdinWrap.hidden = lang === "html";
      outputLabel.textContent = lang === "html" ? "Preview" : "Output";
    }
    cm.setValue(reader.result);
    saveLangContent(lang, cm.getValue());
  };
  reader.readAsText(file);
  fileInput.value = "";
});

btnSave.addEventListener("click", () => {
  const lang = LANGS[currentLang];
  const name = lang.fileName || `untitled.${lang.ext}`;
  const blob = new Blob([cm.getValue()], { type: "text/plain" });
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
});

function showOutputPane(kind) {
  previewFrame.hidden = kind !== "preview";
  outputText.hidden = kind === "preview";
}

function setStatus(msg) {
  runtimeStatus.textContent = msg;
}

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

async function runCode() {
  const lang = LANGS[currentLang];
  const code = cm.getValue();

  if (currentLang === "html") {
    showOutputPane("preview");
    previewFrame.srcdoc = code;
    return;
  }

  showOutputPane("text");
  outputText.textContent = "";
  appendOutput("Running…\n", "meta");
  btnRun.disabled = true;

  try {
    const languageId = languageIds[lang.judgeLang];
    if (languageId === undefined) throw new Error("no runtime available for this language");

    const res = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: languageId,
        stdin: stdinBox.value,
      }),
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

btnRun.addEventListener("click", runCode);

document.addEventListener("keydown", (e) => {
  const isRunShortcut = (e.metaKey || e.ctrlKey) && e.key === "Enter";
  if (isRunShortcut) {
    e.preventDefault();
    runCode();
  }
});

cm.setOption("mode", LANGS[currentLang].mode);
cm.setValue(loadLangContent(currentLang));
langSelect.value = currentLang;
stdinWrap.hidden = currentLang === "html";
outputLabel.textContent = currentLang === "html" ? "Preview" : "Output";
showOutputPane(currentLang === "html" ? "preview" : "text");
fetchRuntimes();
