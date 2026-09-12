import { db } from "./db.js";
import { CONSOLE_STARTERS, PYTHON_PLAY_STARTER, CPP_PLAY_STARTER, JAVA_PLAY_STARTER, base64ToBytes } from "./starters.js";
import * as P from "./project.js";
import { buildPreviewHtml } from "./preview.js";
import { fetchRuntimes, InteractiveConsole } from "./console.js";
import { PyPlay } from "./pyplay.js";
import { CppPlay } from "./cppplay.js";
import { JavaPlay } from "./javaplay.js";

const $ = (id) => document.getElementById(id);
const el = {
  langSelect: $("lang-select"),
  projectSelect: $("project-select"),
  projectMenu: $("project-menu"),
  modeToggle: $("mode-toggle"),
  btnModeConsole: $("btn-mode-console"),
  btnModePlay: $("btn-mode-play"),
  btnNew: $("btn-new"),
  openMenu: $("open-menu"),
  btnOpenSingle: $("btn-open-single"),
  btnSave: $("btn-save"),
  btnRun: $("btn-run"),
  btnStop: $("btn-stop"),
  btnHelp: $("btn-help"),
  status: $("runtime-status"),
  fileInput: $("file-input"),
  assetInput: $("asset-input"),
  folderInput: $("folder-input"),
  zipInput: $("zip-input"),
  editorPane: $("editor-pane"),
  sidebar: $("sidebar"),
  fileList: $("file-list"),
  btnAddFile: $("btn-add-file"),
  assetPreview: $("asset-preview"),
  dropOverlay: $("drop-overlay"),
  splitter: $("splitter"),
  outputLabel: $("output-label"),
  btnClearOutput: $("btn-clear-output"),
  previewFrame: $("preview-frame"),
  previewErrors: $("preview-errors"),
  consoleWrap: $("console-wrap"),
  consoleOut: $("console-out"),
  consoleForm: $("console-form"),
  consoleIn: $("console-in"),
  playWrap: $("play-wrap"),
  playCanvas: $("play-canvas"),
  javaWrap: $("java-wrap"),
  playHint: $("play-hint"),
  javaConsoleSink: $("console"),
  playOut: $("play-out"),
  playError: $("play-error"),
  modal: $("modal"),
  btnCloseModal: $("btn-close-modal"),
};

const LANG_FILE = { python: "main.py", java: "Main.java", cpp: "main.cpp" };
const JUDGE_LANG = { python: "python", java: "java", cpp: "cpp" };
const PREF = {
  lang: "runline:lang",
  projectId: "runline:projectId",
  split: "runline:split",
};
const modePref = (lang) => `runline:mode:${lang}`;

// Languages with a Play (canvas game) mode alongside the console mode.
const PLAY_LANGS = ["python", "cpp", "java"];

const state = {
  lang: localStorage.getItem(PREF.lang) || "html",
  modes: Object.fromEntries(PLAY_LANGS.map((l) => [l, localStorage.getItem(modePref(l)) || "console"])),
  projects: [],
  project: null,
};

let cmEl = null;
const cm = CodeMirror.fromTextArea($("editor"), {
  lineNumbers: true,
  theme: "dracula",
  mode: "htmlmixed",
  indentUnit: 2,
  tabSize: 2,
  matchBrackets: true,
  autoCloseBrackets: true,
  styleActiveLine: true,
  extraKeys: {
    Tab: (cmi) => (cmi.somethingSelected() ? cmi.indentSelection("add") : cmi.replaceSelection(" ".repeat(cmi.getOption("indentUnit")))),
    "Shift-Tab": (cmi) => cmi.indentSelection("subtract"),
  },
});
cmEl = cm.getWrapperElement();

// Programmatic edits must not be written back into whatever storage the
// change handler currently targets (e.g. loading an HTML file while in Python mode).
let settingEditor = false;
function setEditor(value) {
  settingEditor = true;
  cm.setValue(value);
  settingEditor = false;
  cm.clearHistory();
}

