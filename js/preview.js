// Turns a multi-file project into ONE self-contained HTML document for a sandboxed
// srcdoc iframe. Linked CSS/JS get inlined; binary assets become data: URLs, which
// work inside an opaque-origin sandbox (blob: URLs would not). A runtime shim then
// resolves asset paths that the page's JS assigns at runtime (img.src, new Audio(),
// fetch, XHR, innerHTML…), which is how most canvas games load sprites and sounds,
// and polyfills the storage APIs that throw in an opaque origin.

import { normalizePath, entryHtmlName, guessTextMime } from "./project.js";
import { bytesToBase64 } from "./starters.js";

function dataUrlFor(rec, path) {
  if (rec.binary) return `data:${rec.mime || "application/octet-stream"};base64,${bytesToBase64(rec.content)}`;
  return `data:${guessTextMime(path)};charset=utf-8,${encodeURIComponent(rec.content)}`;
}

function resolveRelative(fromPath, target) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(target)) return null; // absolute / external / anchor
  const clean = normalizePath(target);
  const baseParts = target.startsWith("/") ? [] : fromPath.split("/").slice(0, -1);
  const out = [...baseParts];
  for (const part of clean.split("/")) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return out.join("/");
}

function rewriteCssUrls(css, fromPath, files) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, quote, target) => {
    const p = resolveRelative(fromPath, target.trim());
    const rec = p !== null ? files[p] : null;
    return rec ? `url(${quote}${dataUrlFor(rec, p)}${quote})` : whole;
  });
}

function buildShim(assetMap, entryDir) {
  return `(function(){
  var ASSETS = ${JSON.stringify(assetMap)};
  var BASE = ${JSON.stringify(entryDir)};
  function resolve(v){
    if (typeof v !== "string" || /^(?:[a-z]+:|\\/\\/|#)/i.test(v)) return v;
    var clean = v.split("?")[0].split("#")[0];
    var parts = (clean.charAt(0) === "/" ? [] : BASE.slice()).concat(clean.split("/"));
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === "..") out.pop(); else if (p !== "." && p !== "") out.push(p);
    }
    var key = out.join("/");
    return Object.prototype.hasOwnProperty.call(ASSETS, key) ? ASSETS[key] : v;
  }
  window.__runlineResolve = resolve;

  // Storage APIs throw in an opaque-origin sandbox; give games an in-memory stand-in.
  function memoryStorage(){
    var data = {};
    var api = {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function(k, v){ data[k] = String(v); },
      removeItem: function(k){ delete data[k]; },
      clear: function(){ data = {}; },
      key: function(i){ return Object.keys(data)[i] || null; }
    };
    Object.defineProperty(api, "length", { get: function(){ return Object.keys(data).length; } });
    return api;
  }
  ["localStorage", "sessionStorage"].forEach(function(name){
    try { void window[name]; } catch (e) {
      try { Object.defineProperty(window, name, { value: memoryStorage(), configurable: true }); } catch (e2) {}
    }
  });

  var URL_ATTRS = { src: 1, href: 1, poster: 1 };
  [window.HTMLImageElement, window.HTMLMediaElement, window.HTMLSourceElement, window.HTMLScriptElement, window.HTMLLinkElement, window.HTMLIFrameElement].forEach(function(ctor){
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
    if (URL_ATTRS[String(name).toLowerCase()] && typeof value === "string") value = resolve(value);
    return origSetAttribute.call(this, name, value);
  };
  // Markup created via innerHTML / document.write / templates bypasses the setters.
  function fixTree(root){
    if (!root || root.nodeType !== 1) return;
    var list = [root].concat(Array.prototype.slice.call(root.querySelectorAll("[src],[href],[poster]")));
    list.forEach(function(el){
      for (var a in URL_ATTRS) {
        var v = el.getAttribute && el.getAttribute(a);
        if (v && el.tagName !== "A") { var r = resolve(v); if (r !== v) origSetAttribute.call(el, a, r); }
      }
    });
  }
  new MutationObserver(function(records){
    records.forEach(function(m){
      if (m.type === "childList") m.addedNodes.forEach(fixTree);
      else if (m.target.nodeType === 1 && m.target.tagName !== "A") {
        var v = m.target.getAttribute(m.attributeName);
        if (v) { var r = resolve(v); if (r !== v) origSetAttribute.call(m.target, m.attributeName, r); }
      }
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "href", "poster"] });

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init){
      if (typeof input === "string") input = resolve(input);
      else if (input && typeof input.url === "string") { var r = resolve(input.url); if (r !== input.url) input = new Request(r, input); }
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
  const entryDir = entry.split("/").slice(0, -1);

  const assetMap = {};
  for (const [path, rec] of Object.entries(files)) {
    if (/\.html?$/i.test(path)) continue;
    assetMap[path] = path.endsWith(".css") && !rec.binary
      ? `data:text/css;charset=utf-8,${encodeURIComponent(rewriteCssUrls(rec.content, path, files))}`
      : dataUrlFor(rec, path);
  }

  const doc = new DOMParser().parseFromString(files[entry].content, "text/html");
  const lookup = (target) => {
    const p = resolveRelative(entry, target);
    return p !== null && files[p] ? { path: p, rec: files[p] } : null;
  };

  doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach((link) => {
    const hit = lookup(link.getAttribute("href"));
    if (!hit || hit.rec.binary) return;
    const style = doc.createElement("style");
    style.textContent = rewriteCssUrls(hit.rec.content, hit.path, files);
    link.replaceWith(style);
  });

  const deferred = [];
  doc.querySelectorAll("script[src]").forEach((script) => {
    const hit = lookup(script.getAttribute("src"));
    if (!hit || hit.rec.binary) return;
    if (script.type === "module") {
      script.setAttribute("src", assetMap[hit.path]);
      return;
    }
    const inline = doc.createElement("script");
    for (const a of script.attributes) if (!["src", "defer", "async"].includes(a.name)) inline.setAttribute(a.name, a.value);
    inline.textContent = hit.rec.content.replace(/<\/script/gi, "<\\/script");
    if (script.hasAttribute("defer") || script.hasAttribute("async")) {
      script.remove();
      deferred.push(inline); // inline scripts can't defer; run them after the document instead
    } else {
      script.replaceWith(inline);
    }
  });
  for (const s of deferred) doc.body.appendChild(s);

  doc.querySelectorAll("[src], [href], [poster]").forEach((el) => {
    for (const attr of ["src", "href", "poster"]) {
      const v = el.getAttribute(attr);
      if (!v || (el.tagName === "A" && attr === "href")) continue;
      const p = resolveRelative(entry, v);
      if (p !== null && assetMap[p]) el.setAttribute(attr, assetMap[p]);
    }
  });

  doc.querySelectorAll("style").forEach((style) => {
    style.textContent = rewriteCssUrls(style.textContent, entry, files);
  });

  const shim = doc.createElement("script");
  shim.textContent = buildShim(assetMap, entryDir);
  doc.head.insertBefore(shim, doc.head.firstChild);

  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
