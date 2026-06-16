// TP Companion — lógica del popup
// Funciona como extensión (chrome.*) y abierto como página normal para
// desarrollo (shim sobre localStorage + fetch directo; en modo dev se expone
// window.TPC con las utilidades puras para poder probarlas).

const IS_EXT = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

// ---------- capa de almacenamiento ----------
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
  console.log("[dev] sendBg", msg);
  if (msg.type === "download") {
    const a = document.createElement("a");
    a.href = msg.url;
    a.download = msg.filename;
    a.target = "_blank";
    a.click();
    return Promise.resolve({ ok: true });
  }
  if (msg.type === "fetchDataUrl") {
    // en dev: upload.wikimedia.org sirve CORS abierto, se puede traer directo
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

// datos de ejemplo para el modo desarrollo
if (!IS_EXT && !localStorage.getItem("tpc_colorHistory")) {
  localStorage.setItem(
    "tpc_colorHistory",
    JSON.stringify(
      ["#e8443a", "#14181f", "#f5c543", "#2a9df4", "#ffffff", "#27ae60", "#9b59b6", "#1f2734", "#e67e22", "#bdc3c7"].map(
        (hex, i) => ({ hex, ts: Date.now() - i * 60000, source: "demo" })
      )
    )
  );
  localStorage.setItem(
    "tpc_palettes",
    JSON.stringify([{ id: "p1", name: "Mi GT3", colors: ["#e8443a", "#14181f", "#f5c543", "#ffffff"] }])
  );
}

// ---------- utilidades ----------
const $ = (sel) => document.querySelector(sel);

function toast(text, isErr = false) {
  const t = $("#toast");
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

function normalizeHex(raw) {
  if (typeof raw !== "string") return null;
  let v = raw.trim().replace(/^#/, "").toLowerCase();
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return null;
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  return "#" + v;
}

function commonsUrl(file, width) {
  const base = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(file);
  return width ? base + "?width=" + width : base;
}

function filePathUrl(host, file, width) {
  const base = `https://${host}/wiki/Special:FilePath/` + encodeURIComponent(file);
  return width ? base + "?width=" + width : base;
}

function safeName(name) {
  return name.replace(/[^\w\-áéíóúüñÁÉÍÓÚÜÑ ]/g, "").trim().replace(/\s+/g, "_") || "logo";
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

// ---------- matemáticas de color ----------
function hexToRgb(hex) {
  const v = normalizeHex(hex).slice(1);
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
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
  h = ((h % 360) + 360) % 360 / 360;
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

// ---------- extracción de paleta (median cut) ----------
function extractPaletteFromImage(img, n = 8) {
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
    if (data[i + 3] < 128) continue; // transparentes fuera
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!pixels.length) return [];

  let boxes = [pixels];
  while (boxes.length < n) {
    // caja con mayor rango en algún canal
    let bestBox = -1, bestRange = -1, bestCh = 0;
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let mn = 255, mx = 0;
        for (const p of box) {
          if (p[ch] < mn) mn = p[ch];
          if (p[ch] > mx) mx = p[ch];
        }
        if (mx - mn > bestRange) {
          bestRange = mx - mn;
          bestBox = bi;
          bestCh = ch;
        }
      }
    });
    if (bestBox < 0 || bestRange < 8) break; // ya no hay variedad que partir
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

  // dedupe de casi-iguales
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

// ---------- quitar fondo blanco (flood fill desde los bordes) ----------
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
  if (!removed) return dataUrl; // nada que quitar (ya era transparente, etc.)
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL("image/png");
}

// ---------- pestañas ----------
document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab[data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tabpane").forEach((p) =>
      p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab)
    );
  });
});

// ---------- abrir el estudio a pantalla completa ----------
$("#open-studio").addEventListener("click", () => {
  if (IS_EXT) chrome.tabs.create({ url: chrome.runtime.getURL("studio/studio.html") });
  else window.open("../studio/studio.html", "_blank");
});

// ---------- enviar un logo al Taller del estudio ----------
async function sendToWorkshop(logo) {
  if (!IS_EXT) return toast("Solo disponible como extensión", true);
  let dataUrl = logo.dataUrl;
  if (!dataUrl) {
    toast("Preparando logo para el Taller…");
    const r = await sendBg({ type: "fetchDataUrl", url: logo.fullUrl || commonsUrl(logo.commons, 1200) });
    if (!r || !r.ok) return toast("No se pudo traer el logo", true);
    dataUrl = r.dataUrl;
  }
  await store.set({ workshopIncoming: { dataUrl, name: logo.name, ts: Date.now() } });
  chrome.tabs.create({ url: chrome.runtime.getURL("studio/studio.html#logos") });
}

// ============================================================
// TAB COLORES
// ============================================================
let palettes = [];
let activePaletteId = null;

function swatchEl(hex, withAdd = true) {
  const d = document.createElement("div");
  d.className = "mini-sw";
  d.style.background = hex;
  d.title = hex + " · click = copiar" + (withAdd ? " · doble click = a la paleta activa" : "");
  d.addEventListener("click", () => copyText(hex));
  if (withAdd) d.addEventListener("dblclick", () => addToActivePalette(hex));
  return d;
}

async function renderHistory() {
  const { colorHistory } = await store.get({ colorHistory: [] });
  const grid = $("#history-grid");
  grid.innerHTML = "";
  if (!colorHistory.length) {
    grid.innerHTML = '<div class="empty">Aún no hay colores. Usa el Paint Builder o añade uno a mano.</div>';
    return;
  }
  colorHistory.slice(0, 48).forEach((c) => {
    const d = document.createElement("div");
    d.className = "swatch";
    d.style.background = c.hex;
    d.title = c.hex + (c.source ? " · " + c.source : "");
    d.addEventListener("click", () => copyText(c.hex));
    const add = document.createElement("button");
    add.className = "addbtn";
    add.textContent = "＋";
    add.title = "Añadir a la paleta activa";
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      addToActivePalette(c.hex);
    });
    d.appendChild(add);
    grid.appendChild(d);
  });
}

