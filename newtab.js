/* Aurora Tab — Ultimate Glass New Tab
 * vanilla JS, MV3, no build step
 */
(() => {
"use strict";

// ---------- Storage abstraction ----------
const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
const store = {
  async get(k) {
    if (hasChrome) {
      return new Promise(r => chrome.storage.local.get(k, v => r(v[k])));
    }
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
  },
  async set(k, v) {
    if (hasChrome) {
      return new Promise(r => chrome.storage.local.set({ [k]: v }, r));
    }
    localStorage.setItem(k, JSON.stringify(v));
  },
};

// IndexedDB for big blobs (videos / images)
const idb = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const req = indexedDB.open("aurora", 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore("blobs");
      req.onsuccess = e => { this._db = e.target.result; res(this._db); };
      req.onerror = e => rej(e);
    });
  },
  async put(key, blob) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put(blob, key);
      tx.oncomplete = res; tx.onerror = rej;
    });
  },
  async get(key) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction("blobs", "readonly");
      const r = tx.objectStore("blobs").get(key);
      r.onsuccess = () => res(r.result); r.onerror = rej;
    });
  },
  async del(key) {
    const db = await this.open();
    return new Promise((res) => {
      const tx = db.transaction("blobs", "readwrite");
      tx.objectStore("blobs").delete(key); tx.oncomplete = res;
    });
  },
};

// ---------- State ----------
const DEFAULT_WIDGETS = {
  greeting: { id: "greeting", enabled: true, x: 0,   y: 0,   w: 420, h: 140 },
  clock:    { id: "clock",    enabled: true, x: 440, y: 0,   w: 320, h: 140 },
  weather:  { id: "weather",  enabled: true, x: 0,   y: 160, w: 220, h: 180 },
  pomodoro: { id: "pomodoro", enabled: true, x: 240, y: 160, w: 220, h: 180 },
  calendar: { id: "calendar", enabled: true, x: 480, y: 160, w: 240, h: 220 },
  quote:    { id: "quote",    enabled: false, x: 0,  y: 360, w: 420, h: 130 },
  todos:    { id: "todos",    enabled: true, x: 740, y: 0,   w: 280, h: 240 },
  links:    { id: "links",    enabled: false, x: 740, y: 260, w: 280, h: 200 },
};
const DEFAULT_PROFILE = () => ({
  name: "Personal",
  color: "#7c3aed",
  data: {
    user: "",
    theme: "dark",
    accent: "#7c3aed",
    nameFrom: "#60a5fa",
    nameTo: "#f472b6",
    blur: 24,
    opacity: 32,
    radius: 22,
    font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
    minimal: false,
    engine: "https://www.google.com/search?q=",
    use24h: false,
    showSeconds: true,
    weatherCity: "",
    weatherCoords: null,
    customCss: "",
    wp: { type: "gradient", src: "", tint: 25, brightness: 100, mediaBlur: 0, opacity: 100, speed: 100, volume: 0, muted: true, rotate: false, rotateMins: 30, collectionFilter: "All", collection: [], activeIdx: -1 },
    widgets: JSON.parse(JSON.stringify(DEFAULT_WIDGETS)),
    shortcuts: [
      { name: "GitHub", url: "https://github.com", color: "#24292e" },
      { name: "YouTube", url: "https://youtube.com", color: "#ff0000" },
      { name: "Gmail", url: "https://mail.google.com", color: "#ea4335" },
    ],
    todos: [],
    notes: "",
  },
});

let STATE = {
  profiles: { Personal: DEFAULT_PROFILE() },
  activeProfile: "Personal",
};
const cur = () => STATE.profiles[STATE.activeProfile].data;
const save = () => store.set("aurora", STATE);

// ---------- Init ----------
async function init() {
  const loaded = await store.get("aurora");
  if (loaded && loaded.profiles) STATE = loaded;
  await render();
  ensureWatermark();
  bindGlobalEvents();
}

// ---------- Persistent watermark (hardcoded, resilient at runtime) ----------
function createWatermarkElements() {
  if (document.getElementById("aurora-watermark-left") && document.getElementById("aurora-watermark-style")) return;

  // style element with !important rules to make override harder
  let style = document.getElementById("aurora-watermark-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "aurora-watermark-style";
    style.textContent = `
#aurora-watermark-left {
  position: fixed !important;
  bottom: 10px !important;
  left: 12px !important;
  font-size: 14px !important;
  font-weight: 800 !important;
  color: rgba(255,255,255,1) !important;
  text-shadow: 0 1px 0 rgba(0,0,0,0.85) !important;
  pointer-events: none !important;
  user-select: none !important;
  z-index: 2147483647 !important;
  background: rgba(0,0,0,0.42) !important;
  padding: 6px 10px !important;
  border-radius: 8px !important;
  opacity: 0.95 !important;
  -webkit-font-smoothing: antialiased !important;
  font-family: var(--font, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif) !important;
}
`;
    document.head.appendChild(style);
  }

  if (!document.getElementById("aurora-watermark-left")) {
    const left = document.createElement("div");
    left.id = "aurora-watermark-left";
    left.textContent = "Developed by Mourya Monavarty";
    document.body.appendChild(left);
  }
}

function ensureWatermark() {
  try { createWatermarkElements(); } catch (e) { console.error('[Aurora Watermark] create failed', e); }

  // Observe DOM and re-create watermark or style if removed
  const obs = new MutationObserver(() => {
    try { createWatermarkElements(); } catch (e) { console.error('[Aurora Watermark] recreate failed', e); }
  });
  obs.observe(document.documentElement || document, { childList: true, subtree: true, attributes: false });

  // Periodic fallback restore
  setInterval(() => { try { createWatermarkElements(); } catch (e) {} }, 3000);

  // Mark installation flag (non-writable) to make accidental removal harder
  try {
    Object.defineProperty(window, '__aurora_watermark_installed__', { value: true, configurable: false, writable: false });
  } catch (e) {}
}

async function render() {
  applyTheme();
  renderProfileSwitcher();
  renderWidgets();
  renderShortcuts();
  renderSettings();
  renderTodos();
  renderNotes();
  await loadWallpaper();
  startTimers();
  startWallpaperRotation();
}