function persistEditor() {
  if (state.lang === "html") {
    const rec = state.project && state.project.files[state.project.activeFile];
    if (rec && !rec.binary) {
      rec.content = cm.getValue();
      scheduleProjectSave();
    }
  } else {
    localStorage.setItem(langStorageKey(state.lang), cm.getValue());
  }
}

const consoleUI = new InteractiveConsole({
  output: el.consoleOut,
  form: el.consoleForm,
  input: el.consoleIn,
  onBusy: (busy) => (el.btnRun.disabled = busy),
});

const runnerHooks = {
  canvas: el.playCanvas,
  onStatus: setStatus,
  onOutput: (text) => {
    el.playOut.hidden = false;
    el.playOut.textContent += text;
    el.playOut.scrollTop = el.playOut.scrollHeight;
  },
  onError: (err) => {
    el.playError.hidden = false;
    el.playError.textContent = String((err && err.message) || err);
  },
  onStopped: () => updateRunButtons(),
};
const runners = {
  python: new PyPlay(runnerHooks),
  cpp: new CppPlay(runnerHooks),
  java: new JavaPlay({ ...runnerHooks, container: el.javaWrap, consoleSink: el.javaConsoleSink }),
};

function currentRunner() {
  return runners[state.lang] || null;
}

function stopRunners() {
  for (const r of Object.values(runners)) r.stop();
}

// ---------- helpers ----------

function setStatus(msg) {
  el.status.textContent = msg;
  el.status.title = msg;
}

function modeForPath(path) {
  const ext = P.extOf(path);
  return {
    css: "css", js: "javascript", mjs: "javascript", json: { name: "javascript", json: true },
    py: "python", java: "text/x-java", cpp: "text/x-c++src", cc: "text/x-c++src", cxx: "text/x-c++src",
    c: "text/x-csrc", h: "text/x-c++src", hpp: "text/x-c++src", md: "markdown", txt: "text/plain", svg: "xml", xml: "xml",
  }[ext] || "htmlmixed";
}

function download(name, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function langStorageKey(lang) {
  return lang in state.modes ? `runline:${lang}:${state.modes[lang]}` : `runline:${lang}`;
}

function starterFor(lang) {
  if (state.modes[lang] === "play") return { python: PYTHON_PLAY_STARTER, cpp: CPP_PLAY_STARTER, java: JAVA_PLAY_STARTER }[lang];
  return CONSOLE_STARTERS[lang];
}

function loadLangContent(lang) {
  const saved = localStorage.getItem(langStorageKey(lang));
  return saved !== null ? saved : starterFor(lang);
}

// ---------- projects ----------

let saveTimer = null;
function scheduleProjectSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProjectNow, 300);
}

async function saveProjectNow() {
  clearTimeout(saveTimer);
  if (!state.project) return;
  state.project.updatedAt = Date.now();
  try {
    await db.putProject(state.project);
  } catch (err) {
    setStatus("Couldn't save project: " + err.message);
  }
}

async function refreshProjectList() {
  state.projects = (await db.listProjects()).sort((a, b) => a.name.localeCompare(b.name));
  el.projectSelect.innerHTML = "";
  for (const p of state.projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    el.projectSelect.appendChild(opt);
  }
  if (state.project) el.projectSelect.value = state.project.id;
}

async function openProject(id) {
  await saveProjectNow();
  const project = await db.getProject(id);
  if (!project) return;
  state.project = project;
  if (!project.files[project.activeFile]) project.activeFile = P.entryHtmlName(project.files) || Object.keys(project.files)[0];
  localStorage.setItem(PREF.projectId, project.id);
  el.projectSelect.value = project.id;
  renderFileList();
  loadActiveFile();
}

async function createProject(name, files) {
  const project = P.newProject(name, files);
  await db.putProject(project);
  await refreshProjectList();
  await openProject(project.id);
  return project;
}