async function recordManualColor(hex) {
  const norm = normalizeHex(hex);
  if (!norm) return toast("Hex no válido", true);
  const { colorHistory } = await store.get({ colorHistory: [] });
  const rest = colorHistory.filter((c) => c.hex !== norm);
  rest.unshift({ hex: norm, ts: Date.now(), source: "manual" });
  await store.set({ colorHistory: rest.slice(0, 300) });
  renderHistory();
}

$("#add-manual").addEventListener("click", () => recordManualColor($("#manual-hex").value || $("#manual-color").value));
$("#manual-hex").addEventListener("keydown", (e) => {
  if (e.key === "Enter") recordManualColor($("#manual-hex").value);
});
$("#manual-color").addEventListener("change", (e) => ($("#manual-hex").value = e.target.value));

$("#clear-history").addEventListener("click", async function () {
  if (this.dataset.armed) {
    await store.set({ colorHistory: [] });
    delete this.dataset.armed;
    this.textContent = "🗑";
    renderHistory();
  } else {
    this.dataset.armed = "1";
    this.textContent = "¿Vaciar?";
    setTimeout(() => {
      delete this.dataset.armed;
      this.textContent = "🗑";
    }, 2500);
  }
});

// ---------- paletas ----------
async function loadPalettes() {
  ({ palettes } = await store.get({ palettes: [] }));
  if (!activePaletteId && palettes.length) activePaletteId = palettes[0].id;
  renderPaletteSelect();
  renderPaletteView();
}

function renderPaletteSelect() {
  const sel = $("#palette-select");
  sel.innerHTML = "";
  if (!palettes.length) {
    sel.innerHTML = '<option value="">— sin paletas —</option>';
    return;
  }
  palettes.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    if (p.id === activePaletteId) o.selected = true;
    sel.appendChild(o);
  });
}

$("#palette-select").addEventListener("change", (e) => {
  activePaletteId = e.target.value || null;
  renderPaletteView();
});

async function createPalette(name, colors = []) {
  const p = { id: "p" + Date.now(), name, colors };
  palettes.push(p);
  activePaletteId = p.id;
  await store.set({ palettes });
  renderPaletteSelect();
  renderPaletteView();
  toast('Paleta "' + name + '" creada');
  return p;
}

$("#new-palette").addEventListener("click", () => {
  const view = $("#palette-view");
  if (view.querySelector(".new-row")) return;
  const row = document.createElement("div");
  row.className = "sec-tools new-row";
  row.style.marginBottom = "8px";
  row.innerHTML =
    '<input type="text" id="new-palette-name" placeholder="Nombre de la paleta" style="flex:1" /> <button class="btn small" id="new-palette-ok">Crear</button>';
  view.prepend(row);
  const input = row.querySelector("#new-palette-name");
  input.focus();
  const create = () => {
    const name = input.value.trim();
    if (name) createPalette(name);
  };
  row.querySelector("#new-palette-ok").addEventListener("click", create);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") create();
  });
});

async function addToActivePalette(hex) {
  const p = palettes.find((x) => x.id === activePaletteId);
  if (!p) return toast("Crea una paleta primero", true);
  if (p.colors.includes(hex)) return toast("Ya está en " + p.name, true);
  p.colors.push(hex);
  await store.set({ palettes });
  renderPaletteView();
  toast(hex + " → " + p.name);
}

function renderPaletteView() {
  const view = $("#palette-view");
  view.innerHTML = "";
  const p = palettes.find((x) => x.id === activePaletteId);
  if (!p) {
    view.innerHTML = '<div class="empty">Crea una paleta y añade colores desde el historial con ＋.</div>';
    return;
  }
  const card = document.createElement("div");
  card.className = "palette-row";
  card.innerHTML = `
    <div class="palette-head"><b>${p.name}</b>
      <span class="palette-tools">
        <button class="btn small" data-act="copy" title="Copiar lista de hex">Copiar</button>
        <button class="btn small" data-act="export" title="Exportar JSON">Exportar</button>
        <button class="btn small danger" data-act="del">Borrar</button>
      </span>
    </div>
    <div class="palette-swatches"></div>
    <p class="muted" style="margin:7px 0 0">${p.colors.length} colores · click en un color para quitarlo</p>
  `;
  const swc = card.querySelector(".palette-swatches");
  if (!p.colors.length) swc.innerHTML = '<span class="empty">Vacía</span>';
  p.colors.forEach((hex) => {
    const s = document.createElement("div");
    s.className = "pswatch";
    s.style.background = hex;
    s.title = hex + " (click para quitar)";
    s.addEventListener("click", async () => {
      p.colors = p.colors.filter((c) => c !== hex);
      await store.set({ palettes });
      renderPaletteView();
    });
    swc.appendChild(s);
  });
  card.querySelector('[data-act="copy"]').addEventListener("click", () =>
    copyText(p.colors.join("\n"), "Paleta " + p.name)
  );
  card.querySelector('[data-act="export"]').addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safeName(p.name) + ".palette.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  const delBtn = card.querySelector('[data-act="del"]');
  delBtn.addEventListener("click", async () => {
    if (!delBtn.dataset.armed) {
      delBtn.dataset.armed = "1";
      delBtn.textContent = "¿Seguro?";
      setTimeout(() => {
        delete delBtn.dataset.armed;
        delBtn.textContent = "Borrar";
      }, 2500);
      return;
    }
    palettes = palettes.filter((x) => x.id !== p.id);
    activePaletteId = palettes.length ? palettes[0].id : null;
    await store.set({ palettes });
    renderPaletteSelect();
    renderPaletteView();
  });
  view.appendChild(card);
}