// ---------- Theme / appearance ----------
function applyTheme() {
  const c = cur();
  const body = document.body;
  let theme = c.theme;
  if (theme === "auto") {
    theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  body.dataset.theme = theme;
  const root = document.documentElement.style;
  root.setProperty("--blur", c.blur + "px");
  root.setProperty("--opacity", (c.opacity / 100).toString());
  root.setProperty("--radius", c.radius + "px");
  root.setProperty("--accent", c.accent);
  root.setProperty("--name-from", c.nameFrom);
  root.setProperty("--name-to", c.nameTo);
  root.setProperty("--font", c.font);
  document.body.style.fontFamily = c.font;
  // tint + brightness
  root.setProperty("--tint", (c.wp.tint / 100).toString());
  root.setProperty("--bright", (c.wp.brightness / 100).toString());
  root.setProperty("--wp-blur", (c.wp.mediaBlur || 0) + "px");
  root.setProperty("--wp-opacity", ((c.wp.opacity ?? 100) / 100).toString());

  // custom CSS
  let css = document.getElementById("custom-css-el");
  if (!css) { css = document.createElement("style"); css.id = "custom-css-el"; document.head.appendChild(css); }
  css.textContent = c.customCss || "";

  // minimalist mode
  document.getElementById("canvas").classList.toggle("hidden", false);
  if (c.minimal) {
    document.querySelectorAll(".widget").forEach(w => {
      if (!["clock", "greeting"].includes(w.dataset.id)) w.classList.add("hidden");
    });
  }
}

// ---------- Wallpaper ----------
let _lastObjUrl = null;
let _activeObjectKey = null;
let _thumbUrls = new Map();
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|webm)$/i;

function normalizeWallpaperSettings() {
  const wp = cur().wp || {};
  cur().wp = {
    type: wp.type || "gradient",
    src: wp.src || "",
    tint: wp.tint ?? 25,
    brightness: wp.brightness ?? 100,
    mediaBlur: wp.mediaBlur ?? 0,
    opacity: wp.opacity ?? 100,
    speed: wp.speed ?? 100,
    volume: wp.volume ?? 0,
    muted: wp.muted ?? true,
    rotate: wp.rotate ?? false,
    rotateMins: wp.rotateMins ?? 30,
    collectionFilter: wp.collectionFilter || "All",
    collection: Array.isArray(wp.collection) ? wp.collection : [],
    activeIdx: Number.isInteger(wp.activeIdx) ? wp.activeIdx : -1,
  };
}

function getWallpaperType(file) {
  const name = file.name || "";
  if (VIDEO_TYPES.has(file.type) || VIDEO_EXT.test(name)) return "video";
  if (IMAGE_TYPES.has(file.type) || IMAGE_EXT.test(name)) return "image";
  return null;
}

function revokeActiveWallpaperUrl(nextKey) {
  if (_lastObjUrl && _activeObjectKey !== nextKey) {
    try { URL.revokeObjectURL(_lastObjUrl); } catch {}
    _lastObjUrl = null;
    _activeObjectKey = null;
  }
}

async function sourceToObjectUrl(src) {
  if (!src || !src.startsWith("idb:")) {
    revokeActiveWallpaperUrl(null);
    return src || "";
  }
  const key = src.slice(4);
  if (_lastObjUrl && _activeObjectKey === key) return _lastObjUrl;
  revokeActiveWallpaperUrl(key);
  try {
    const blob = await idb.get(key);
    if (!blob) throw new Error("Stored wallpaper blob was not found");
    _lastObjUrl = URL.createObjectURL(blob);
    _activeObjectKey = key;
    return _lastObjUrl;
  } catch (err) {
    console.error("[Aurora Wallpaper] IndexedDB read failed", err);
    showToast("Wallpaper could not be loaded from storage.", "error");
    return "";
  }
}

function applyWallpaperSettingsToVideo() {
  const wp = cur().wp;
  const vid = document.getElementById("wp-video");
  if (!vid) return;
  vid.autoplay = true;
  vid.loop = true;
  vid.playsInline = true;
  vid.preload = "auto";
  vid.muted = !!wp.muted;
  vid.volume = Math.min(1, Math.max(0, (wp.volume ?? 0) / 100));
  vid.playbackRate = Math.max(0.25, (wp.speed || 100) / 100);
}

async function applyWallpaperSource(type, src, opts = {}) {
  const img = document.getElementById("wp-img");
  const vid = document.getElementById("wp-video");
  const objectKey = src && src.startsWith("idb:") ? src.slice(4) : null;
  let resolved = opts.objectUrl || src;
  if (opts.objectUrl) {
    revokeActiveWallpaperUrl(objectKey);
    _lastObjUrl = opts.objectUrl;
    _activeObjectKey = objectKey;
  }
  if (!opts.objectUrl) resolved = await sourceToObjectUrl(src);
  if (!resolved || type === "gradient") {
    revokeActiveWallpaperUrl(null);
    vid.classList.add("hidden");
    try { vid.pause(); } catch {}
    vid.removeAttribute("src");
    vid.load();
    img.classList.remove("hidden");
    img.style.backgroundImage = `linear-gradient(135deg, ${cur().accent}33, #0b0b12 60%, #1a1033)`;
    console.info("[Aurora Wallpaper] Default gradient applied");
    return;
  }
  if (type === "video") {
    img.classList.add("hidden");
    img.style.backgroundImage = "none";
    vid.classList.remove("hidden"); vid.style.display="block"; vid.style.zIndex="0";
    applyWallpaperSettingsToVideo();
    if (vid.getAttribute("src") !== resolved) {
      vid.src = resolved;
      vid.load();
    }
    vid.onloadeddata = () => console.info("[Aurora Wallpaper] Live wallpaper loaded");
    vid.onerror = () => {
      console.error("[Aurora Wallpaper] Video load failed", resolved);
      showToast("Live wallpaper failed to load.", "error");
      applyWallpaperSource("gradient", "");
    };
    try {
      await vid.play();
      console.info("[Aurora Wallpaper] Live wallpaper playing");
    } catch (err) {
      console.warn("[Aurora Wallpaper] Autoplay failed", err);
      showToast("Video is ready. Press Play in Wallpaper settings.", "info");
    }
    return;
  }
  vid.classList.add("hidden");
  try { vid.pause(); } catch {}
  vid.removeAttribute("src");
  vid.load();
  img.classList.remove("hidden");
  img.style.backgroundImage = `url("${resolved}")`; img.style.display="block"; img.style.zIndex="0";
  console.info("[Aurora Wallpaper] Image wallpaper applied");
}

async function loadWallpaper() {
  normalizeWallpaperSettings();
  const wp = cur().wp;
  await applyWallpaperSource(wp.type, wp.src);
}

