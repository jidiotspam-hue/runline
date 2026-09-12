// Turns a multi-file project into ONE self-contained HTML document for a sandboxed
// srcdoc iframe. Linked CSS/JS get inlined; binary assets become data: URLs, which
// work inside an opaque-origin sandbox (blob: URLs would not). A runtime shim then
// resolves asset paths that the page's JS assigns at runtime (img.src, new Audio(),
// fetch, XHR), which is how most canvas games load their sprites and sounds.

import { normalizePath, entryHtmlName } from "./project.js";
import { bytesToBase64 } from "./starters.js";

function dataUrlFor(rec) {
  return `data:${rec.mime || "application/octet-stream"};base64,${bytesToBase64(rec.content)}`;
}

function resolveRelative(fromPath, target) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(target)) return null; // absolute / external / anchor
  const clean = normalizePath(target);
  if (target.startsWith("/")) return clean;
  const baseParts = fromPath.split("/").slice(0, -1);
  const parts = clean.split("/");
  const out = [...baseParts];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return out.join("/");
}

function rewriteCssUrls(css, fromPath, lookup) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, quote, target) => {
    const rec = lookup(fromPath, target);
    if (!rec) return whole;
    const url = rec.binary ? dataUrlFor(rec) : `data:${rec.mime || "text/plain"};charset=utf-8,${encodeURIComponent(rec.content)}`;
    return `url(${quote}${url}${quote})`;
  });
}

function buildShim(assetMap) {
  return `(function(){
  var ASSETS = ${JSON.stringify(assetMap)};
  function norm(v){ return v.replace(/^\\.\\//, "").replace(/^\\//, "").split("?")[0].split("#")[0]; }
  function resolve(v){
    if (typeof v !== "string") return v;
    var n = norm(v);
    return Object.prototype.hasOwnProperty.call(ASSETS, n) ? ASSETS[n] : v;
  }
  window.__runlineResolve = resolve;
  [window.HTMLImageElement, window.HTMLMediaElement, window.HTMLSourceElement, window.HTMLScriptElement, window.HTMLLinkElement].forEach(function(ctor){
    if (!ctor) return;
    var attr = ctor === window.HTMLLinkElement ? "href" : "src";
    var desc = Object.getOwnPropertyDescriptor(ctor.prototype, attr);
    if (!desc || !desc.set) return;
    Object.defineProperty(ctor.prototype, attr, {
      configurable: true, enumerable: desc.enumerable,
      get: desc.get,
      set: function(v){ desc.set.call(this, resolve(v)); }
    });
  });
  var origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value){
    var n = String(name).toLowerCase();
    if ((n === "src" || n === "href" || n === "poster") && typeof value === "string") value = resolve(value);
    return origSetAttribute.call(this, name, value);
  };
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init){
      if (typeof input === "string") input = resolve(input);
      else if (input && input.url && typeof input.url === "string") { var r = resolve(input.url); if (r !== input.url) input = new Request(r, input); }
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
  if (window.Audio) {
    var OrigAudio = window.Audio;
    window.Audio = function(src){ var a = new OrigAudio(); if (src !== undefined) a.src = resolve(src); return a; };
    window.Audio.prototype = OrigAudio.prototype;
  }
  if (window.Image) {
    var OrigImage = window.Image;
    window.Image = function(w, h){ return w === undefined ? new OrigImage() : h === undefined ? new OrigImage(w) : new OrigImage(w, h); };
    window.Image.prototype = OrigImage.prototype;
  }
  window.addEventListener("error", function(e){
    if (e && e.message) parent.postMessage({ type: "runline-error", message: e.message, line: e.lineno }, "*");
  });
})();`;
}

export function buildPreviewHtml(files) {
  const entry = entryHtmlName(files);
  if (!entry) {
    return "<body style='font-family:sans-serif;color:#555;padding:24px'>Add an <b>index.html</b> to preview this project.</body>";
  }

  const lookup = (fromPath, target) => {
    const p = resolveRelative(fromPath, target);
    return p !== null ? files[p] || null : null;
  };

  const assetMap = {};
  for (const [path, rec] of Object.entries(files)) {
    if (rec.binary) assetMap[path] = dataUrlFor(rec);
    else if (!/\.html?$/i.test(path)) assetMap[path] = `data:${rec.mime || guessTextMime(path)};charset=utf-8,${encodeURIComponent(path.endsWith(".css") ? rewriteCssUrls(rec.content, path, lookup) : rec.content)}`;
  }

  const doc = new DOMParser().parseFromString(files[entry].content, "text/html");

  doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach((link) => {
    const rec = lookup(entry, link.getAttribute("href"));
    if (!rec || rec.binary) return;
    const style = doc.createElement("style");
    style.textContent = rewriteCssUrls(rec.content, resolveRelative(entry, link.getAttribute("href")), lookup);
    link.replaceWith(style);
  });

  doc.querySelectorAll("script[src]").forEach((script) => {
    const src = script.getAttribute("src");
    const rec = lookup(entry, src);
    if (!rec || rec.binary) return;
    if (script.type === "module") {
      script.setAttribute("src", assetMap[resolveRelative(entry, src)]);
      return;
    }
    const inline = doc.createElement("script");
    for (const a of script.attributes) if (a.name !== "src") inline.setAttribute(a.name, a.value);
    inline.textContent = rec.content;
    script.replaceWith(inline);
  });

  doc.querySelectorAll("[src], [href], [poster]").forEach((el) => {
    for (const attr of ["src", "href", "poster"]) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      if (el.tagName === "A" && attr === "href") continue;
      const p = resolveRelative(entry, v);
      if (p !== null && assetMap[p]) el.setAttribute(attr, assetMap[p]);
    }
  });

  doc.querySelectorAll("style").forEach((style) => {
    style.textContent = rewriteCssUrls(style.textContent, entry, lookup);
  });

  const shim = doc.createElement("script");
  shim.textContent = buildShim(assetMap);
  doc.head.insertBefore(shim, doc.head.firstChild);

  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}

function guessTextMime(path) {
  if (path.endsWith(".css")) return "text/css";
  if (/\.(m?js)$/.test(path)) return "text/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "text/plain";
}