function uniqueProjectName(base) {
  const names = new Set(state.projects.map((p) => p.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

// Bring a project saved by the previous localStorage-based version into IndexedDB.
function migrateLegacyProject() {
  const raw = localStorage.getItem("runline:html:project");
  if (!raw) return null;
  try {
    const old = JSON.parse(raw);
    const files = {};
    for (const [path, rec] of Object.entries(old.files || {})) {
      files[P.normalizePath(path)] = rec.binary
        ? { content: base64ToBytes(rec.content), binary: true, mime: rec.mime || P.guessMime(path) }
        : { content: rec.content, binary: false };
    }
    localStorage.removeItem("runline:html:project");
    return Object.keys(files).length ? files : null;
  } catch {
    return null;
  }
}

// ---------- files / sidebar ----------

function renderFileList() {
  const project = state.project;
  el.fileList.innerHTML = "";
  if (!project) return;
  const paths = Object.keys(project.files).sort((a, b) => {
    const da = a.includes("/"), dbb = b.includes("/");
    if (da !== dbb) return da ? 1 : -1;
    return a.localeCompare(b);
  });
  for (const path of paths) {
    const li = document.createElement("li");
    if (path === project.activeFile) li.classList.add("active");
    li.title = path;

    const name = document.createElement("span");
    name.className = "fname";
    const slash = path.lastIndexOf("/");
    if (slash !== -1) {
      const dir = document.createElement("span");
      dir.className = "fdir";
      dir.textContent = path.slice(0, slash + 1);
      name.appendChild(dir);
    }
    name.appendChild(document.createTextNode(path.slice(slash + 1)));
    li.appendChild(name);

    const rename = document.createElement("button");
    rename.className = "fbtn";
    rename.textContent = "✎";
    rename.title = "Rename";
    rename.addEventListener("click", (e) => {
      e.stopPropagation();
      renameFile(path);
    });
    li.appendChild(rename);

    const del = document.createElement("button");
    del.className = "fbtn";
    del.textContent = "✕";
    del.title = "Delete";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteFile(path);
    });
    li.appendChild(del);

    li.addEventListener("click", () => setActiveFile(path));
    li.addEventListener("dblclick", () => renameFile(path));
    el.fileList.appendChild(li);
  }
}

function setActiveFile(path) {
  if (!state.project || !state.project.files[path]) return;
  state.project.activeFile = path;
  scheduleProjectSave();
  renderFileList();
  loadActiveFile();
}

function showEditor(show) {
  cmEl.style.display = show ? "" : "none";
  el.assetPreview.hidden = show;
  if (show) cm.refresh();
}

function loadActiveFile() {
  if (state.lang !== "html") return;
  const project = state.project;
  const rec = project && project.files[project.activeFile];
  if (!rec) {
    showEditor(true);
    setEditor("");
    return;
  }
  if (rec.binary) {
    showEditor(false);
    renderAssetPreview(project.activeFile, rec);
  } else {
    showEditor(true);
    cm.setOption("readOnly", false);
    cm.setOption("mode", modeForPath(project.activeFile));
    cm.setOption("indentUnit", 2);
    setEditor(rec.content);
  }
}

function renderAssetPreview(path, rec) {
  el.assetPreview.innerHTML = "";
  const mime = rec.mime || "application/octet-stream";
  const url = URL.createObjectURL(new Blob([rec.content], { type: mime }));
  if (mime.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = url;
    el.assetPreview.appendChild(img);
  } else if (mime.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = url;
    el.assetPreview.appendChild(audio);
  } else if (mime.startsWith("video/")) {
    const video = document.createElement("video");
    video.controls = true;
    video.src = url;
    video.style.maxWidth = "90%";
    el.assetPreview.appendChild(video);
  }
  const info = document.createElement("p");
  info.textContent = `${path} · ${mime} · ${(rec.content.length / 1024).toFixed(1)} KB`;
  el.assetPreview.appendChild(info);
}

function addFileFromPrompt() {
  const name = prompt("New file name (folders allowed, e.g. js/enemy.js):", "");
  if (name === null) return;
  const path = P.normalizePath(name.trim());
  if (!path) return;
  if (state.project.files[path] && !confirm(`${path} already exists. Replace it?`)) return;
  state.project.files[path] = { content: "", binary: false };
  setActiveFile(path);
}

function renameFile(oldPath) {
  const name = prompt("Rename to:", oldPath);
  if (name === null) return;
  const path = P.normalizePath(name.trim());
  if (!path || path === oldPath) return;
  if (state.project.files[path] && !confirm(`${path} already exists. Replace it?`)) return;
  state.project.files[path] = state.project.files[oldPath];
  delete state.project.files[oldPath];
  if (state.project.activeFile === oldPath) state.project.activeFile = path;
  scheduleProjectSave();
  renderFileList();
  loadActiveFile();
}

function deleteFile(path) {
  if (!confirm(`Delete ${path}?`)) return;
  delete state.project.files[path];
  if (state.project.activeFile === path) {
    state.project.activeFile = P.entryHtmlName(state.project.files) || Object.keys(state.project.files)[0] || null;
  }
  scheduleProjectSave();
  renderFileList();
  loadActiveFile();
}

async function mergeFiles(files, { openFirst = true } = {}) {
  const paths = Object.keys(files);
  if (!paths.length) {
    setStatus("No usable files found.");
    return;
  }
  const clobbered = paths.filter((p) => state.project.files[p]);
  if (clobbered.length && !confirm(`Replace ${clobbered.length} existing file${clobbered.length === 1 ? "" : "s"} (${clobbered.slice(0, 3).join(", ")}${clobbered.length > 3 ? "…" : ""})?`)) {
    for (const p of clobbered) delete files[p];
    if (!Object.keys(files).length) return;
  }
  Object.assign(state.project.files, files);
  const first = paths.find((p) => p === "index.html") || paths.find((p) => /\.html?$/.test(p)) || paths[0];
  if (openFirst) state.project.activeFile = first;
  scheduleProjectSave();
  renderFileList();
  loadActiveFile();
  setStatus(`Added ${paths.length} file${paths.length === 1 ? "" : "s"}.`);
}

async function importZipFile(file) {
  setStatus("Reading zip…");
  try {
    const files = await P.filesFromZip(await file.arrayBuffer());
    if (!Object.keys(files).length) throw new Error("The zip had no usable files.");
    await createProject(uniqueProjectName(file.name.replace(/\.zip$/i, "")), files);
    setStatus(`Imported ${Object.keys(files).length} files.`);
  } catch (err) {
    setStatus("Import failed: " + err.message);
    alert("Import failed: " + err.message);
  }
}

async function importFromGitHub() {
  const url = prompt("GitHub repo URL (public), e.g. https://github.com/user/repo or …/tree/main/subfolder:");
  if (!url) return;
  try {
    const { name, files } = await P.filesFromGitHub(url, setStatus);
    await createProject(uniqueProjectName(name), files);
    setStatus(`Imported ${Object.keys(files).length} files from GitHub.`);
  } catch (err) {
    setStatus("Import failed: " + err.message);
    alert("Import failed: " + err.message);
  }
}

// ---------- panes ----------

function showPane(kind) {
  el.previewFrame.hidden = kind !== "preview";
  el.previewErrors.hidden = kind !== "preview" || !el.previewErrors.textContent;
  el.consoleWrap.hidden = kind !== "console";
  el.playWrap.hidden = kind !== "play";
}

function currentRunKind() {
  if (state.lang === "html") return "preview";
  if (state.modes[state.lang] === "play") return "play";
  return "console";
}

function updateRunButtons() {
  const kind = currentRunKind();
  const runner = currentRunner();
  el.btnRun.textContent = kind === "preview" ? "Preview ▶" : kind === "play" ? "Play ▶" : "Run ▶";
  el.btnStop.hidden = !(kind === "play" && runner && runner.running);
}

function applyChrome() {
  const isHtml = state.lang === "html";
  const hasPlay = state.lang in state.modes;
  const mode = state.modes[state.lang];
  const kind = currentRunKind();

  el.projectSelect.hidden = !isHtml;
  el.projectMenu.hidden = !isHtml;
  el.sidebar.hidden = !isHtml;
  el.modeToggle.hidden = !hasPlay;
  el.openMenu.hidden = !isHtml;
  el.btnOpenSingle.hidden = isHtml;
  el.btnNew.title = isHtml ? "New file in this project" : "Reset to the starter program";
  el.btnModeConsole.classList.toggle("active", mode === "console");
  el.btnModePlay.classList.toggle("active", mode === "play");

  el.outputLabel.textContent = kind === "preview" ? "Preview" : kind === "play" ? "Play" : "Console";
  const isJava = state.lang === "java";
  el.playCanvas.hidden = isJava;
  el.javaWrap.hidden = !isJava;
  el.playHint.textContent = isJava ? "Click the Java window to give it keyboard focus." : "Click the game to give it keyboard focus.";
  showPane(kind);
  updateRunButtons();
}

async function switchLang(lang) {
  if (lang === state.lang) return;
  if (state.lang === "html") await saveProjectNow();
  else localStorage.setItem(langStorageKey(state.lang), cm.getValue());
  stopRunners();

  state.lang = lang;
  localStorage.setItem(PREF.lang, lang);
  el.langSelect.value = lang;

  if (lang === "html") {
    renderFileList();
    loadActiveFile();
  } else {
    showEditor(true);
    cm.setOption("readOnly", false);
    cm.setOption("mode", modeForPath(LANG_FILE[lang]));
    cm.setOption("indentUnit", lang === "python" ? 4 : 2);
    setEditor(loadLangContent(lang));
  }
  applyChrome();
}

function setMode(mode) {
  const lang = state.lang;
  if (!(lang in state.modes) || mode === state.modes[lang]) return;
  localStorage.setItem(langStorageKey(lang), cm.getValue());
  stopRunners();
  state.modes[lang] = mode;
  localStorage.setItem(modePref(lang), mode);
  setEditor(loadLangContent(lang));
  applyChrome();
}

// ---------- run ----------

async function run() {
  const kind = currentRunKind();
  if (kind === "preview") {
    await saveProjectNow();
    el.previewErrors.textContent = "";
    el.previewErrors.hidden = true;
    showPane("preview");
    el.previewFrame.srcdoc = buildPreviewHtml(state.project.files);
    el.previewFrame.addEventListener("load", () => el.previewFrame.contentWindow && el.previewFrame.contentWindow.focus(), { once: true });
    return;
  }

  localStorage.setItem(langStorageKey(state.lang), cm.getValue());

  if (kind === "play") {
    showPane("play");
    el.playError.hidden = true;
    el.playError.textContent = "";
    el.playOut.hidden = true;
    el.playOut.textContent = "";
    el.btnRun.disabled = true;
    try {
      await currentRunner().run(cm.getValue());
    } catch (err) {
      el.playError.hidden = false;
      el.playError.textContent = String((err && err.message) || err);
    } finally {
      el.btnRun.disabled = false;
      updateRunButtons();
    }
    return;
  }

  showPane("console");
  await consoleUI.start(JUDGE_LANG[state.lang], cm.getValue());
}

// ---------- wiring ----------

cm.on("change", () => {
  if (!settingEditor) persistEditor();
});

el.langSelect.addEventListener("change", () => switchLang(el.langSelect.value));
el.projectSelect.addEventListener("change", () => openProject(el.projectSelect.value));
el.btnModeConsole.addEventListener("click", () => setMode("console"));
el.btnModePlay.addEventListener("click", () => setMode("play"));
el.btnRun.addEventListener("click", run);
el.btnStop.addEventListener("click", () => {
  stopRunners();
  updateRunButtons();
});

el.btnNew.addEventListener("click", () => {
  if (state.lang === "html") return addFileFromPrompt();
  if (!confirm("Replace the editor contents with the starter program?")) return;
  setEditor(starterFor(state.lang));
  persistEditor();
});
el.btnAddFile.addEventListener("click", addFileFromPrompt);

el.btnOpenSingle.addEventListener("click", () => el.fileInput.click());
el.fileInput.addEventListener("change", async () => {
  const file = el.fileInput.files[0];
  el.fileInput.value = "";
  if (!file) return;
  const ext = P.extOf(file.name);
  const lang = { html: "html", htm: "html", css: "html", js: "html", py: "python", java: "java", cpp: "cpp", cc: "cpp", cxx: "cpp" }[ext] || state.lang;
  const text = await file.text();
  if (lang === "html") {
    await createProject(uniqueProjectName(file.name.replace(/\.[^.]+$/, "")), { [file.name]: { content: text, binary: false } });
    await switchLang("html");
  } else {
    await switchLang(lang);
    setEditor(text);
    persistEditor();
  }
});

el.assetInput.addEventListener("change", async () => {
  const files = await P.filesFromFileList(Array.from(el.assetInput.files));
  el.assetInput.value = "";
  await mergeFiles(files);
});
el.folderInput.addEventListener("change", async () => {
  const files = await P.filesFromFileList(Array.from(el.folderInput.files));
  el.folderInput.value = "";
  await mergeFiles(files);
});
el.zipInput.addEventListener("change", async () => {
  const file = el.zipInput.files[0];
  el.zipInput.value = "";
  if (file) await importZipFile(file);
});

// dropdown menus
document.querySelectorAll(".menu").forEach((menu) => {
  menu.querySelector(".menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.contains("open");
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
    if (!open) menu.classList.add("open");
  });
  menu.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      menu.classList.remove("open");
      menuAction(btn.dataset.action);
    });
  });
});
document.addEventListener("click", () => document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open")));

async function menuAction(action) {
  switch (action) {
    case "add-files": return el.assetInput.click();
    case "add-folder": return el.folderInput.click();
    case "import-zip": return el.zipInput.click();
    case "import-github": return importFromGitHub();
    case "new-project": {
      const name = prompt("Project name:", uniqueProjectName("Untitled"));
      if (name === null) return;
      return createProject(uniqueProjectName(name.trim() || "Untitled"));
    }
    case "rename-project": {
      const name = prompt("Project name:", state.project.name);
      if (name === null || !name.trim()) return;
      state.project.name = name.trim();
      await saveProjectNow();
      return refreshProjectList();
    }
    case "download-zip": {
      const blob = await P.projectToZipBlob(state.project);
      return download(`${state.project.name}.zip`, blob);
    }
    case "delete-project": {
      if (!confirm(`Delete project "${state.project.name}"? This can't be undone.`)) return;
      const id = state.project.id;
      state.project = null;
      await db.deleteProject(id);
      await refreshProjectList();
      if (!state.projects.length) await createProject("Square Runner");
      else await openProject(state.projects[0].id);
      return;
    }
  }
}

el.btnSave.addEventListener("click", () => {
  if (state.lang === "html") {
    const path = state.project.activeFile;
    const rec = state.project.files[path];
    if (!rec) return;
    download(path.split("/").pop(), rec.content, rec.binary ? rec.mime : "text/plain");
  } else {
    download(LANG_FILE[state.lang], cm.getValue(), "text/plain");
  }
});

el.btnClearOutput.addEventListener("click", () => {
  consoleUI.clear();
  el.previewFrame.srcdoc = "";
  el.previewErrors.textContent = "";
  el.previewErrors.hidden = true;
  el.playOut.textContent = "";
  el.playOut.hidden = true;
  el.playError.hidden = true;
});

el.btnHelp.addEventListener("click", () => (el.modal.hidden = false));
el.btnCloseModal.addEventListener("click", () => (el.modal.hidden = true));
el.modal.addEventListener("click", (e) => {
  if (e.target === el.modal) el.modal.hidden = true;
});

window.addEventListener("message", (e) => {
  if (e.source !== el.previewFrame.contentWindow || !e.data || e.data.type !== "runline-error") return;
  el.previewErrors.hidden = false;
  el.previewErrors.textContent += `${e.data.message}${e.data.line ? ` (line ${e.data.line})` : ""}\n`;
});

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "Enter") {
    e.preventDefault();
    if (!el.btnRun.disabled) run();
  } else if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    el.btnSave.click();
  } else if (e.key === "Escape") {
    el.modal.hidden = true;
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
  }
});