// ---------- extractor de paleta ----------
$("#extract-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const img = await loadImage(reader.result);
      const colors = extractPaletteFromImage(img, 8);
      renderExtractResult(colors, file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      toast("No se pudo procesar la imagen", true);
    }
  };
  reader.readAsDataURL(file);
});

function renderExtractResult(colors, baseName) {
  const box = $("#extract-result");
  box.innerHTML = "";
  if (!colors.length) {
    box.innerHTML = '<div class="empty">No saqué colores de ahí.</div>';
    return;
  }
  const row = document.createElement("div");
  row.className = "mini-row";
  colors.forEach((hex) => row.appendChild(swatchEl(hex)));
  box.appendChild(row);
  const btn = document.createElement("button");
  btn.className = "btn small primary";
  btn.textContent = "→ Crear paleta con estos colores";
  btn.addEventListener("click", () => createPalette(baseName || "Extraída", colors));
  box.appendChild(btn);
  const hint = document.createElement("p");
  hint.className = "muted";
  hint.style.marginTop = "6px";
  hint.textContent = "Click en un color = copiar · doble click = añadir a la paleta activa";
  box.appendChild(hint);
}

// ---------- paletas icónicas ----------
const ICONIC = [
  { name: "Gulf", colors: ["#8fc8e8", "#f47c30", "#002f6c", "#ffffff"] },
  { name: "Martini Racing", colors: ["#ffffff", "#002b5c", "#69b3e7", "#e4002b"] },
  { name: "JPS black & gold", colors: ["#000000", "#c9a227", "#ffffff"] },
  { name: "Castrol", colors: ["#00843d", "#ed1c24", "#ffffff", "#000000"] },
  { name: "Jägermeister", colors: ["#f36f21", "#1a4736", "#ffffff"] },
  { name: "Repsol", colors: ["#ff8200", "#da291c", "#ffffff", "#005eb8"] },
  { name: "Red Bull Racing", colors: ["#121f45", "#db0a40", "#ffc906"] },
  { name: "Petronas", colors: ["#00b7ac", "#000000", "#ffffff"] },
  { name: "Alpine F1", colors: ["#005bac", "#fd4bc7", "#ffffff", "#000000"] },
  { name: "Rosso corsa", colors: ["#d40000", "#fff200", "#000000"] },
];

function renderIconic() {
  const list = $("#iconic-list");
  list.innerHTML = "";
  ICONIC.forEach((pal) => {
    const row = document.createElement("div");
    row.className = "iconic-row";
    const name = document.createElement("span");
    name.className = "iconic-name";
    name.textContent = pal.name;
    const sws = document.createElement("span");
    sws.className = "iconic-swatches";
    pal.colors.forEach((hex) => sws.appendChild(swatchEl(hex)));
    const btn = document.createElement("button");
    btn.className = "btn small";
    btn.textContent = "Clonar";
    btn.title = "Crear una paleta con estos colores";
    btn.addEventListener("click", () => createPalette(pal.name, [...pal.colors]));
    row.append(name, sws, btn);
    list.appendChild(row);
  });
}

// ---------- armonías ----------
function renderHarmonies(hex) {
  const box = $("#harm-result");
  box.innerHTML = "";
  const norm = normalizeHex(hex);
  if (!norm) return;
  const [h, s, l] = rgbToHsl(...hexToRgb(norm));
  const groups = [
    ["Complementario", [hslToHex(h + 180, s, l)]],
    ["Análogos", [hslToHex(h - 30, s, l), hslToHex(h + 30, s, l)]],
    ["Tríada", [hslToHex(h + 120, s, l), hslToHex(h + 240, s, l)]],
    ["Sombras/luces", [hslToHex(h, s, Math.max(0.08, l - 0.25)), hslToHex(h, s, Math.min(0.92, l + 0.25))]],
  ];
  groups.forEach(([label, colors]) => {
    const row = document.createElement("div");
    row.className = "mini-row";
    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = label;
    row.appendChild(lbl);
    colors.forEach((c) => row.appendChild(swatchEl(c)));
    box.appendChild(row);
  });
}

$("#harm-color").addEventListener("input", (e) => {
  $("#harm-hex").value = e.target.value;
  renderHarmonies(e.target.value);
});
$("#harm-hex").addEventListener("input", (e) => {
  const norm = normalizeHex(e.target.value);
  if (norm) {
    $("#harm-color").value = norm;
    renderHarmonies(norm);
  }
});

// ---------- contraste ----------
function renderContrast() {
  const bg = $("#con-bg").value, fg = $("#con-fg").value;
  const ratio = contrastRatio(bg, fg);
  let verdict, cls;
  if (ratio >= 4.5) { verdict = "✓ Se lee perfectamente"; cls = "ok"; }
  else if (ratio >= 3) { verdict = "⚠ Justo: se lee, pero de lejos costará"; cls = "warn"; }
  else { verdict = "✗ Ilegible en carrera, cambia uno de los dos"; cls = "bad"; }
  const box = $("#con-result");
  box.innerHTML = `Ratio <b>${ratio.toFixed(2)}:1</b> — ${verdict}
    <div class="con-sample" style="background:${bg};color:${fg}">42</div>`;
}
$("#con-bg").addEventListener("input", renderContrast);
$("#con-fg").addEventListener("input", renderContrast);

// ============================================================
// TAB LOGOS
// ============================================================
let catalog = { categories: [], logos: [], packs: [] };
let userLogos = [];
let customCats = [];
let brandPalettes = [];
let collapsedCats = new Set();
let selMode = false;
const selected = new Map(); // id -> logo
let logoFilters = { tag: "", favOnly: false };

