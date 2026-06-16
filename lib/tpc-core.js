// TP Companion — núcleo compartido (popup y estudio)
// Helpers puros: almacenamiento, matemáticas de color, canvas, toast.
// Se carga ANTES que el script de cada página; expone globales TPC.* y unos
// pocos alias sueltos. No depende del DOM salvo toast()/copyText().

(function (global) {
  const IS_EXT = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

  // ---------- almacenamiento ----------
  const store = {
    async get(defaults) {
      if (IS_EXT) return new Promise((res) => chrome.storage.local.get(defaults, res));
      const out = {};
      for (const k of Object.keys(defaults)) {
        const raw = localStorage.getItem("tpc_" + k);
        out[k] = raw ? JSON.parse(raw) : defaults[k];
      }
      return out;
    },
    async set(obj) {
      if (IS_EXT) return new Promise((res) => chrome.storage.local.set(obj, res));
      for (const [k, v] of Object.entries(obj)) localStorage.setItem("tpc_" + k, JSON.stringify(v));
    },
  };

  function sendBg(msg) {
    if (IS_EXT) return new Promise((res) => chrome.runtime.sendMessage(msg, res));
    if (msg.type === "download") {
      const a = document.createElement("a");
      a.href = msg.url;
      a.download = msg.filename;
      a.target = "_blank";
      a.click();
      return Promise.resolve({ ok: true });
    }
    if (msg.type === "fetchDataUrl") {
      return fetch(msg.url)
        .then((r) => r.blob())
        .then(
          (blob) =>
            new Promise((res) => {
              const fr = new FileReader();
              fr.onload = () => res({ ok: true, dataUrl: fr.result, mime: blob.type });
              fr.readAsDataURL(blob);
            })
        )
        .catch((e) => ({ ok: false, error: String(e) }));
    }
    return Promise.resolve({ ok: false, error: "modo desarrollo" });
  }

  // ---------- toast / portapapeles ----------
  function toast(text, isErr = false) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = text;
    t.className = "show" + (isErr ? " err" : "");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => (t.className = ""), 1800);
  }

  function copyText(text, label) {
    navigator.clipboard.writeText(text).then(
      () => toast((label || text) + " copiado"),
      () => toast("No se pudo copiar", true)
    );
  }

  // ---------- matemáticas de color ----------
  function normalizeHex(raw) {
    if (typeof raw !== "string") return null;
    let v = raw.trim().replace(/^#/, "").toLowerCase();
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return null;
    if (v.length === 3) v = v.split("").map((c) => c + c).join("");
    return "#" + v;
  }

  function hexToRgb(hex) {
    const v = normalizeHex(hex).slice(1);
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }

  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")
    );
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s, l];
  }

  function hslToHex(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    let r, g, b;
    if (s === 0) r = g = b = l;
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return rgbToHex(r * 255, g * 255, b * 255);
  }

  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(hexA, hexB) {
    const la = luminance(hexA), lb = luminance(hexB);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // sRGB <-> lineal (para interpolar degradados sin "embarrar" el centro)
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(c) {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return v * 255;
  }

  // ---------- utilidades varias ----------
  function safeName(name) {
    return name.replace(/[^\w\-áéíóúüñÁÉÍÓÚÜÑ ]/g, "").trim().replace(/\s+/g, "_") || "logo";
  }

  function commonsUrl(file, width) {
    const base = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(file);
    return width ? base + "?width=" + width : base;
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("no se pudo cargar la imagen"));
      img.src = src;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
  }

  // ---------- operaciones de imagen sobre canvas ----------
  // Quitar fondo blanco: flood fill desde los bordes (respeta blanco interior).
  async function removeWhiteBg(dataUrl, tolerance = 40) {
    const img = await loadImage(dataUrl);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const d = imgData.data;
    const W = c.width, H = c.height;
    const nearWhite = (i) =>
      d[i + 3] > 0 && 255 - d[i] < tolerance && 255 - d[i + 1] < tolerance && 255 - d[i + 2] < tolerance;
    const stack = [];
    const visited = new Uint8Array(W * H);
    const push = (x, y) => {
      const p = y * W + x;
      if (visited[p]) return;
      visited[p] = 1;
      if (nearWhite(p * 4)) stack.push(p);
    };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    let removed = 0;
    while (stack.length) {
      const p = stack.pop();
      d[p * 4 + 3] = 0;
      removed++;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) push(x - 1, y);
      if (x < W - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < H - 1) push(x, y + 1);
    }
    if (!removed) return dataUrl;
    ctx.putImageData(imgData, 0, 0);
    return c.toDataURL("image/png");
  }

  // Recortar al bounding box de píxeles no transparentes (+ margen opcional).
  async function trimTransparent(dataUrl, pad = 0, alphaThreshold = 8) {
    const img = await loadImage(dataUrl);
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { dataUrl, trimmed: false }; // todo transparente
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad);
    maxY = Math.min(H - 1, maxY + pad);
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (w === W && h === H) return { dataUrl, trimmed: false };
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").drawImage(c, minX, minY, w, h, 0, 0, w, h);
    return { dataUrl: out.toDataURL("image/png"), trimmed: true, w, h };
  }

  // Añadir contorno a un logo: silueta coloreada estampada alrededor.
  async function outlineImage(dataUrl, color = "#ffffff", thickness = 8, samples = 32) {
    const src = await loadImage(dataUrl);
    const W = src.naturalWidth, H = src.naturalHeight;
    const pad = Math.ceil(thickness) + 2;
    const cw = W + pad * 2, ch = H + pad * 2;

    // 1) silueta del logo coloreada (todo el alfa, pintado del color del borde)
    const sil = document.createElement("canvas");
    sil.width = cw; sil.height = ch;
    const sctx = sil.getContext("2d");
    sctx.drawImage(src, pad, pad);
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = color;
    sctx.fillRect(0, 0, cw, ch);

    // 2) estampar la silueta en círculo para dilatar el alfa => contorno
    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    const octx = out.getContext("2d");
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      octx.drawImage(sil, Math.cos(a) * thickness, Math.sin(a) * thickness);
    }
    // rellenar también radios intermedios para grosores grandes (sin huecos)
    for (let r = thickness - 1; r >= 1; r--) {
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        octx.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
      }
    }
    // 3) logo original encima
    octx.drawImage(src, pad, pad);
    return out.toDataURL("image/png");
  }

  // ---------- extracción de paleta (median cut) ----------
  function extractPalette(img, n = 8) {
    const SIZE = 80;
    const c = document.createElement("canvas");
    const ratio = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight, 1);
    c.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    c.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    if (!pixels.length) return [];
    let boxes = [pixels];
    while (boxes.length < n) {
      let bestBox = -1, bestRange = -1, bestCh = 0;
      boxes.forEach((box, bi) => {
        if (box.length < 2) return;
        for (let ch = 0; ch < 3; ch++) {
          let mn = 255, mx = 0;
          for (const p of box) {
            if (p[ch] < mn) mn = p[ch];
            if (p[ch] > mx) mx = p[ch];
          }
          if (mx - mn > bestRange) { bestRange = mx - mn; bestBox = bi; bestCh = ch; }
        }
      });
      if (bestBox < 0 || bestRange < 8) break;
      const box = boxes[bestBox];
      box.sort((a, b) => a[bestCh] - b[bestCh]);
      const mid = Math.floor(box.length / 2);
      boxes.splice(bestBox, 1, box.slice(0, mid), box.slice(mid));
    }
    const colors = boxes
      .filter((b) => b.length)
      .map((box) => {
        const sum = box.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
        return { hex: rgbToHex(sum[0] / box.length, sum[1] / box.length, sum[2] / box.length), weight: box.length };
      })
      .sort((a, b) => b.weight - a.weight);
    const out = [];
    for (const c2 of colors) {
      const [r, g, b] = hexToRgb(c2.hex);
      if (out.some((o) => {
        const [r2, g2, b2] = hexToRgb(o);
        return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) < 24;
      })) continue;
      out.push(c2.hex);
    }
    return out.slice(0, n);
  }

  // encolar un archivo para inyectarlo en el formulario de Trading Paints.
  // El content script drena la cola uno a uno y avisa con badge en el widget.
  async function enqueueInject(item) {
    const { pendingInjectQueue = [] } = await store.get({ pendingInjectQueue: [] });
    pendingInjectQueue.push({ ...item, ts: Date.now() });
    await store.set({ pendingInjectQueue });
    return pendingInjectQueue.length;
  }

  async function focusTradingPaintsTab() {
    if (!IS_EXT) return false;
    const tabs = await new Promise((res) => chrome.tabs.query({ url: "https://*.tradingpaints.com/*" }, res));
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
      return true;
    }
    chrome.tabs.create({ url: "https://www.tradingpaints.com/" });
    return false;
  }

  global.TPC = {
    IS_EXT, store, sendBg, toast, copyText,
    normalizeHex, hexToRgb, rgbToHex, rgbToHsl, hslToHex, luminance, contrastRatio,
    srgbToLinear, linearToSrgb,
    safeName, commonsUrl, loadImage, readFileAsDataUrl,
    removeWhiteBg, trimTransparent, outlineImage, extractPalette,
    enqueueInject, focusTradingPaintsTab,
  };
})(typeof window !== "undefined" ? window : this);