// drag & drop files/folders into the current HTML project
let dragDepth = 0;
el.editorPane.addEventListener("dragenter", (e) => {
  if (state.lang !== "html") return;
  e.preventDefault();
  dragDepth++;
  el.dropOverlay.hidden = false;
});
el.editorPane.addEventListener("dragover", (e) => e.preventDefault());
// Never let a stray drop navigate the tab away from the editor.
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());
el.editorPane.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    el.dropOverlay.hidden = true;
  }
});
el.editorPane.addEventListener("drop", async (e) => {
  if (state.lang !== "html") return;
  e.preventDefault();
  dragDepth = 0;
  el.dropOverlay.hidden = true;
  const dropped = await P.filesFromDataTransfer(e.dataTransfer);
  if (dropped.length === 1 && /\.zip$/i.test(dropped[0].name)) return importZipFile(dropped[0]);
  await mergeFiles(await P.filesFromFileList(dropped));
});

window.addEventListener("pagehide", () => {
  if (state.lang === "html") saveProjectNow();
  else localStorage.setItem(langStorageKey(state.lang), cm.getValue());
});

// resizable split
(function setupSplitter() {
  const saved = localStorage.getItem(PREF.split);
  if (saved) document.documentElement.style.setProperty("--editor-basis", saved);
  let dragging = false;
  el.splitter.addEventListener("pointerdown", (e) => {
    dragging = true;
    el.splitter.classList.add("dragging");
    el.splitter.setPointerCapture(e.pointerId);
    el.previewFrame.style.pointerEvents = "none";
  });
  el.splitter.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const rect = document.querySelector(".workspace").getBoundingClientRect();
    const pct = Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
    document.documentElement.style.setProperty("--editor-basis", pct.toFixed(1) + "%");
    cm.refresh();
  });
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    el.splitter.classList.remove("dragging");
    el.previewFrame.style.pointerEvents = "";
    localStorage.setItem(PREF.split, getComputedStyle(document.documentElement).getPropertyValue("--editor-basis").trim());
  };
  el.splitter.addEventListener("pointerup", stop);
  el.splitter.addEventListener("pointercancel", stop);
})();