async function loadLogos() {
  try {
    const url = IS_EXT ? chrome.runtime.getURL("logos/catalog.json") : "../logos/catalog.json";
    catalog = await (await fetch(url)).json();
  } catch (e) {
    console.error("catálogo:", e);
  }
  try {
    const url = IS_EXT ? chrome.runtime.getURL("data/brand-palettes.json") : "../data/brand-palettes.json";
    const data = await (await fetch(url)).json();
    brandPalettes = data.brands || [];
  } catch (e) {
    console.warn("brand palettes no cargadas:", e);
  }
  const stored = await store.get({ userLogos: [], logosCollapsed: [], customCats: [] });
  userLogos = stored.userLogos;
  customCats = stored.customCats || [];
  collapsedCats = new Set(stored.logosCollapsed);
  renderCatSelect();
  renderPacks();
  renderLogos();
}

function findBrandPalette(text) {
  const t = (text || "").toLowerCase();
  for (const b of brandPalettes) {
    for (const k of b.match) if (t.includes(k)) return b;
  }
  return null;
}

function renderCatSelect() {
  const sel = $("#add-cat");
  sel.innerHTML = "";
  catalog.categories.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    sel.appendChild(o);
  });
  customCats.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    sel.appendChild(o);
  });
  const mine = document.createElement("option");
  mine.value = "_mios";
  mine.textContent = "Mis logos";
  mine.selected = !customCats.length;
  sel.appendChild(mine);
  const create = document.createElement("option");
  create.value = "_new_cat_";
  create.textContent = "＋ Nueva categoría…";
  sel.appendChild(create);
  sel.onchange = async () => {
    if (sel.value !== "_new_cat_") return;
    const name = prompt("Nombre de la nueva categoría:");
    if (!name || !name.trim()) { sel.value = "_mios"; return; }
    const id = "uc" + Date.now();
    customCats.push({ id, name: name.trim() });
    await store.set({ customCats });
    renderCatSelect();
    renderLogos();
    sel.value = id;
  };
}

// ---------- packs ----------
function renderPacks() {
  const list = $("#pack-list");
  list.innerHTML = "";
  const byId = {};
  catalog.logos.forEach((l) => (byId[l.id] = l));
  (catalog.packs || []).forEach((pack) => {
    const row = document.createElement("div");
    row.className = "pack-row";
    const name = document.createElement("span");
    name.className = "pack-name";
    name.textContent = `${pack.name} (${pack.logos.length})`;
    const thumbs = document.createElement("span");
    thumbs.className = "pack-thumbs";
    pack.logos.slice(0, 6).forEach((id) => {
      const l = byId[id];
      if (!l || !l.commons) return;
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = commonsUrl(l.commons, 60);
      img.alt = img.title = l.name;
      thumbs.appendChild(img);
    });
    const btn = document.createElement("button");
    btn.className = "btn small primary";
    btn.textContent = "⬇ Pack";
    btn.title = "Descargar todos a Descargas/TP-Companion/" + safeName(pack.name);
    btn.addEventListener("click", () => downloadPack(pack, byId));
    row.append(name, thumbs, btn);
    list.appendChild(row);
  });
}

async function downloadPack(pack, byId) {
  toast(`Descargando ${pack.logos.length} logos…`);
  let ok = 0;
  for (const id of pack.logos) {
    const l = byId[id];
    if (!l || !l.commons) continue;
    const r = await sendBg({
      type: "download",
      url: commonsUrl(l.commons, 1200),
      filename: `${safeName(pack.name)}/${safeName(l.name)}.png`,
    });
    if (r && r.ok) ok++;
    await new Promise((res) => setTimeout(res, 250));
  }
  toast(`${pack.name}: ${ok}/${pack.logos.length} en Descargas/TP-Companion/${safeName(pack.name)}`);
}

// ---------- selección múltiple ----------
function updateSelBar() {
  const bar = $("#sel-bar");
  bar.classList.toggle("on", selMode);
  $("#sel-count").textContent = selected.size
    ? `${selected.size} logo${selected.size > 1 ? "s" : ""} seleccionado${selected.size > 1 ? "s" : ""}`
    : "Toca los logos que quieras descargar";
}

$("#sel-toggle").addEventListener("click", () => {
  selMode = !selMode;
  if (!selMode) selected.clear();
  document.body.classList.toggle("selmode", selMode);
  updateSelBar();
  renderLogos();
});

$("#sel-cancel").addEventListener("click", () => {
  selMode = false;
  selected.clear();
  document.body.classList.remove("selmode");
  updateSelBar();
  renderLogos();
});

$("#sel-download").addEventListener("click", async () => {
  if (!selected.size) return toast("No hay nada seleccionado", true);
  const items = [...selected.values()];
  toast(`Descargando ${items.length} logos…`);
  let ok = 0;
  for (const l of items) {
    const r = await sendBg({
      type: "download",
      url: l.dataUrl || commonsUrl(l.commons, 1200),
      filename: `seleccion/${safeName(l.name)}.png`,
    });
    if (r && r.ok) ok++;
    await new Promise((res) => setTimeout(res, 250));
  }
  toast(`${ok}/${items.length} en Descargas/TP-Companion/seleccion`);
  selected.clear();
  updateSelBar();
  renderLogos();
});

