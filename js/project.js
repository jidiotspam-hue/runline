// Project model + import/export helpers for multi-file HTML projects.
// A project: { id, name, files: { path: { content: string|Uint8Array, binary, mime } }, activeFile, updatedAt }

import { starterHtmlFiles } from "./starters.js";

const JSZIP_SCRIPT = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";

const TEXT_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "json", "txt", "md", "svg", "xml", "csv", "yml", "yaml",
  "py", "java", "cpp", "cc", "cxx", "c", "h", "hpp", "ts", "map", "webmanifest", "glsl", "vert", "frag",
]);

const MIME_BY_EXT = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac",
  mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  json: "application/json", js: "text/javascript", mjs: "text/javascript", css: "text/css", html: "text/html",
  txt: "text/plain", md: "text/markdown",
};

const IGNORED_PATH = /(^|\/)(\.git|\.github|node_modules|__MACOSX)(\/|$)|(^|\/)\.DS_Store$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function extOf(path) {
  const base = path.split("/").pop();
  const i = base.lastIndexOf(".");
  return i === -1 ? "" : base.slice(i + 1).toLowerCase();
}

export function guessMime(path) {
  return MIME_BY_EXT[extOf(path)] || "application/octet-stream";
}

export function guessTextMime(path) {
  return { css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", svg: "image/svg+xml", html: "text/html", htm: "text/html" }[extOf(path)] || "text/plain";
}

export function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").split("?")[0].split("#")[0];
}

function looksLikeText(bytes) {
  const n = Math.min(bytes.length, 2048);
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 7 || (b > 13 && b < 32)) return false;
  }
  return true;
}

// Turn raw bytes into a file record, deciding text vs binary by extension, then by sniffing.
export function fileFromBytes(path, bytes) {
  const ext = extOf(path);
  const isText = TEXT_EXTENSIONS.has(ext) || (!MIME_BY_EXT[ext] && looksLikeText(bytes));
  if (isText) {
    return { content: new TextDecoder().decode(bytes), binary: false };
  }
  return { content: bytes, binary: true, mime: guessMime(path) };
}

export function newProject(name, files) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
    name,
    files: files || starterHtmlFiles(),
    activeFile: "index.html",
    updatedAt: Date.now(),
  };
}

export function entryHtmlName(files) {
  if (files["index.html"]) return "index.html";
  const candidates = Object.keys(files).filter((n) => /\.html?$/i.test(n)).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return candidates[0] || null;
}

// If every path shares one top-level folder (e.g. GitHub zips), strip it.
export function stripCommonRoot(paths) {
  const heads = new Set(paths.map((p) => p.split("/")[0]));
  if (heads.size !== 1) return (p) => p;
  const root = [...heads][0];
  if (!paths.every((p) => p.startsWith(root + "/"))) return (p) => p;
  return (p) => p.slice(root.length + 1);
}

async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

// Files from <input type=file>, <input webkitdirectory>, or drag & drop.
// Each File may carry a relative path (webkitRelativePath or ._relPath from drop traversal).
// stripRoot: drop a single shared top-level folder (right for zips / new projects,
// wrong when adding a folder to an existing project, where its name is the path).
export async function filesFromFileList(fileList, { stripRoot = false } = {}) {
  const out = {};
  for (const f of fileList) {
    const rel = normalizePath(f._relPath || f.webkitRelativePath || f.name);
    if (IGNORED_PATH.test(rel) || f.size > MAX_FILE_BYTES) continue;
    out[rel] = fileFromBytes(rel, await readBytes(f));
  }
  if (!stripRoot) return out;
  const strip = stripCommonRoot(Object.keys(out));
  const result = {};
  for (const [p, rec] of Object.entries(out)) result[strip(p)] = rec;
  return result;
}

// Recursively collect File objects from a DataTransfer (supports dropped folders in Chrome).
export async function filesFromDataTransfer(dt) {
  const items = Array.from(dt.items || []);
  const entries = items.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length) return Array.from(dt.files || []);

  const files = [];
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      file._relPath = prefix + entry.name;
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, prefix + entry.name + "/");
      } while (batch.length);
    }
  }
  for (const e of entries) await walk(e, "");
  return files;
}

const scriptLoads = new Map();
function loadScriptOnce(src) {
  if (!scriptLoads.has(src)) {
    const p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => {
        s.remove();
        scriptLoads.delete(src);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(s);
    });
    scriptLoads.set(src, p);
  }
  return scriptLoads.get(src);
}

export async function filesFromZip(arrayBuffer) {
  await loadScriptOnce(JSZIP_SCRIPT);
  const zip = await window.JSZip.loadAsync(arrayBuffer);
  const raw = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const rel = normalizePath(name);
    if (IGNORED_PATH.test(rel)) continue;
    const bytes = await entry.async("uint8array");
    if (bytes.length > MAX_FILE_BYTES) continue;
    raw[rel] = fileFromBytes(rel, bytes);
  }
  const strip = stripCommonRoot(Object.keys(raw));
  const result = {};
  for (const [p, rec] of Object.entries(raw)) result[strip(p)] = rec;
  return result;
}

export async function projectToZipBlob(project) {
  await loadScriptOnce(JSZIP_SCRIPT);
  const zip = new window.JSZip();
  for (const [path, rec] of Object.entries(project.files)) zip.file(path, rec.content);
  return zip.generateAsync({ type: "blob" });
}

// Parse github.com URLs: /owner/repo, /owner/repo/tree/branch/sub/dir, or owner/repo shorthand.
export function parseGitHubUrl(input) {
  const s = input.trim();
  let m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/(?:tree|blob)\/([^/\s]+)(?:\/(.*))?)?/);
  if (!m) m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, ""), branch: m[3] || null, subdir: m[4] ? normalizePath(m[4]).replace(/\/$/, "") : "" };
}

export async function filesFromGitHub(url, onProgress = () => {}) {
  const ref = parseGitHubUrl(url);
  if (!ref) throw new Error("That doesn't look like a GitHub repo URL.");
  const api = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;

  let branch = ref.branch;
  if (!branch) {
    onProgress("Looking up repo…");
    const res = await fetch(api);
    if (!res.ok) throw new Error(res.status === 404 ? "Repo not found (private repos can't be imported)." : `GitHub API error ${res.status}`);
    branch = (await res.json()).default_branch;
  }

  onProgress("Listing files…");
  const treeRes = await fetch(`${api}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (!treeRes.ok) throw new Error(treeRes.status === 403 ? "GitHub API rate limit hit — try again in a bit." : `GitHub API error ${treeRes.status}`);
  const tree = await treeRes.json();

  const prefix = ref.subdir ? ref.subdir + "/" : "";
  const blobs = tree.tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix) && !IGNORED_PATH.test(t.path) && t.size <= MAX_FILE_BYTES);
  if (!blobs.length) throw new Error("No files found at that path.");
  if (blobs.length > 400) throw new Error(`That's ${blobs.length} files — import a subfolder instead (…/tree/${branch}/some/dir).`);

  const files = {};
  let done = 0;
  const queue = blobs.slice();
  async function worker() {
    while (queue.length) {
      const b = queue.shift();
      const rawUrl = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${b.path.split("/").map(encodeURIComponent).join("/")}`;
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`Failed to fetch ${b.path} (${res.status})`);
      const rel = b.path.slice(prefix.length);
      files[rel] = fileFromBytes(rel, new Uint8Array(await res.arrayBuffer()));
      done++;
      onProgress(`Downloading ${done}/${blobs.length}…`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, blobs.length) }, worker));
  return { name: ref.subdir ? ref.subdir.split("/").pop() : ref.repo, files };
}