async function setWallpaperFromFile(file) {
  if (!file) return;
  normalizeWallpaperSettings();
  const type = getWallpaperType(file);
  if (!type) {
    console.warn("[Aurora Wallpaper] Invalid file type", file.type, file.name);
    showToast("Unsupported wallpaper type. Use JPG, PNG, WebP, GIF, MP4, or WebM.", "error");
    return;
  }
  const signature = `${file.name}|${file.size}|${file.lastModified}`;
  const existingIdx = cur().wp.collection.findIndex(item => item.signature === signature && item.key);
  if (existingIdx >= 0) {
    const existing = cur().wp.collection[existingIdx];
    cur().wp.activeIdx = existingIdx;
    cur().wp.type = existing.type;
    cur().wp.src = "idb:" + existing.key;
    await save();
    await loadWallpaper();
    renderSettings();
    showToast("Wallpaper restored from history.", "success");
    return;
  }
  const key = `wp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const objectUrl = URL.createObjectURL(file);
  const item = { key, type, name: file.name || (type === "video" ? "Live wallpaper" : "Image wallpaper"), size: file.size, mime: file.type, createdAt: Date.now(), favorite: false, collectionName: "Uploads", signature };
  const previous = { type: cur().wp.type, src: cur().wp.src, activeIdx: cur().wp.activeIdx };
  cur().wp.type = type;
  cur().wp.src = "idb:" + key;
  cur().wp.collection.unshift(item);
  cur().wp.activeIdx = 0;
  await applyWallpaperSource(type, cur().wp.src, { objectUrl });
  try {
    await idb.put(key, file);
    await save();
    console.info("[Aurora Wallpaper] Upload saved", item);
    showToast(`${type === "video" ? "Live" : "Image"} wallpaper applied.`, "success");
  } catch (e) {
    console.error("[Aurora Wallpaper] IndexedDB write failed", e);
    cur().wp.collection = cur().wp.collection.filter(w => w.key !== key);
    cur().wp.type = previous.type;
    cur().wp.src = previous.src;
    cur().wp.activeIdx = previous.activeIdx;
    try { URL.revokeObjectURL(objectUrl); } catch {}
    await save();
    await loadWallpaper();
    showToast("Could not save wallpaper. Try a smaller file.", "error");
  } finally {
    renderSettings();
  }
}

async function setWallpaperFromUrl(url) {
  if (!url) return;
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(url);
  cur().wp.type = isVideo ? "video" : "image";
  cur().wp.src = url;
  cur().wp.collection.unshift({ url, type: cur().wp.type, name: url.split("/").pop() || "Remote wallpaper", createdAt: Date.now(), favorite: false, collectionName: "URLs" });
  cur().wp.activeIdx = 0;
  await save(); await loadWallpaper(); renderSettings();
}

let rotateTimer = null;
function startWallpaperRotation() {
  if (rotateTimer) clearInterval(rotateTimer);
  const wp = cur().wp;
  if (!wp.rotate || wp.collection.length < 2) return;
  rotateTimer = setInterval(async () => {
    const c = cur();
    const pool = c.wp.collection
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => c.wp.collectionFilter === "Favorites" ? item.favorite : c.wp.collectionFilter === "All" || (item.collectionName || "Uploads") === c.wp.collectionFilter);
    if (pool.length < 2) return;
    const pos = Math.max(0, pool.findIndex(x => x.index === c.wp.activeIdx));
    const { item, index: next } = pool[(pos + 1) % pool.length];
    c.wp.activeIdx = next;
    c.wp.type = item.type;
    c.wp.src = item.url ? item.url : "idb:" + item.key;
    await save(); await loadWallpaper();
  }, Math.max(1, wp.rotateMins) * 60 * 1000);
}

// ---------- Widgets ----------
const WIDGET_LABELS = {
  greeting: "Greeting & Name",
  clock: "Clock",
  weather: "Weather",
  pomodoro: "Pomodoro Timer",
  calendar: "Calendar",
  quote: "Quote of the Day",
  todos: "Tasks (mini)",
  links: "Quick Links",
};

function renderWidgets() {
  const canvas = document.getElementById("canvas");
  canvas.innerHTML = "";
  const widgets = cur().widgets;
  Object.values(widgets).forEach(w => {
    if (!w.enabled) return;
    const el = document.createElement("div");
    el.className = "widget w-" + w.id;
    el.dataset.id = w.id;
    el.style.left = w.x + "px";
    el.style.top = w.y + "px";
    el.style.width = w.w + "px";
    el.style.height = w.h + "px";
    el.innerHTML = renderWidgetBody(w.id);
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    el.appendChild(handle);
    canvas.appendChild(el);
    makeDraggable(el, w);
    makeResizable(el, handle, w);
  });
  updateClock(); updateWeather(); renderCalendar(); renderQuote(); renderMiniTodos(); renderQuickLinks();
}

function renderWidgetBody(id) {
  switch (id) {
    case "clock":   return `<div><span class="time" id="w-time">--:--</span><span class="ampm" id="w-ampm"></span></div><div class="date" id="w-date">—</div>`;
    case "greeting":return `<div class="greet" id="w-greet">Hello</div><div class="name" id="w-name" contenteditable="true" spellcheck="false" data-placeholder="Click to set your name">there</div>`;
    case "weather": return `<div class="widget-title">Weather</div><div class="ico-big" id="w-wico">⛅</div><div class="temp" id="w-temp">--°</div><div class="cond" id="w-cond">—</div><div class="loc" id="w-loc">Set city in settings</div>`;
    case "pomodoro":return `<div class="widget-title">Focus</div><div class="ring" id="w-pomo">25:00</div><div class="row"><button data-pomo="start">Start</button><button data-pomo="pause">Pause</button><button data-pomo="reset">Reset</button></div>`;
    case "calendar":return `<div class="widget-title">Calendar</div><h4 id="w-cal-h"></h4><table id="w-cal-t"></table>`;
    case "quote":   return `<div class="widget-title">Today</div><div class="q" id="w-q">—</div><div class="a" id="w-a"></div>`;
    case "todos":   return `<div class="widget-title">Tasks</div><div class="mini-add"><input id="w-mini-todo-input" placeholder="New task..." /><button id="w-mini-todo-add">+</button></div><ul class="mini-list" id="w-mini-todo"></ul>`;
    case "links":   return `<div class="widget-title">Quick Links</div><div class="grid" id="w-links"></div>`;
  }
  return "";
}

function canvasBounds() {
  const c = document.getElementById("canvas");
  return { w: c.clientWidth, h: c.clientHeight };
}
function makeDraggable(el, model) {
  el.addEventListener("mousedown", e => {
    if (!document.body.classList.contains("edit-mode")) return;
    if (e.target.classList.contains("resize-handle")) return;
    if (e.target.closest("input,textarea,button,[contenteditable='true']")) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const ox = model.x, oy = model.y;
    el.classList.add("dragging");
    const move = ev => {
      const b = canvasBounds();
      model.x = Math.min(Math.max(0, ox + ev.clientX - startX), Math.max(0, b.w - model.w));
      model.y = Math.min(Math.max(0, oy + ev.clientY - startY), Math.max(0, b.h - model.h));
      el.style.left = model.x + "px"; el.style.top = model.y + "px";
    };
    const up = () => {
      el.classList.remove("dragging");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      save();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}
function makeResizable(el, handle, model) {
  handle.addEventListener("mousedown", e => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ow = model.w, oh = model.h;
    const move = ev => {
      const b = canvasBounds();
      model.w = Math.min(Math.max(140, ow + ev.clientX - sx), b.w - model.x);
      model.h = Math.min(Math.max(100, oh + ev.clientY - sy), b.h - model.y);
      el.style.width = model.w + "px"; el.style.height = model.h + "px";
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      save();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}

// ---------- Timers/widget data ----------
function updateClock() {
  const c = cur();
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  let ampm = "";
  if (!c.use24h) { ampm = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; }
  const time = `${String(h).padStart(2, "0")}:${m}${c.showSeconds ? ":" + s : ""}`;
  const t = document.getElementById("w-time"); if (t) t.textContent = time;
  const a = document.getElementById("w-ampm"); if (a) a.textContent = ampm;
  const d = document.getElementById("w-date");
  if (d) d.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const g = document.getElementById("w-greet");
  if (g) {
    const hr = now.getHours();
    g.textContent = hr < 5 ? "Good night" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : hr < 21 ? "Good evening" : "Good night";
  }
  const n = document.getElementById("w-name");
  if (n && document.activeElement !== n) n.textContent = c.user || "there";
  if (n && !n._bound) {
    n._bound = true;
    n.addEventListener("focus", () => { if (n.textContent === "there") n.textContent = ""; });
    n.addEventListener("blur", () => {
      const v = n.textContent.trim();
      cur().user = v;
      n.textContent = v || "there";
      save();
    });
    n.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); n.blur(); } });
  }
}

function renderCalendar() {
  const wrap = document.getElementById("w-cal-t");
  const head = document.getElementById("w-cal-h");
  if (!wrap) return;
  const now = new Date();
  head.textContent = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let html = "<thead><tr>" + ["S","M","T","W","T","F","S"].map(d => `<th>${d}</th>`).join("") + "</tr></thead><tbody><tr>";
  for (let i = 0; i < first; i++) html += "<td></td>";
  for (let d = 1; d <= days; d++) {
    const isToday = d === now.getDate();
    html += `<td class="${isToday ? "today" : ""}">${d}</td>`;
    if ((first + d) % 7 === 0) html += "</tr><tr>";
  }
  html += "</tr></tbody>";
  wrap.innerHTML = html;
}

const QUOTES = [
  ["Simplicity is the ultimate sophistication.", "Leonardo da Vinci"],
  ["Stay hungry. Stay foolish.", "Steve Jobs"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["The best way to predict the future is to invent it.", "Alan Kay"],
  ["Whatever you are, be a good one.", "Abraham Lincoln"],
  ["Done is better than perfect.", "Sheryl Sandberg"],
];
function renderQuote() {
  const q = document.getElementById("w-q"); const a = document.getElementById("w-a");
  if (!q) return;
  const day = Math.floor(Date.now() / 86400000) % QUOTES.length;
  q.textContent = "“" + QUOTES[day][0] + "”";
  a.textContent = "— " + QUOTES[day][1];
}

// Weather via Open-Meteo (no API key)
async function updateWeather() {
  const c = cur();
  const wico = document.getElementById("w-wico");
  if (!wico) return;
  if (!c.weatherCoords && !c.weatherCity) return;
  if (c.weatherCity && !c.weatherCoords) {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c.weatherCity)}&count=1`);
      const j = await r.json();
      if (j.results && j.results[0]) {
        c.weatherCoords = { lat: j.results[0].latitude, lon: j.results[0].longitude, label: j.results[0].name + ", " + (j.results[0].country_code || "") };
        save();
      }
    } catch {}
  }
  const co = c.weatherCoords;
  if (!co) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${co.lat}&longitude=${co.lon}&current_weather=true&temperature_unit=celsius`);
    const j = await r.json();
    const w = j.current_weather;
    if (!w) return;
    document.getElementById("w-temp").textContent = Math.round(w.temperature) + "°";
    document.getElementById("w-loc").textContent = co.label;
    const map = { 0: ["Clear","☀️"], 1:["Mostly clear","🌤️"], 2:["Partly cloudy","⛅"], 3:["Overcast","☁️"], 45:["Foggy","🌫️"], 48:["Foggy","🌫️"], 51:["Drizzle","🌦️"], 61:["Rain","🌧️"], 71:["Snow","❄️"], 80:["Showers","🌦️"], 95:["Storm","⛈️"] };
    const code = w.weathercode;
    const info = map[code] || ["—","🌡️"];
    document.getElementById("w-cond").textContent = info[0];
    document.getElementById("w-wico").textContent = info[1];
  } catch {}
}

// Pomodoro
let pomo = { remaining: 25 * 60, running: false, interval: null };
function pomoTick() {
  if (!pomo.running) return;
  pomo.remaining--;
  if (pomo.remaining <= 0) { pomo.running = false; clearInterval(pomo.interval); pomo.remaining = 0; }
  const el = document.getElementById("w-pomo");
  if (el) el.textContent = `${String(Math.floor(pomo.remaining / 60)).padStart(2,"0")}:${String(pomo.remaining % 60).padStart(2,"0")}`;
}
document.addEventListener("click", e => {
  const p = e.target.dataset.pomo;
  if (!p) return;
  if (p === "start") { if (!pomo.running) { pomo.running = true; pomo.interval = setInterval(pomoTick, 1000); } }
  if (p === "pause") { pomo.running = false; clearInterval(pomo.interval); }
  if (p === "reset") { pomo.running = false; clearInterval(pomo.interval); pomo.remaining = 25*60; pomoTick(); }
});

function renderMiniTodos() {
  const el = document.getElementById("w-mini-todo");
  if (!el) return;
  const items = cur().todos.slice(0, 8);
  el.innerHTML = items.length
    ? items.map((t, i) => `<li class="${t.done?'done':''}"><input type="checkbox" data-mini-todo="${i}" ${t.done?'checked':''}/><span>${escapeHtml(t.text)}</span><button data-mini-del="${i}" title="Delete">×</button></li>`).join("")
    : `<li style="color:var(--muted)">No tasks yet.</li>`;
  el.querySelectorAll("[data-mini-todo]").forEach(cb => cb.addEventListener("change", e => {
    const i = +e.target.dataset.miniTodo;
    cur().todos[i].done = e.target.checked;
    save(); renderMiniTodos(); renderTodos();
  }));
  el.querySelectorAll("[data-mini-del]").forEach(b => b.addEventListener("click", e => {
    cur().todos.splice(+e.target.dataset.miniDel, 1); save(); renderMiniTodos(); renderTodos();
  }));
  const input = document.getElementById("w-mini-todo-input");
  const add = document.getElementById("w-mini-todo-add");
  if (input && !input._bound) {
    input._bound = true;
    const submit = () => {
      const v = input.value.trim(); if (!v) return;
      cur().todos.unshift({ text: v, done: false });
      input.value = ""; save(); renderMiniTodos(); renderTodos();
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    input.addEventListener("mousedown", e => e.stopPropagation());
    add.addEventListener("click", submit);
  }
}
function renderQuickLinks() {
  const el=document.getElementById("w-links");
  if(!el) return;
  el.innerHTML=cur().shortcuts.map(s=>{
    let host="";
    try{host=new URL(s.url).hostname;}catch(e){}
    return `<a href="${s.url}" title="${escapeHtml(s.name)}">
      <img class="shortcut-fav"
           src="https://icons.duckduckgo.com/ip3/${host}.ico"
           onerror="if(!this.dataset.f1){this.dataset.f1=1;this.src='https://www.google.com/s2/favicons?sz=128&domain=${host}';}else if(!this.dataset.f2){this.dataset.f2=1;this.src='https://${host}/favicon.ico';}else{this.style.display='none';}"
      />
      <small>${escapeHtml(s.name)}</small>
    </a>`;
  }).join("");
}

function startTimers() {
  if (window._auroraTimer) clearInterval(window._auroraTimer);
  window._auroraTimer = setInterval(updateClock, 1000);
  updateClock();
}

// ---------- Shortcuts dock ----------
function renderShortcuts() {
  const el = document.getElementById("shortcuts");
  el.innerHTML = "";
  cur().shortcuts.forEach((s, i) => {
    const a = document.createElement("a");
    a.className = "dock-item";
    a.href = s.url; a.title = s.name;
    a.style.background = 'transparent';
    try {
      const u = new URL(s.url);
      const fav = document.createElement("img");
      fav.className = "shortcut-fav";
      fav.src = `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`;
      fav.onerror = () => {
        if (!fav.dataset.fallback1){
          fav.dataset.fallback1="1";
          fav.src=`https://www.google.com/s2/favicons?sz=128&domain=${u.hostname}`;
          return;
        }
        if (!fav.dataset.fallback2){
          fav.dataset.fallback2="1";
          fav.src=`https://${u.hostname}/favicon.ico`;
          return;
        }
        a.textContent=(s.name[0]||"?").toUpperCase();
      };
      a.appendChild(fav);
    } catch { a.textContent = (s.name[0]||"?").toUpperCase(); }
    a.addEventListener("click", e => {
      if (e.shiftKey || e.button === 2) { e.preventDefault(); openShortcutModal(i); }
    });
    a.addEventListener("contextmenu", e => { e.preventDefault(); openShortcutModal(i); });
    el.appendChild(a);
  });
  renderQuickLinks();
}
let scEditIdx = null;
function openShortcutModal(idx) {
  scEditIdx = idx;
  const isEdit = idx !== null;
  const s = isEdit ? cur().shortcuts[idx] : { name: "", url: "", color: "#3b82f6" };
  document.getElementById("sc-modal-title").textContent = isEdit ? "Edit shortcut" : "Add shortcut";
  document.getElementById("sc-name").value = s.name;
  document.getElementById("sc-url").value = s.url;
  document.getElementById("sc-color").value = s.color;
  document.getElementById("sc-delete").classList.toggle("hidden", !isEdit);
  document.getElementById("shortcut-modal").classList.remove("hidden");
}