// ---------- repositorio ----------
function renderLogos() {
  const list = $("#logo-list");
  const filter = ($("#logo-filter").value || "").toLowerCase().trim();
  list.innerHTML = "";
  syncTagChip();

  const cats = [...catalog.categories, ...customCats, { id: "_mios", name: "Mis logos" }];
  const all = [...catalog.logos, ...userLogos.map((l) => ({ ...l, user: true }))].filter((l) => {
    if (filter && !l.name.toLowerCase().includes(filter) && !(l.tags || []).some((t) => t.toLowerCase().includes(filter))) return false;
    if (l.user && logoFilters.favOnly && !l.fav) return false;
    if (l.user && logoFilters.tag && !(l.tags || []).map((t) => t.toLowerCase()).includes(logoFilters.tag.toLowerCase())) return false;
    return true;
  });

  cats.forEach((cat) => {
    const inCat = all.filter((l) => (l.cat || "_mios") === cat.id);
    if (!inCat.length) return;
    const isCollapsed = collapsedCats.has(cat.id) && !filter;
    const h = document.createElement("div");
    h.className = "cat-title" + (isCollapsed ? " collapsed" : "");
    h.textContent = `${cat.name} (${inCat.length})`;
    h.addEventListener("click", async () => {
      if (collapsedCats.has(cat.id)) collapsedCats.delete(cat.id);
      else collapsedCats.add(cat.id);
      await store.set({ logosCollapsed: [...collapsedCats] });
      renderLogos();
    });
    list.appendChild(h);
    if (isCollapsed) return;
    const grid = document.createElement("div");
    grid.className = "logo-grid";
    inCat.forEach((logo) => grid.appendChild(logoCard(logo)));
    list.appendChild(grid);
  });

  if (!all.length) list.innerHTML = '<div class="empty">Nada que coincida con el filtro.</div>';
}

function logoCard(logo) {
  const card = document.createElement("div");
  card.className = "logo-card";
  const downloadable = !!(logo.commons || logo.dataUrl);

  const thumb = document.createElement("div");
  thumb.className = "logo-thumb";
  if (downloadable) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = logo.dataUrl || commonsUrl(logo.commons, 120);
    img.alt = logo.name;
    img.addEventListener("error", () => {
      thumb.classList.add("placeholder");
      thumb.textContent = "✕";
    });
    thumb.appendChild(img);
  } else {
    thumb.classList.add("placeholder");
    thumb.textContent = "🔍";
  }
  card.appendChild(thumb);

  const name = document.createElement("div");
  name.className = "logo-name";
  name.textContent = (logo.fav ? "★ " : "") + logo.name;
  name.title = logo.name;
  card.appendChild(name);

  // paleta corporativa (chips de color clonables)
  const bp = findBrandPalette(logo.name);
  if (bp) {
    const palWrap = document.createElement("div");
    palWrap.className = "brand-pal";
    palWrap.title = `Paleta ${bp.name} · click = añadir a paleta activa`;
    bp.colors.forEach((hex) => {
      const sw = document.createElement("span");
      sw.className = "brand-sw";
      sw.style.background = hex;
      sw.title = hex + " · click = a paleta activa";
      sw.addEventListener("click", (e) => { e.stopPropagation(); addToActivePalette(hex); });
      palWrap.appendChild(sw);
    });
    card.appendChild(palWrap);
  }

  // etiquetas (solo en Mis logos)
  if (logo.user && logo.tags && logo.tags.length) {
    const tw = document.createElement("div");
    tw.className = "logo-tags";
    logo.tags.forEach((t) => {
      const c = document.createElement("span"); c.className = "logo-tag"; c.textContent = t;
      c.addEventListener("click", (e) => { e.stopPropagation(); logoFilters.tag = (logoFilters.tag === t ? "" : t); renderLogos(); });
      tw.appendChild(c);
    });
    card.appendChild(tw);
  }

  if (selMode && downloadable) {
    card.classList.add("selectable");
    if (selected.has(logo.id)) card.classList.add("selected");
    card.addEventListener("click", () => {
      if (selected.has(logo.id)) selected.delete(logo.id);
      else selected.set(logo.id, logo);
      card.classList.toggle("selected");
      updateSelBar();
    });
    return card;
  }

  const actions = document.createElement("div");
  actions.className = "logo-actions";

  const mkBtn = (label, title, fn) => {
    const b = document.createElement("button");
    b.className = "btn small";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", fn);
    actions.appendChild(b);
    return b;
  };

  if (logo.commons) {
    mkBtn("➕ TP", "Añadir directamente a Trading Paints", () => injectLogo(logo)).classList.add("primary");
    mkBtn("🪄", "Editar en el Taller (contorno, recorte…)", () => sendToWorkshop(logo));
    mkBtn("⬇ PNG", "Descargar como PNG (1200px)", () => downloadLogo(logo, "png"));
    mkBtn("⬇ SVG", "Descargar SVG original", () => downloadLogo(logo, "svg"));
  } else if (logo.dataUrl) {
    mkBtn(logo.fav ? "★" : "☆", logo.fav ? "Quitar de favoritos" : "Marcar favorito", async () => {
      const u = userLogos.find((l) => l.id === logo.id); if (!u) return;
      u.fav = !u.fav; await store.set({ userLogos }); renderLogos();
    });
    mkBtn("🏷", "Editar etiquetas", async () => {
      const u = userLogos.find((l) => l.id === logo.id); if (!u) return;
      const current = (u.tags || []).join(", ");
      const txt = prompt("Etiquetas separadas por comas:", current);
      if (txt == null) return;
      u.tags = txt.split(",").map((t) => t.trim()).filter(Boolean);
      await store.set({ userLogos }); renderLogos();
    });
    mkBtn("➕ TP", "Añadir directamente a Trading Paints", () => injectLogo(logo)).classList.add("primary");
    mkBtn("🪄", "Editar en el Taller (contorno, recorte, quitar fondo…)", () => sendToWorkshop(logo));
    mkBtn("⬇", "Descargar", () => downloadLogo(logo, "user"));
    mkBtn("🗑", "Quitar de mis logos", async () => {
      userLogos = userLogos.filter((l) => l.id !== logo.id);
      await store.set({ userLogos });
      renderLogos();
    });
  } else {
    mkBtn("🔍 Buscar", "Buscar este logo con el buscador de arriba", () => {
      $("#web-q").value = logo.name.replace(/\s*\(.*\)$/, "");
      $("#web-q").scrollIntoView({ behavior: "smooth", block: "center" });
      webSearch();
    });
  }

  card.appendChild(actions);
  return card;
}