// ---------- init ----------

async function init() {
  fetchRuntimes()
    .then(() => setStatus("Ready"))
    .catch(() => setStatus("Execution service unreachable — HTML preview and Python Play still work"));

  try {
    await refreshProjectList();
    if (!state.projects.length) {
      const legacy = migrateLegacyProject();
      const project = P.newProject(legacy ? "My project" : "Square Runner", legacy || undefined);
      await db.putProject(project);
      await refreshProjectList();
    }
    const wantedId = localStorage.getItem(PREF.projectId);
    const initial = state.projects.find((p) => p.id === wantedId) || state.projects[0];
    await openProject(initial.id);
  } catch (err) {
    // No IndexedDB (private mode / storage disabled): keep working in memory.
    state.project = P.newProject("Square Runner");
    state.projects = [state.project];
    renderFileList();
    loadActiveFile();
    setTimeout(() => setStatus("Storage unavailable — projects won't persist in this browser"), 1500);
  }

  el.langSelect.value = state.lang;
  if (state.lang !== "html") {
    cm.setOption("mode", modeForPath(LANG_FILE[state.lang]));
    cm.setOption("indentUnit", state.lang === "python" ? 4 : 2);
    setEditor(loadLangContent(state.lang));
  }
  applyChrome();
  cm.focus();
}

init();