// ---------- Tasks & notes panels ----------
function renderTodos() {
  const el = document.getElementById("todo-list");
  el.innerHTML = cur().todos.map((t, i) => `
    <li class="${t.done?'done':''}">
      <input type="checkbox" data-todo="${i}" ${t.done?'checked':''}/>
      <span>${escapeHtml(t.text)}</span>
      <button data-del-todo="${i}">×</button>
    </li>`).join("");
  el.querySelectorAll("[data-todo]").forEach(cb => cb.addEventListener("change", e => {
    cur().todos[+e.target.dataset.todo].done = e.target.checked; save(); renderTodos(); renderMiniTodos();
  }));
  el.querySelectorAll("[data-del-todo]").forEach(b => b.addEventListener("click", e => {
    cur().todos.splice(+e.target.dataset.delTodo, 1); save(); renderTodos(); renderMiniTodos();
  }));
}
function renderNotes() {
  const n = document.getElementById("notes-text");
  n.value = cur().notes || "";
  n.oninput = () => { cur().notes = n.value; save(); };
}

// ---------- Settings panel ----------
function renderSettings() {
  const c = cur();
  normalizeWallpaperSettings();
  setVal("set-name", c.user);
  setVal("set-theme", c.theme);
  setVal("set-accent", c.accent);
  setVal("set-name-from", c.nameFrom);
  setVal("set-name-to", c.nameTo);
  setVal("set-blur", c.blur);   setText("val-blur", c.blur + "px");
  setVal("set-opacity", c.opacity); setText("val-opacity", c.opacity + "%");
  setVal("set-radius", c.radius); setText("val-radius", c.radius + "px");
  setVal("set-font", c.font);
  setChecked("set-minimal", c.minimal);
  setVal("set-engine", c.engine);
  setVal("set-wp-type", c.wp.type);
  setVal("set-tint", c.wp.tint); setText("val-tint", c.wp.tint + "%");
  setVal("set-bright", c.wp.brightness); setText("val-bright", c.wp.brightness + "%");
  setVal("set-media-blur", c.wp.mediaBlur); setText("val-media-blur", c.wp.mediaBlur + "px");
  setVal("set-wp-opacity", c.wp.opacity); setText("val-wp-opacity", c.wp.opacity + "%");
  setVal("set-speed", c.wp.speed); setText("val-speed", c.wp.speed + "%");
  setVal("set-volume", c.wp.volume); setText("val-volume", c.wp.volume + "%");
  setChecked("set-video-muted", c.wp.muted);
  setChecked("set-wp-rotate", c.wp.rotate);
  setVal("set-wp-rotate-mins", c.wp.rotateMins);
  setChecked("set-24h", c.use24h);
  setChecked("set-show-seconds", c.showSeconds);
  setVal("set-weather-city", c.weatherCity);
  setVal("set-custom-css", c.customCss);

  renderWallpaperManager();

  // widget toggles
  const wt = document.getElementById("widget-toggles");
  wt.innerHTML = Object.values(cur().widgets).map(w => `
    <label><input type="checkbox" data-widget-toggle="${w.id}" ${w.enabled?'checked':''}/> ${WIDGET_LABELS[w.id]||w.id}</label>
  `).join("");
  wt.querySelectorAll("[data-widget-toggle]").forEach(cb => cb.addEventListener("change", e => {
    cur().widgets[e.target.dataset.widgetToggle].enabled = e.target.checked;
    save(); renderWidgets();
  }));

  // profiles list
  const pl = document.getElementById("profile-list");
  pl.innerHTML = Object.keys(STATE.profiles).map(name => `
    <div class="row" style="margin-bottom:6px"><span style="flex:1">${escapeHtml(name)}</span>
      ${name === STATE.activeProfile ? '<span class="val">active</span>' : `<button class="btn-ghost" data-switch-profile="${escapeAttr(name)}" style="width:auto;padding:5px 10px;margin:0">Switch</button>`}
      ${Object.keys(STATE.profiles).length>1?`<button class="btn-danger" data-del-profile="${escapeAttr(name)}" style="width:auto;padding:5px 10px;margin:0">×</button>`:""}
    </div>`).join("");
  pl.querySelectorAll("[data-switch-profile]").forEach(b => b.addEventListener("click", () => switchProfile(b.dataset.switchProfile)));
  pl.querySelectorAll("[data-del-profile]").forEach(b => b.addEventListener("click", () => {
    const n = b.dataset.delProfile;
    if (!confirm(`Delete profile "${n}"?`)) return;
    delete STATE.profiles[n];
    if (STATE.activeProfile === n) STATE.activeProfile = Object.keys(STATE.profiles)[0];
    save(); render();
  }));
}