async function downloadLogo(logo, kind) {
  let url, filename;
  if (kind === "png") {
    url = commonsUrl(logo.commons, 1200);
    filename = safeName(logo.name) + ".png";
  } else if (kind === "svg") {
    url = commonsUrl(logo.commons);
    filename = logo.commons;
  } else {
    url = logo.dataUrl;
    const ext = (logo.mime || "image/png").split("/")[1].replace("+xml", "");
    filename = safeName(logo.name) + "." + ext;
  }
  const r = await sendBg({ type: "download", url, filename });
  if (r && r.ok) toast(filename + " → Descargas/TP-Companion");
  else toast("Error al descargar: " + ((r && r.error) || "?"), true);
}

async function injectLogo(logo) {
  if (!IS_EXT) return toast("Solo disponible como extensión", true);

  let dataUrl = logo.dataUrl;
  let mime = logo.mime || "image/png";
  const filename = safeName(logo.name) + ".png";
  if (!dataUrl) {
    toast("Trayendo logo…");
    const r = await sendBg({ type: "fetchDataUrl", url: logo.fullUrl || commonsUrl(logo.commons, 1200) });
    if (!r || !r.ok) return toast("No se pudo traer el logo", true);
    dataUrl = r.dataUrl;
    mime = r.mime;
  }

  // 1) Si la pestaña activa es Trading Paints, intentar inyectar ya
  const [tab] = await new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true }, res));
  const onTP = tab && /https:\/\/[^/]*tradingpaints\.com/.test(tab.url || "");
  if (onTP) {
    const resp = await new Promise((res) =>
      chrome.tabs.sendMessage(tab.id, { type: "injectFile", dataUrl, mime, filename }, (r) => {
        if (chrome.runtime.lastError) res(null);
        else res(r);
      })
    );
    if (resp && resp.ok) return toast("Logo metido en el formulario 👌");
  }

  // 2) Si no: encolar; el content script drena la cola conforme aparezcan formularios.
  const { pendingInjectQueue = [] } = await store.get({ pendingInjectQueue: [] });
  pendingInjectQueue.push({ dataUrl, mime, filename, name: logo.name, ts: Date.now() });
  await store.set({ pendingInjectQueue });
  const n = pendingInjectQueue.length;

  if (onTP) {
    return toast(`En cola (${n}) · se añade en cuanto haya formulario`);
  }
  const tpTabs = await new Promise((res) => chrome.tabs.query({ url: "https://*.tradingpaints.com/*" }, res));
  if (tpTabs.length) {
    chrome.tabs.update(tpTabs[0].id, { active: true });
    chrome.windows.update(tpTabs[0].windowId, { focused: true });
    toast(`En cola (${n}) · ve al formulario de subida en Trading Paints`);
  } else {
    chrome.tabs.create({ url: "https://www.tradingpaints.com/" });
    toast(`Abro Trading Paints · ${n} en cola para inyectar`);
  }
}

// ---------- buscador web ----------
const SEARCH_HOSTS = [
  { host: "commons.wikimedia.org", label: "Commons" },
  { host: "en.wikipedia.org", label: "Wikipedia" },
];

async function searchHost(host, q) {
  const url =
    `https://${host}/w/api.php?action=query&format=json&origin=*&list=search&srnamespace=6&srlimit=8` +
    `&srsearch=${encodeURIComponent(q + " logo")}`;
  const data = await (await fetch(url)).json();
  return (data.query?.search || [])
    .map((h) => h.title.replace(/^File:/, ""))
    .filter((t) => /\.(svg|png|jpe?g|webp)$/i.test(t));
}

// Imágenes de iconografía/plantillas de Wikipedia que no son logos de marca
const META_IMG = /commons-logo|wiki letter|edit-clear|question.?book|ambox|increase2|decrease2|red pog|padlock|disambig|searchtool|symbol |stub|loudspeaker|oojs|octicons|font awesome/i;

// Plan B potente: las imágenes del ARTÍCULO de la marca en Wikipedia
// (el logo de la infobox suele ser el oficial en buena calidad).
async function searchArticleImages(q) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1` +
    `&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(q)}&prop=images&imlimit=30`;
  const data = await (await fetch(url)).json();
  const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const out = [];
  for (const page of Object.values(data.query?.pages || {})) {
    for (const im of page.images || []) {
      const t = im.title.replace(/^File:/, "");
      if (!/\.(svg|png|jpe?g|webp)$/i.test(t)) continue;
      if (META_IMG.test(t)) continue;
      const lt = t.toLowerCase();
      if (/logo|wordmark/i.test(t) || tokens.some((tok) => lt.includes(tok))) {
        out.push({ title: t, host: "en.wikipedia.org", label: page.title });
      }
    }
  }
  return out;
}

async function webSearch() {
  const q = $("#web-q").value.trim();
  const box = $("#web-results");
  if (!q) return;
  box.innerHTML = '<div class="searching">Buscando "' + q + '" en Commons y Wikipedia…</div>';

  let results = [];
  await Promise.all([
    ...SEARCH_HOSTS.map(async ({ host, label }) => {
      try {
        const titles = await searchHost(host, q);
        results.push(...titles.map((t) => ({ title: t, host, label })));
      } catch (e) {
        console.warn(host, e);
      }
    }),
    (async () => {
      try {
        results.push(...(await searchArticleImages(q)));
      } catch (e) {
        console.warn("articleImages", e);
      }
    })(),
  ]);

  // ranking: títulos tipo logo primero, fotos de cámara al fondo; dedupe y limitar
  const score = (r) =>
    (/logo|wordmark|emblem/i.test(r.title) ? 0 : 2) +
    (/\bdsc|\bimg[_ ]|\d{7,}|photo/i.test(r.title) ? 3 : 0) +
    (r.host === "commons.wikimedia.org" ? 0 : 0.5);
  const seen = new Set();
  results = results
    .sort((a, b) => score(a) - score(b))
    .filter((r) => !seen.has(r.title.toLowerCase()) && seen.add(r.title.toLowerCase()))
    .slice(0, 10);

  box.innerHTML = "";
  if (!results.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.innerHTML = "Nada en Commons/Wikipedia. ";
    const a = document.createElement("a");
    a.href = "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(q + " logo png transparente");
    a.target = "_blank";
    a.textContent = "Buscar en Google Imágenes →";
    a.style.color = "var(--accent)";
    div.appendChild(a);
    box.appendChild(div);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "logo-grid";
  results.forEach((r) => grid.appendChild(searchResultCard(r, q)));
  box.appendChild(grid);
}

function searchResultCard(r, q) {
  const card = document.createElement("div");
  card.className = "logo-card";

  const thumb = document.createElement("div");
  thumb.className = "logo-thumb";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = filePathUrl(r.host, r.title, 140);
  img.alt = r.title;
  img.addEventListener("error", () => {
    thumb.classList.add("placeholder");
    thumb.textContent = "✕";
  });
  thumb.appendChild(img);
  card.appendChild(thumb);

  const name = document.createElement("div");
  name.className = "logo-name";
  name.textContent = r.title.replace(/\.(svg|png|jpe?g)$/i, "");
  name.title = r.title + " (" + r.label + ")";
  card.appendChild(name);

  const badge = document.createElement("span");
  badge.className = "src-badge";
  badge.textContent = r.label;
  card.appendChild(badge);

  const actions = document.createElement("div");
  actions.className = "logo-actions";
  const mkBtn = (label, title, fn) => {
    const b = document.createElement("button");
    b.className = "btn small";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", fn);
    actions.appendChild(b);
    return b;
  };

  const resolve = async () => {
    toast("Trayendo logo…");
    const res = await sendBg({ type: "fetchDataUrl", url: filePathUrl(r.host, r.title, 1200) });
    if (!res || !res.ok) {
      toast("No se pudo traer", true);
      return null;
    }
    let { dataUrl } = res;
    if ($("#web-nobg").checked) {
      try {
        dataUrl = await removeWhiteBg(dataUrl);
      } catch (_) {}
    }
    return dataUrl;
  };

  mkBtn("➕ TP", "Añadir directamente a Trading Paints", async () => {
    const dataUrl = await resolve();
    if (dataUrl) injectLogo({ name: q, dataUrl, mime: "image/png" });
  }).classList.add("primary");

  mkBtn("🪄", "Editar en el Taller del estudio", async () => {
    const dataUrl = await resolve();
    if (dataUrl) sendToWorkshop({ name: q, dataUrl });
  });

  mkBtn("💾", "Guardar en Mis logos", async () => {
    const dataUrl = await resolve();
    if (dataUrl) saveUserLogo(q.charAt(0).toUpperCase() + q.slice(1), "_mios", dataUrl, "image/png");
  });

  mkBtn("⬇", "Descargar PNG", async () => {
    const dataUrl = await resolve();
    if (!dataUrl) return;
    const res = await sendBg({ type: "download", url: dataUrl, filename: safeName(q) + ".png" });
    if (res && res.ok) toast(safeName(q) + ".png → Descargas/TP-Companion");
  });

  card.appendChild(actions);
  return card;
}

$("#web-go").addEventListener("click", webSearch);
$("#web-q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") webSearch();
});

// ---------- añadir logos propios ----------
$("#logo-filter").addEventListener("input", renderLogos);
$("#filter-fav").addEventListener("click", () => {
  logoFilters.favOnly = !logoFilters.favOnly;
  $("#filter-fav").classList.toggle("on", logoFilters.favOnly);
  renderLogos();
});
$("#filter-tag").addEventListener("click", () => {
  logoFilters.tag = "";
  $("#filter-tag").style.display = "none";
  renderLogos();
});

function syncTagChip() {
  const chip = $("#filter-tag");
  if (logoFilters.tag) {
    chip.textContent = `🏷 ${logoFilters.tag} ✕`;
    chip.style.display = "";
  } else {
    chip.style.display = "none";
  }
}

async function saveUserLogo(name, cat, dataUrl, mime, extras = {}) {
  const tagsRaw = ($("#add-tags") && $("#add-tags").value || "").trim();
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const fav = !!($("#add-fav") && $("#add-fav").checked);
  userLogos.push({ id: "u" + Date.now(), name, cat, dataUrl, mime, tags, fav, ...extras });
  await store.set({ userLogos });
  if ($("#add-tags")) $("#add-tags").value = "";
  if ($("#add-fav")) $("#add-fav").checked = false;
  renderLogos();
  toast('"' + name + '" añadido a tu biblioteca');
}

async function maybeRemoveBg(dataUrl) {
  if (!$("#add-nobg").checked) return dataUrl;
  try {
    return await removeWhiteBg(dataUrl);
  } catch (_) {
    return dataUrl;
  }
}

$("#add-from-url").addEventListener("click", async () => {
  const name = $("#add-name").value.trim();
  const url = $("#add-url").value.trim();
  if (!name) return toast("Ponle un nombre", true);
  if (!/^https?:\/\//.test(url)) return toast("URL no válida", true);
  toast("Trayendo…");
  const r = await sendBg({ type: "fetchDataUrl", url });
  if (r && r.ok) {
    await saveUserLogo(name, $("#add-cat").value, await maybeRemoveBg(r.dataUrl), "image/png");
    $("#add-name").value = "";
    $("#add-url").value = "";
  } else {
    // sin permiso/CORS para ese dominio: al menos descargarlo
    await sendBg({ type: "download", url, filename: safeName(name) });
    toast("No pude traerlo directo; lo he mandado a Descargas. Añádelo con 'Subir archivo'.", true);
  }
});

$("#add-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const name = $("#add-name").value.trim() || file.name.replace(/\.[^.]+$/, "");
  const reader = new FileReader();
  reader.onload = async () => {
    await saveUserLogo(name, $("#add-cat").value, await maybeRemoveBg(reader.result), "image/png");
    $("#add-name").value = "";
    e.target.value = "";
  };
  reader.readAsDataURL(file);
});

// ---------- refresco en vivo ----------
if (IS_EXT && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.colorHistory) renderHistory();
  });
}

// ---------- códigos de pintura ----------
let paintGroups = [];
async function loadPaints() {
  try {
    const url = IS_EXT ? chrome.runtime.getURL("data/paints.json") : "../data/paints.json";
    const data = await (await fetch(url)).json();
    paintGroups = data.groups || [];
    $("#paint-note").textContent = data.note || "";
  } catch (e) {
    $("#paint-list").innerHTML = '<div class="empty">No se pudo cargar la biblioteca.</div>';
    return;
  }
  renderPaints();
}
function renderPaints() {
  const filter = ($("#paint-filter").value || "").toLowerCase().trim();
  const box = $("#paint-list");
  box.innerHTML = "";
  let shown = 0;
  paintGroups.forEach((g) => {
    const matches = g.colors.filter(
      (c) => !filter || c.name.toLowerCase().includes(filter) || g.brand.toLowerCase().includes(filter)
    );
    if (!matches.length) return;
    shown += matches.length;
    const h = document.createElement("div");
    h.className = "paint-brand";
    h.textContent = g.brand;
    box.appendChild(h);
    const row = document.createElement("div");
    row.className = "paint-row";
    matches.forEach((c) => {
      const chip = document.createElement("div");
      chip.className = "paint-chip";
      chip.title = "Click = copiar " + c.hex;
      chip.innerHTML = `<span class="sw2" style="background:${c.hex}"></span><span class="nm">${c.name}</span><button class="ad" title="A la paleta activa">＋</button>`;
      chip.addEventListener("click", () => copyText(c.hex, c.name));
      chip.querySelector(".ad").addEventListener("click", (e) => { e.stopPropagation(); addToActivePalette(c.hex); });
      row.appendChild(chip);
    });
    box.appendChild(row);
  });
  if (!shown) box.innerHTML = '<div class="empty">Nada coincide.</div>';
}
$("#paint-filter").addEventListener("input", renderPaints);

// ---------- ajustes ----------
async function loadSettings() {
  const { settings } = await store.get({ settings: {} });
  $("#set-widget").checked = settings.widgetEnabled !== false;
  $("#set-capture").checked = settings.captureEnabled !== false;
  const save = async () => {
    const { settings: cur } = await store.get({ settings: {} });
    await store.set({
      settings: { ...cur, widgetEnabled: $("#set-widget").checked, captureEnabled: $("#set-capture").checked },
    });
    toast("Ajustes guardados");
  };
  $("#set-widget").addEventListener("change", save);
  $("#set-capture").addEventListener("change", save);
}

// ---------- donación ----------
// URL del PayPal del autor (la del QR en icons/donate-qr.png). Cuando la tengas
// confirmada, ponla aquí y el botón "Abrir PayPal" funcionará al click.
const DONATE_URL = "https://www.paypal.com/paypalme/flyerreps";
$("#open-donate")?.addEventListener("click", () => { $("#donate").hidden = false; });
$("#donate-close")?.addEventListener("click", () => { $("#donate").hidden = true; });
$("#donate")?.addEventListener("click", (e) => { if (e.target.id === "donate") $("#donate").hidden = true; });
$("#donate-open")?.addEventListener("click", () => {
  if (IS_EXT) chrome.tabs.create({ url: DONATE_URL });
  else window.open(DONATE_URL, "_blank");
});
$("#donate-copy")?.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(DONATE_URL); toast("Enlace copiado"); }
  catch { toast("No pude copiar", true); }
});

// ---------- onboarding (primera vez) ----------
async function maybeOnboard() {
  const { onboarded } = await store.get({ onboarded: false });
  if (onboarded) return;
  const modal = $("#onboarding");
  if (!modal) return;
  modal.hidden = false;
  let idx = 0;
  const slides = [...modal.querySelectorAll(".onboard-slide")];
  const dots = [...modal.querySelectorAll(".dot-mark")];
  const next = $("#onboard-next");
  const skip = $("#onboard-skip");
  const show = () => {
    slides.forEach((s, i) => s.classList.toggle("active", i === idx));
    dots.forEach((d, i) => d.classList.toggle("active", i === idx));
    next.textContent = idx === slides.length - 1 ? "Vamos allá" : "Siguiente";
  };
  next.addEventListener("click", async () => {
    if (idx < slides.length - 1) { idx++; show(); return; }
    modal.hidden = true;
    await store.set({ onboarded: true });
  });
  skip.addEventListener("click", async () => {
    modal.hidden = true;
    await store.set({ onboarded: true });
  });
  show();
}

// ---------- init ----------
renderHistory();
loadPalettes();
loadLogos();
loadPaints();
loadSettings();
renderIconic();
renderContrast();
renderHarmonies("#e8443a");
$("#harm-hex").value = "#e8443a";
$("#harm-color").value = "#e8443a";
maybeOnboard();

// utilidades expuestas para pruebas en modo desarrollo
if (!IS_EXT) {
  window.TPC = { extractPaletteFromImage, removeWhiteBg, contrastRatio, hslToHex, rgbToHsl, hexToRgb, loadImage };
}