async function renderWallpaperManager() {
  const wp = cur().wp;
  const active = wp.collection[wp.activeIdx];
  const preview = document.getElementById("wp-current-preview");
  if (preview) {
    const currentUrl = await sourceToObjectUrl(wp.src);
    const title = active?.name || (wp.type === "gradient" ? "Default Aurora" : "Current wallpaper");
    preview.innerHTML = `
      <div class="wp-preview-media ${wp.type === "video" ? "video" : ""}" ${wp.type === "image" && currentUrl ? `style="background-image:url('${currentUrl}')"` : ""}>
        ${wp.type === "video" && currentUrl ? `<video src="${currentUrl}" muted loop playsinline autoplay></video><span>▶</span>` : wp.type === "gradient" ? "✦" : ""}
      </div>
      <div class="wp-preview-info"><strong>${escapeHtml(title)}</strong><span>${wp.type === "video" ? "Live wallpaper" : wp.type === "image" ? "Image wallpaper" : "Gradient background"}</span></div>`;
  }

  const collections = ["All", "Favorites", ...new Set(wp.collection.map(i => i.collectionName || "Uploads"))];
  const filter = document.getElementById("wp-collection-filter");
  if (filter) {
    filter.innerHTML = collections.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("");
    filter.value = collections.includes(wp.collectionFilter) ? wp.collectionFilter : "All";
  }
  setVal("wp-collection-name", active?.collectionName || "Uploads");

  const grid = document.getElementById("wp-collection");
  if (!grid) return;
  const visible = wp.collection
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => wp.collectionFilter === "Favorites" ? item.favorite : wp.collectionFilter === "All" || (item.collectionName || "Uploads") === wp.collectionFilter);
  grid.innerHTML = visible.length ? visible.map(({ item, index }) => {
    const thumb = item.type === "image" && item.url ? item.url : "";
    return `<div class="wp-thumb ${index===wp.activeIdx?'active':''} ${item.type}" data-wp-pick="${index}" ${thumb ? `style="background-image:url('${thumb}')"` : ""}>
      <span class="wp-kind">${item.type === "video" ? "▶" : ""}</span>
      <button class="fav ${item.favorite ? "on" : ""}" data-wp-fav="${index}" title="Favorite">★</button>
      <button class="x" data-wp-del="${index}" title="Delete">×</button>
      <small>${escapeHtml(item.name || "Wallpaper")}</small>
    </div>`;
  }).join("") : `<p class="muted" style="grid-column:1/-1">Upload or drag images/videos to build a local wallpaper history.</p>`;

  await Promise.all(visible.map(async ({ item, index }) => {
    if (item.type !== "image" || item.url || !item.key) return;
    try {
      if (!_thumbUrls.has(item.key)) {
        const blob = await idb.get(item.key);
        if (blob) _thumbUrls.set(item.key, URL.createObjectURL(blob));
      }
      const el = grid.querySelector(`[data-wp-pick="${index}"]`);
      if (el && _thumbUrls.has(item.key)) el.style.backgroundImage = `url('${_thumbUrls.get(item.key)}')`;
    } catch (err) {
      console.warn("[Aurora Wallpaper] Thumbnail load failed", err);
    }
  }));

  grid.querySelectorAll("[data-wp-pick]").forEach(t => t.addEventListener("click", async e => {
    if (e.target.dataset.wpDel || e.target.dataset.wpFav) return;
    const i = +t.dataset.wpPick;
    const item = cur().wp.collection[i];
    if (!item) return;
    cur().wp.activeIdx = i;
    cur().wp.type = item.type;
    cur().wp.src = item.url ? item.url : "idb:" + item.key;
    await save(); await loadWallpaper(); renderSettings();
  }));
  grid.querySelectorAll("[data-wp-fav]").forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    const item = cur().wp.collection[+b.dataset.wpFav];
    if (!item) return;
    item.favorite = !item.favorite;
    await save(); renderSettings();
  }));
  grid.querySelectorAll("[data-wp-del]").forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    const i = +b.dataset.wpDel;
    const item = cur().wp.collection[i];
    if (item?.key) {
      try { await idb.del(item.key); console.info("[Aurora Wallpaper] Deleted", item.key); } catch (err) { console.warn("[Aurora Wallpaper] Delete failed", err); }
      if (_thumbUrls.has(item.key)) { try { URL.revokeObjectURL(_thumbUrls.get(item.key)); } catch {}; _thumbUrls.delete(item.key); }
    }
    cur().wp.collection.splice(i, 1);
    if (cur().wp.activeIdx === i) { cur().wp.src = ""; cur().wp.activeIdx = -1; cur().wp.type = "gradient"; }
    else if (cur().wp.activeIdx > i) cur().wp.activeIdx--;
    await save(); await loadWallpaper(); renderSettings();
  }));
}

function setVal(id, v) { const e = document.getElementById(id); if (e && v !== undefined && v !== null) e.value = v; }
function setChecked(id, v) { const e = document.getElementById(id); if (e) e.checked = !!v; }
function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

function renderProfileSwitcher() {
  document.getElementById("profile-name").textContent = STATE.activeProfile;
  document.getElementById("profile-dot").style.background = STATE.profiles[STATE.activeProfile].color || "#7c3aed";
  const m = document.getElementById("profile-menu");
  m.innerHTML = Object.keys(STATE.profiles).map(n =>
    `<button data-switch="${escapeAttr(n)}">${n === STATE.activeProfile ? "● " : "○ "}${escapeHtml(n)}</button>`).join("");
  m.querySelectorAll("[data-switch]").forEach(b => b.addEventListener("click", () => { switchProfile(b.dataset.switch); m.classList.add("hidden"); }));
}
function switchProfile(name) {
  if (!STATE.profiles[name]) return;
  STATE.activeProfile = name; save(); render();
}

// Command palette removed

// ---------- Helpers ----------
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function showToast(message, type = "info") {
  console[type === "error" ? "error" : type === "success" ? "info" : "log"]("[Aurora Wallpaper]", message);
  const root = document.getElementById("toast-root");
  if (!root) return;
  const toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 20);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  }, 3400);
}
function togglePanel(id, show) {
  document.querySelectorAll(".panel").forEach(p => { if (p.id !== id) p.classList.add("hidden"); });
  const el = document.getElementById(id);
  if (show === undefined) el.classList.toggle("hidden"); else el.classList.toggle("hidden", !show);
}

// ---------- Global events ----------
function bindGlobalEvents() {
  // panel toggles
  document.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => togglePanel(b.dataset.toggle)));
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => document.getElementById(b.dataset.close).classList.add("hidden")));

  // edit mode
  document.getElementById("edit-mode-btn").addEventListener("click", () => {
    document.body.classList.toggle("edit-mode");
    document.getElementById("edit-mode-btn").classList.toggle("active");
  });

  // profile dropdown
  document.getElementById("profile-btn").addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("profile-menu").classList.toggle("hidden");
  });
  document.addEventListener("click", e => {
    if (!e.target.closest("#profile-switcher")) document.getElementById("profile-menu").classList.add("hidden");
  });

  // search
  document.getElementById("search").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const q = e.target.value.trim(); if (!q) return;
      location.href = cur().engine + encodeURIComponent(q);
    }
  });

  // settings tabs
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll("[data-pane]").forEach(p => p.classList.toggle("hidden", p.dataset.pane !== t.dataset.tab));
  }));

  // settings inputs (live)
  const bindIn = (id, key, fn = v => v) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      const v = el.type === "checkbox" ? el.checked : el.type === "number" || el.type === "range" ? +el.value : el.value;
      cur()[key] = fn(v);
      save(); applyTheme();
      if (["use24h","showSeconds","user"].includes(key)) updateClock();
      if (key === "minimal") renderWidgets();
    });
  };
  bindIn("set-name", "user");
  bindIn("set-theme", "theme");
  bindIn("set-accent", "accent");
  bindIn("set-name-from", "nameFrom");
  bindIn("set-name-to", "nameTo");
  bindIn("set-blur", "blur");
  bindIn("set-opacity", "opacity");
  bindIn("set-radius", "radius");
  bindIn("set-font", "font");
  bindIn("set-minimal", "minimal");
  bindIn("set-engine", "engine");
  bindIn("set-24h", "use24h");
  bindIn("set-show-seconds", "showSeconds");
  ["set-blur","set-opacity","set-radius","set-tint","set-bright","set-media-blur","set-wp-opacity","set-speed","set-volume"].forEach(id => {
    const e = document.getElementById(id); const v = document.getElementById("val-" + id.replace("set-",""));
    if (e && v) e.addEventListener("input", () => v.textContent = e.value + (id.includes("blur")||id.includes("radius") ? "px" : "%"));
  });

  // wallpaper inputs
  document.getElementById("set-wp-type").addEventListener("change", async e => {
    const type = e.target.value;
    if (type === "gradient") {
      cur().wp.type = "gradient"; cur().wp.src = ""; cur().wp.activeIdx = -1;
    } else {
      const current = cur().wp.collection[cur().wp.activeIdx];
      const idx = current?.type === type ? cur().wp.activeIdx : cur().wp.collection.findIndex(item => item.type === type);
      if (idx < 0) { showToast(`Upload a ${type === "video" ? "MP4/WebM live" : "JPG/PNG/WebP/GIF image"} wallpaper first.`, "info"); renderSettings(); return; }
      const item = cur().wp.collection[idx];
      cur().wp.activeIdx = idx; cur().wp.type = item.type; cur().wp.src = item.url ? item.url : "idb:" + item.key;
    }
    await save(); await loadWallpaper(); renderSettings();
  });
  document.getElementById("set-tint").addEventListener("input", e => { cur().wp.tint = +e.target.value; save(); applyTheme(); });
  document.getElementById("set-bright").addEventListener("input", e => { cur().wp.brightness = +e.target.value; save(); applyTheme(); });
  document.getElementById("set-media-blur").addEventListener("input", e => { cur().wp.mediaBlur = +e.target.value; save(); applyTheme(); });
  document.getElementById("set-wp-opacity").addEventListener("input", e => { cur().wp.opacity = +e.target.value; save(); applyTheme(); });
  document.getElementById("set-speed").addEventListener("input", e => {
    cur().wp.speed = +e.target.value; save();
    const v = document.getElementById("wp-video"); if (v) v.playbackRate = (cur().wp.speed||100)/100;
  });
  document.getElementById("set-volume").addEventListener("input", e => {
    cur().wp.volume = +e.target.value;
    if (cur().wp.volume > 0) cur().wp.muted = false;
    save(); applyWallpaperSettingsToVideo(); renderSettings();
  });
  document.getElementById("set-video-muted").addEventListener("change", e => { cur().wp.muted = e.target.checked; save(); applyWallpaperSettingsToVideo(); });
  document.getElementById("wp-video-toggle").addEventListener("click", async () => {
    const v = document.getElementById("wp-video");
    if (!v || cur().wp.type !== "video") return showToast("Select a live wallpaper first.", "info");
    if (v.paused) { try { await v.play(); } catch { showToast("Video could not start.", "error"); } }
    else v.pause();
  });
  document.getElementById("set-wp-file").addEventListener("change", e => setWallpaperFromFile(e.target.files[0]));
  const urlGo = document.getElementById("set-wp-url-go");
  if (urlGo) urlGo.addEventListener("click", () => {
    const v = document.getElementById("set-wp-url")?.value.trim();
    if (v) setWallpaperFromUrl(v);
  });
  document.getElementById("wp-collection-filter").addEventListener("change", e => { cur().wp.collectionFilter = e.target.value; save(); renderSettings(); });
  document.getElementById("wp-assign-collection").addEventListener("click", async () => {
    const active = cur().wp.collection[cur().wp.activeIdx];
    const name = document.getElementById("wp-collection-name").value.trim() || "Uploads";
    if (!active) return showToast("Upload or select a wallpaper first.", "info");
    active.collectionName = name; cur().wp.collectionFilter = name; await save(); renderSettings();
  });
  document.getElementById("set-wp-rotate").addEventListener("change", e => { cur().wp.rotate = e.target.checked; save(); startWallpaperRotation(); });
  document.getElementById("set-wp-rotate-mins").addEventListener("change", e => { cur().wp.rotateMins = +e.target.value; save(); startWallpaperRotation(); });
  document.getElementById("remove-wp").addEventListener("click", async () => {
    cur().wp.src = ""; cur().wp.type = "gradient"; cur().wp.activeIdx = -1;
    await save(); await loadWallpaper(); renderSettings();
  });
  document.getElementById("reset-wp").addEventListener("click", async () => {
    cur().wp.src = ""; cur().wp.type = "gradient"; cur().wp.activeIdx = -1;
    cur().wp.tint = 25; cur().wp.brightness = 100; cur().wp.mediaBlur = 0; cur().wp.opacity = 100; cur().wp.speed = 100; cur().wp.volume = 0; cur().wp.muted = true;
    await save(); applyTheme(); await loadWallpaper(); renderSettings();
  });

  // weather
  document.getElementById("set-weather-go").addEventListener("click", () => {
    cur().weatherCity = document.getElementById("set-weather-city").value.trim();
    cur().weatherCoords = null; save(); updateWeather();
  });

  // custom CSS
  document.getElementById("apply-css").addEventListener("click", () => {
    cur().customCss = document.getElementById("set-custom-css").value; save(); applyTheme();
  });

  // todo input
  const addTodo = () => {
    const i = document.getElementById("todo-input");
    if (!i.value.trim()) return;
    cur().todos.unshift({ text: i.value.trim(), done: false });
    i.value = ""; save(); renderTodos(); renderMiniTodos();
  };
  document.getElementById("todo-add-btn").addEventListener("click", addTodo);
  document.getElementById("todo-input").addEventListener("keydown", e => { if (e.key === "Enter") addTodo(); });

  // shortcut modal
  document.getElementById("add-shortcut").addEventListener("click", () => openShortcutModal(null));
  document.getElementById("sc-cancel").addEventListener("click", () => document.getElementById("shortcut-modal").classList.add("hidden"));
  document.getElementById("sc-save").addEventListener("click", () => {
    const item = {
      name: document.getElementById("sc-name").value.trim() || "Site",
      url: document.getElementById("sc-url").value.trim(),
      color: document.getElementById("sc-color").value,
    };
    if (!/^https?:\/\//.test(item.url)) item.url = "https://" + item.url;
    if (scEditIdx === null) cur().shortcuts.push(item);
    else cur().shortcuts[scEditIdx] = item;
    save(); renderShortcuts();
    document.getElementById("shortcut-modal").classList.add("hidden");
  });
  document.getElementById("sc-delete").addEventListener("click", () => {
    if (scEditIdx !== null) { cur().shortcuts.splice(scEditIdx, 1); save(); renderShortcuts(); }
    document.getElementById("shortcut-modal").classList.add("hidden");
  });

  // export/import
  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "aurora-tab-settings.json"; a.click();
  });
  document.getElementById("import-btn").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text();
    try { STATE = JSON.parse(text); await save(); render(); } catch { alert("Invalid file"); }
  });

  document.getElementById("reset-all").addEventListener("click", () => {
    if (!confirm("Reset this profile to defaults?")) return;
    STATE.profiles[STATE.activeProfile] = DEFAULT_PROFILE();
    STATE.profiles[STATE.activeProfile].name = STATE.activeProfile;
    save(); render();
  });

  // add profile
  document.getElementById("add-profile").addEventListener("click", () => {
    const n = document.getElementById("new-profile-name").value.trim();
    if (!n || STATE.profiles[n]) return;
    STATE.profiles[n] = DEFAULT_PROFILE(); STATE.profiles[n].name = n;
    document.getElementById("new-profile-name").value = "";
    save(); render();
  });

  // Command palette removed: related event handlers are disabled

  // Drag-drop wallpaper
  ["dragenter","dragover"].forEach(ev => document.addEventListener(ev, e => {
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
      e.preventDefault(); document.getElementById("drop-overlay").classList.remove("hidden");
    }
  }));
  ["dragleave","drop"].forEach(ev => document.addEventListener(ev, e => {
    if (ev === "dragleave" && e.relatedTarget) return;
    document.getElementById("drop-overlay").classList.add("hidden");
  }));
  document.addEventListener("drop", e => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setWallpaperFromFile(f);
  });
}

init();
})();
