// TP Companion — Estudio (taller de logos, tablero). Las texturas viven en textures.js.
const {
  IS_EXT, store, toast, normalizeHex, hexToRgb, rgbToHex,
  safeName, loadImage, readFileAsDataUrl,
  removeWhiteBg, trimTransparent, outlineImage, extractPalette,
} = TPC;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ===== navegación =====
function showView(view) {
  $$(".navbtn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "texturas" && window.Textures) window.Textures.render();
}
$$(".navbtn").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));

// ============================================================
// PALETAS (compartidas con el popup)
// ============================================================
let palettes = [];
let activePaletteId = null;

async function loadPalettes() {
  ({ palettes } = await store.get({ palettes: [] }));
  const saved = (await store.get({ activePalette: null })).activePalette;
  activePaletteId = saved && palettes.some((p) => p.id === saved) ? saved : palettes[0]?.id || null;
  renderPaletteSelect();
}
function renderPaletteSelect() {
  const sel = $("#palette-select");
  sel.innerHTML = "";
  if (!palettes.length) { sel.innerHTML = '<option value="">— sin paletas —</option>'; return; }
  palettes.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.name} (${p.colors.length})`;
    if (p.id === activePaletteId) o.selected = true;
    sel.appendChild(o);
  });
}
$("#palette-select").addEventListener("change", (e) => {
  activePaletteId = e.target.value || null;
  store.set({ activePalette: activePaletteId });
});
$("#new-palette").addEventListener("click", async () => {
  const name = prompt("Nombre de la nueva paleta:");
  if (!name || !name.trim()) return;
  const p = { id: "p" + Date.now(), name: name.trim(), colors: [] };
  palettes.push(p);
  activePaletteId = p.id;
  await store.set({ palettes, activePalette: activePaletteId });
  renderPaletteSelect();
  toast('Paleta "' + p.name + '" creada');
});
function activePalette() { return palettes.find((x) => x.id === activePaletteId); }
async function addToActivePalette(hex) {
  const norm = normalizeHex(hex);
  if (!norm) return;
  let p = activePalette();
  if (!p) { p = { id: "p" + Date.now(), name: "Estudio", colors: [] }; palettes.push(p); activePaletteId = p.id; }
  if (p.colors.includes(norm)) return toast("Ya está en " + p.name, true);
  p.colors.push(norm);
  await store.set({ palettes, activePalette: activePaletteId });
  renderPaletteSelect();
  toast(norm + " → " + p.name);
}

// ============================================================
// TALLER DE LOGOS
// ============================================================
let workOriginal = null, workCurrent = null;

function setWork(dataUrl, isOriginal = false) {
  workCurrent = dataUrl;
  if (isOriginal) workOriginal = dataUrl;
  $("#work-img").src = dataUrl;
  $("#work-img").style.display = "";
  $("#work-placeholder").style.display = "none";
  const img = new Image();
  img.onload = () => ($("#work-dims").textContent = `${img.naturalWidth} × ${img.naturalHeight} px`);
  img.src = dataUrl;
}

$("#work-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (file) setWork(await readFileAsDataUrl(file), true);
});
$("#work-thick").addEventListener("input", () => ($("#work-thick-val").textContent = $("#work-thick").value));
$("#work-pad").addEventListener("input", () => ($("#work-pad-val").textContent = $("#work-pad").value));

$("#work-outline").addEventListener("click", async () => {
  if (!workCurrent) return toast("Sube un logo primero", true);
  toast("Aplicando contorno…");
  try { setWork(await outlineImage(workCurrent, $("#work-outline-color").value, +$("#work-thick").value)); toast("Contorno aplicado 🪄"); }
  catch (e) { toast("No se pudo procesar", true); }
});
$("#work-trim").addEventListener("click", async () => {
  if (!workCurrent) return toast("Sube un logo primero", true);
  const r = await trimTransparent(workCurrent, +$("#work-pad").value);
  if (!r.trimmed) return toast("No hay nada que recortar (¿tiene transparencia?)", true);
  setWork(r.dataUrl);
  toast(`Recortado a ${r.w}×${r.h}`);
});
$("#work-removebg").addEventListener("click", async () => {
  if (!workCurrent) return toast("Sube un logo primero", true);
  const cleaned = await removeWhiteBg(workCurrent);
  if (cleaned === workCurrent) return toast("No había fondo blanco que quitar");
  setWork(cleaned);
  toast("Fondo quitado");
});
$("#work-reset").addEventListener("click", () => { if (workOriginal) setWork(workOriginal); });
$("#work-save").addEventListener("click", async () => {
  if (!workCurrent) return toast("Nada que guardar", true);
  const name = prompt("Nombre del logo:", "logo_editado");
  if (!name) return;
  const { userLogos } = await store.get({ userLogos: [] });
  userLogos.push({ id: "u" + Date.now(), name: name.trim(), cat: "_mios", dataUrl: workCurrent, mime: "image/png" });
  await store.set({ userLogos });
  toast('"' + name.trim() + '" guardado en Mis logos');
});
$("#work-dl").addEventListener("click", () => {
  if (!workCurrent) return toast("Nada que descargar", true);
  const a = document.createElement("a");
  a.href = workCurrent; a.download = "logo_editado.png"; a.click();
});
$("#work-tp").addEventListener("click", async () => {
  if (!workCurrent) return toast("Nada que enviar", true);
  if (!IS_EXT) return toast("Solo disponible como extensión", true);
  const n = await TPC.enqueueInject({ dataUrl: workCurrent, mime: "image/png", filename: "logo_editado.png", name: "logo editado" });
  const onTP = await TPC.focusTradingPaintsTab();
  toast(onTP ? `En cola (${n})· añadido al formulario en cuanto aparezca` : `Abriendo TP · ${n} en cola`);
});

// recibir un logo desde el popup (botón 🪄 Taller)
async function consumeIncoming() {
  const { workshopIncoming } = await store.get({ workshopIncoming: null });
  if (workshopIncoming && Date.now() - workshopIncoming.ts < 120000 && workshopIncoming.dataUrl) {
    setWork(workshopIncoming.dataUrl, true);
    showView("logos");
    await store.set({ workshopIncoming: null });
  }
}

// ============================================================
// TABLERO
// ============================================================
let board = [];
async function loadBoard() { ({ board } = await store.get({ board: [] })); renderBoard(); }

function renderBoard() {
  const grid = $("#board-grid");
  grid.innerHTML = "";
  if (!board.length) {
    grid.innerHTML = '<div class="board-empty">Aún no hay referencias. Pega una URL o sube imágenes de liveries que te molen.</div>';
    return;
  }
  board.forEach((ref) => {
    const card = document.createElement("div");
    card.className = "board-card";
    const img = document.createElement("img");
    img.src = ref.src; img.alt = "referencia"; img.title = "Click = extraer paleta";
    img.addEventListener("click", () => extractFromRef(ref, card));
    img.addEventListener("error", () => { img.style.opacity = ".3"; });
    card.appendChild(img);
    const pal = document.createElement("div"); pal.className = "bc-pal"; card.appendChild(pal);
    const tools = document.createElement("div"); tools.className = "bc-tools";
    const palBtn = document.createElement("button");
    palBtn.className = "btn small"; palBtn.textContent = "🎨 Paleta";
    palBtn.addEventListener("click", () => extractFromRef(ref, card));
    const delBtn = document.createElement("button");
    delBtn.className = "btn small ghost"; delBtn.textContent = "🗑";
    delBtn.addEventListener("click", async () => { board = board.filter((r) => r.id !== ref.id); await store.set({ board }); renderBoard(); });
    tools.append(palBtn, delBtn);
    card.appendChild(tools);
    grid.appendChild(card);
  });
}
async function extractFromRef(ref, card) {
  try {
    const img = await loadImage(ref.src);
    const colors = extractPalette(img, 6);
    const pal = card.querySelector(".bc-pal");
    pal.innerHTML = "";
    colors.forEach((hex) => {
      const s = document.createElement("div");
      s.className = "ps"; s.style.background = hex; s.title = hex + " · click = a la paleta activa";
      s.addEventListener("click", () => addToActivePalette(hex));
      pal.appendChild(s);
    });
    toast("Paleta extraída · click en un color para guardarlo");
  } catch (e) { toast("No pude leer esa imagen (¿CORS?). Prueba a subirla.", true); }
}
async function addRef(src) {
  board.unshift({ id: "r" + Date.now() + Math.random().toString(36).slice(2, 6), src });
  await store.set({ board });
  renderBoard();
}
$("#board-add-url").addEventListener("click", async () => {
  const url = $("#board-url").value.trim();
  if (!/^https?:\/\//.test(url)) return toast("URL no válida", true);
  await addRef(url); $("#board-url").value = "";
});
$("#board-url").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#board-add-url").click(); });
$("#board-add-file").addEventListener("click", () => $("#board-file").click());
$("#board-file").addEventListener("change", async (e) => {
  for (const file of e.target.files) await addRef(await readFileAsDataUrl(file));
  e.target.value = "";
});

// ============================================================
// AI DECAL GENERATOR
// ============================================================
const AI_STYLES = [
  { label: "Racing livery",  prompt: "racing livery graphic, bold geometry, motorsport" },
  { label: "Retro sponsor",  prompt: "retro 80s sponsor logo, vintage racing, distressed print" },
  { label: "Dragón",         prompt: "dragon, detailed scales, fierce, symmetrical" },
  { label: "Neon eléctrico", prompt: "neon lightning bolt, glowing electric, dark background" },
  { label: "Fuego y llamas", prompt: "fire and flames, hot rod style, orange red" },
  { label: "Tribal",         prompt: "tribal tattoo style, black angular shapes, symmetric" },
  { label: "Emblema cromo",  prompt: "metallic chrome emblem, 3D shiny, luxury" },
  { label: "Skull racing",   prompt: "skull with racing helmet, aggressive, detailed" },
  { label: "Anime / cómic",  prompt: "anime style illustration, bold outlines, dynamic" },
  { label: "Graffiti",       prompt: "graffiti spray paint tag, urban street art style" },
];

const VECTOR_SUFFIX = "flat vector sticker art, bold black outlines, solid flat fill colors, no gradients, no shadows, no noise, no texture, adobe illustrator clipart style, die-cut sticker, svg vector, crisp clean edges, limited color palette, white background";

let aiDataUrl = null;
let aiSeed = null;

function colorDistSq(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

async function quantizeColors(dataUrl, k) {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = id.data;
  const total = data.length / 4;

  // Sample every 8th opaque pixel for k-means training
  const samples = [];
  for (let i = 0; i < total; i += 8) {
    if (data[i * 4 + 3] > 20) samples.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }
  if (!samples.length) return dataUrl;

  // Init centroids evenly spread across samples
  const step = Math.max(1, Math.floor(samples.length / k));
  let centroids = Array.from({ length: k }, (_, i) => [...samples[Math.min(i * step, samples.length - 1)]]);

  // K-means — 20 iterations
  for (let iter = 0; iter < 20; iter++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]); // r,g,b,count
    for (const px of samples) {
      let best = 0, bestD = Infinity;
      for (let j = 0; j < k; j++) { const d = colorDistSq(px, centroids[j]); if (d < bestD) { bestD = d; best = j; } }
      sums[best][0] += px[0]; sums[best][1] += px[1]; sums[best][2] += px[2]; sums[best][3]++;
    }
    let changed = false;
    for (let j = 0; j < k; j++) {
      if (!sums[j][3]) continue;
      const nc = [Math.round(sums[j][0] / sums[j][3]), Math.round(sums[j][1] / sums[j][3]), Math.round(sums[j][2] / sums[j][3])];
      if (colorDistSq(nc, centroids[j]) > 1) changed = true;
      centroids[j] = nc;
    }
    if (!changed) break;
  }

  // Apply palette to every opaque pixel
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (data[o + 3] <= 20) continue;
    const px = [data[o], data[o + 1], data[o + 2]];
    let best = 0, bestD = Infinity;
    for (let j = 0; j < k; j++) { const d = colorDistSq(px, centroids[j]); if (d < bestD) { bestD = d; best = j; } }
    data[o] = centroids[best][0]; data[o + 1] = centroids[best][1]; data[o + 2] = centroids[best][2];
  }

  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL("image/png");
}

async function imageToSVG(dataUrl, k) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const img = await loadImage(dataUrl);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imgd = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const svg = window.ImageTracer.getsvgstring(imgd, {
          ltres: 1, qtres: 1,
          pathomit: 8,
          rightangleenhance: true,
          colorsampling: 2,
          numberofcolors: Math.max(2, k),
          mincolorratio: 0,
          colorquantcycles: 3,
          strokewidth: 0,
          blurradius: 0, blurdelta: 20,
          viewbox: true, desc: false,
          scale: 1,
        });
        resolve(svg);
      } catch (e) { reject(e); }
    }, 50);
  });
}

// ---- helpers compartidos por generate + batch ----
async function generateOne(promptVal, model, size, seed) {
  const isVector = document.getElementById("ai-mode-vector").checked;
  const suffix   = isVector ? VECTOR_SUFFIX : "isolated on white background, clean edges, high detail";
  const full     = promptVal.includes(VECTOR_SUFFIX) ? promptVal : promptVal + ", " + suffix;
  const url      = `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=${size}&height=${size}&nologo=true&model=${model}&seed=${seed}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  let du = await new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(blob); });
  if (document.getElementById("ai-auto-bg").checked) du = await removeWhiteBg(du);
  if (isVector) {
    const k = Math.max(2, Math.min(24, parseInt(document.getElementById("ai-color-k").value) || 6));
    du = await quantizeColors(du, k);
    du = await removeWhiteBg(du);
  }
  return du;
}

async function makeThumbnail(dataUrl, size = 120) {
  const img = await loadImage(dataUrl);
  const c = document.createElement("canvas"); c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  const s = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  ctx.drawImage(img, (size - img.naturalWidth * s) / 2, (size - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return c.toDataURL("image/jpeg", 0.78);
}

// ---- historial ----
const AI_HIST_MAX = 12;

async function saveToHistory(entry) {
  const thumb = await makeThumbnail(entry.dataUrl);
  const { aiHistory = [] } = await store.get({ aiHistory: [] });
  aiHistory.unshift({ ...entry, thumb, ts: Date.now(), id: "h" + Date.now() });
  if (aiHistory.length > AI_HIST_MAX) aiHistory.length = AI_HIST_MAX;
  await store.set({ aiHistory });
  renderHistory(aiHistory);
}
async function loadHistory() {
  const { aiHistory = [] } = await store.get({ aiHistory: [] });
  if (aiHistory.length) renderHistory(aiHistory);
}
function renderHistory(history) {
  const wrap = document.getElementById("ai-history");
  const strip = document.getElementById("ai-history-strip");
  if (!history.length) { wrap.hidden = true; return; }
  wrap.hidden = false; strip.innerHTML = "";
  history.forEach(entry => {
    const card = document.createElement("div"); card.className = "ai-history-thumb";
    const img = document.createElement("img"); img.src = entry.thumb; img.title = entry.prompt;
    const meta = document.createElement("div"); meta.className = "ai-history-thumb-meta";
    meta.textContent = entry.model + "  " + new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    card.append(img, meta);
    card.addEventListener("click", () => {
      aiDataUrl = entry.dataUrl; aiSeed = entry.seed;
      document.getElementById("ai-result-img").src = entry.dataUrl;
      document.getElementById("ai-result-img").hidden = false;
      document.getElementById("ai-placeholder").style.display = "none";
      document.getElementById("ai-result-meta").textContent = `Semilla: ${entry.seed}  ·  ${entry.model}  ·  historial`;
      document.getElementById("ai-result-meta").hidden = false;
      document.getElementById("ai-actions").hidden = false;
      toast("Generación restaurada");
    });
    strip.appendChild(card);
  });
}

(function initAI() {
  // Style chips
  const chips = document.getElementById("ai-chips");
  AI_STYLES.forEach(({ label, prompt }) => {
    const c = document.createElement("button");
    c.className = "chip"; c.type = "button"; c.textContent = label;
    c.addEventListener("click", () => {
      const ta = document.getElementById("ai-prompt");
      const cur = ta.value.trim();
      if (cur.includes(prompt)) { c.classList.remove("active"); ta.value = cur.replace(", " + prompt, "").replace(prompt, "").trim(); return; }
      ta.value = cur ? cur + ", " + prompt : prompt;
      c.classList.add("active");
    });
    chips.appendChild(c);
  });

  // Optimizar para vector
  document.getElementById("ai-perfect-prompt").addEventListener("click", () => {
    const ta = document.getElementById("ai-prompt");
    const cur = ta.value.trim();
    if (!cur) return toast("Escribe una descripción primero", true);
    if (cur.includes(VECTOR_SUFFIX)) return toast("El prompt ya está optimizado");
    ta.value = cur + ", " + VECTOR_SUFFIX;
    toast("Prompt mejorado para estilo vector");
  });

  // Seed random
  document.getElementById("ai-seed-rnd").addEventListener("click", () => {
    document.getElementById("ai-seed").value = Math.floor(Math.random() * 9999999) + 1;
  });

  // Generate
  document.getElementById("ai-generate").addEventListener("click", async () => {
    const promptVal = document.getElementById("ai-prompt").value.trim();
    if (!promptVal) return toast("Escribe una descripción primero", true);

    const isVector  = document.getElementById("ai-mode-vector").checked;
    const model     = document.getElementById("ai-model").value;
    const size      = document.getElementById("ai-size").value;
    const seedInp   = document.getElementById("ai-seed").value;
    aiSeed = seedInp ? parseInt(seedInp) : Math.floor(Math.random() * 9999999) + 1;

    const btnGen    = document.getElementById("ai-generate");
    const progress  = document.getElementById("ai-progress");
    const progText  = document.getElementById("ai-progress-text");
    const resultImg = document.getElementById("ai-result-img");
    const placeholder = document.getElementById("ai-placeholder");
    const actions   = document.getElementById("ai-actions");
    const meta      = document.getElementById("ai-result-meta");

    btnGen.disabled = true;
    progress.hidden = false;
    resultImg.hidden = true;
    placeholder.style.display = "";
    placeholder.querySelector("div:last-child").textContent = "Generando, espera…";
    actions.hidden = true; meta.hidden = true; aiDataUrl = null;
    document.getElementById("ai-batch-grid").hidden = true;

    const msgs = ["Pensando…", "Esbozando el decal…", "Añadiendo detalles…", "Casi listo…"];
    let mi = 0;
    const msgInterval = setInterval(() => { progText.textContent = msgs[mi++ % msgs.length]; }, 2200);

    try {
      aiDataUrl = await generateOne(promptVal, model, size, aiSeed);
      resultImg.src = aiDataUrl; resultImg.hidden = false;
      placeholder.style.display = "none";
      meta.textContent = `Semilla: ${aiSeed}  ·  ${model}  ·  ${size}×${size}${isVector ? "  ·  Vector" : ""}`;
      meta.hidden = false; actions.hidden = false;
      toast(isVector ? "Decal generado en modo vector" : "Decal generado");
      saveToHistory({ dataUrl: aiDataUrl, prompt: promptVal, seed: aiSeed, model, size });
    } catch (e) {
      placeholder.querySelector("div:last-child").textContent = "Error al generar. Inténtalo de nuevo.";
      toast("No se pudo conectar con la IA.", true);
    } finally {
      clearInterval(msgInterval); progress.hidden = true; btnGen.disabled = false;
    }
  });

  // Vectorizar post-generación
  document.getElementById("ai-vectorize").addEventListener("click", async () => {
    if (!aiDataUrl) return toast("Genera un decal primero", true);
    const k = Math.max(2, Math.min(24, parseInt(document.getElementById("ai-color-k").value) || 6));
    const btnVec = document.getElementById("ai-vectorize");
    btnVec.disabled = true; btnVec.textContent = "Vectorizando…";
    try {
      aiDataUrl = await quantizeColors(aiDataUrl, k);
      document.getElementById("ai-result-img").src = aiDataUrl;
      toast(`Paleta reducida a ${k} colores planos`);
    } finally {
      btnVec.disabled = false; btnVec.textContent = "🎨 Vectorizar";
    }
  });

  document.getElementById("ai-removebg").addEventListener("click", async () => {
    if (!aiDataUrl) return;
    const cleaned = await removeWhiteBg(aiDataUrl);
    if (cleaned === aiDataUrl) return toast("No había fondo blanco que quitar");
    aiDataUrl = cleaned;
    document.getElementById("ai-result-img").src = cleaned;
    toast("Fondo quitado");
  });

  document.getElementById("ai-taller").addEventListener("click", () => {
    if (!aiDataUrl) return;
    setWork(aiDataUrl, true);
    showView("logos");
    toast("Abierto en el Taller de logos");
  });

  document.getElementById("ai-save").addEventListener("click", async () => {
    if (!aiDataUrl) return;
    const name = prompt("Nombre del decal:", "decal_ai");
    if (!name) return;
    const { userLogos } = await store.get({ userLogos: [] });
    userLogos.push({ id: "u" + Date.now(), name: name.trim(), cat: "_mios", dataUrl: aiDataUrl, mime: "image/png" });
    await store.set({ userLogos });
    toast('"' + name.trim() + '" guardado en Mis logos');
  });

  document.getElementById("ai-tp").addEventListener("click", async () => {
    if (!aiDataUrl) return toast("Genera un decal primero", true);
    if (!IS_EXT) return toast("Solo disponible como extensión", true);
    const n = await TPC.enqueueInject({ dataUrl: aiDataUrl, mime: "image/png", filename: `decal_ai_${aiSeed}.png`, name: "decal AI" });
    const onTP = await TPC.focusTradingPaintsTab();
    toast(onTP ? `En cola (${n}) · añadido al formulario` : `Abriendo TP · ${n} en cola`);
  });

  document.getElementById("ai-dl").addEventListener("click", () => {
    if (!aiDataUrl) return;
    const a = document.createElement("a"); a.href = aiDataUrl; a.download = `decal_ai_${aiSeed}.png`; a.click();
  });

  // ---- Batch ×4 ----
  document.getElementById("ai-batch").addEventListener("click", async () => {
    const promptVal = document.getElementById("ai-prompt").value.trim();
    if (!promptVal) return toast("Escribe una descripción primero", true);
    const model  = document.getElementById("ai-model").value;
    const size   = document.getElementById("ai-size").value;
    const seeds  = Array.from({ length: 4 }, () => Math.floor(Math.random() * 9999999) + 1);
    const btnB   = document.getElementById("ai-batch");
    const grid   = document.getElementById("ai-batch-grid");
    btnB.disabled = true; btnB.textContent = "…";
    grid.hidden = false;
    grid.innerHTML = '<div class="ai-batch-loading"><div class="ai-spinner"></div><span>Generando 4 variaciones en paralelo…</span></div>';

    const results = await Promise.allSettled(seeds.map(s => generateOne(promptVal, model, size, s)));

    grid.innerHTML = "";
    results.forEach((r, i) => {
      const card = document.createElement("div"); card.className = "ai-batch-card";
      if (r.status === "fulfilled") {
        const img = document.createElement("img"); img.src = r.value; card.appendChild(img);
        const btn = document.createElement("button"); btn.className = "btn small primary ai-batch-select"; btn.textContent = "Usar esta";
        btn.addEventListener("click", () => {
          aiDataUrl = r.value; aiSeed = seeds[i];
          document.getElementById("ai-result-img").src = r.value;
          document.getElementById("ai-result-img").hidden = false;
          document.getElementById("ai-placeholder").style.display = "none";
          document.getElementById("ai-result-meta").textContent = `Semilla: ${seeds[i]}  ·  ${model}  ·  variación ${i + 1}`;
          document.getElementById("ai-result-meta").hidden = false;
          document.getElementById("ai-actions").hidden = false;
          grid.hidden = true;
          saveToHistory({ dataUrl: r.value, prompt: promptVal, seed: seeds[i], model, size });
          toast("Variación seleccionada");
        });
        card.appendChild(btn);
      } else {
        card.innerHTML = '<div class="ai-batch-error">Error</div>';
      }
      grid.appendChild(card);
    });
    btnB.disabled = false; btnB.textContent = "⚡ ×4";
  });

  // ---- Historial ----
  document.getElementById("ai-history-clear").addEventListener("click", async () => {
    await store.set({ aiHistory: [] });
    document.getElementById("ai-history").hidden = true;
    document.getElementById("ai-history-strip").innerHTML = "";
    toast("Historial borrado");
  });
  loadHistory();

  // ---- Car preview ----
  let decalPos = { x: 180, y: 60 };
  let dragOffset = null;

  function applyDecalTransform() {
    const d = document.getElementById("ai-car-decal");
    const scale = parseInt(document.getElementById("ai-car-scale").value) / 100;
    const wrap = document.getElementById("ai-car-wrap");
    const wrapW = wrap.clientWidth || 620;
    const sz = wrapW * scale;
    d.style.width  = sz + "px";
    d.style.height = sz + "px";
    d.style.left   = decalPos.x + "px";
    d.style.top    = decalPos.y + "px";
  }

  document.getElementById("ai-car-preview-btn").addEventListener("click", () => {
    if (!aiDataUrl) return toast("Genera un decal primero", true);
    const preview = document.getElementById("ai-car-preview");
    const decal   = document.getElementById("ai-car-decal");
    preview.hidden = false;
    decal.src = aiDataUrl; decal.hidden = false;
    const wrap = document.getElementById("ai-car-wrap");
    decalPos = { x: (wrap.clientWidth || 620) * 0.3, y: (wrap.clientHeight || 220) * 0.18 };
    applyDecalTransform();
    preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("ai-car-scale").addEventListener("input", applyDecalTransform);
  document.getElementById("ai-car-close").addEventListener("click", () => {
    document.getElementById("ai-car-preview").hidden = true;
  });

  const carWrap = document.getElementById("ai-car-wrap");
  carWrap.addEventListener("mousedown", e => {
    const d = document.getElementById("ai-car-decal");
    if (!d.contains(e.target) && e.target !== d) return;
    e.preventDefault();
    const rect = d.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
  });
  document.addEventListener("mousemove", e => {
    if (!dragOffset) return;
    const wRect = carWrap.getBoundingClientRect();
    decalPos = { x: e.clientX - wRect.left - dragOffset.x - parseInt(document.getElementById("ai-car-decal").style.width) / 2,
                 y: e.clientY - wRect.top  - dragOffset.y - parseInt(document.getElementById("ai-car-decal").style.height) / 2 };
    applyDecalTransform();
  });
  document.addEventListener("mouseup", () => { dragOffset = null; });

  document.getElementById("ai-car-capture").addEventListener("click", async () => {
    const wrap = document.getElementById("ai-car-wrap");
    const wW = wrap.clientWidth, wH = wrap.clientHeight;
    const svgEl = document.getElementById("car-svg");
    const svgStr = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml" });
    const svgBlobUrl = URL.createObjectURL(svgBlob);

    const c = document.createElement("canvas"); c.width = wW; c.height = wH;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, wW, wH);

    const carImg = await loadImage(svgBlobUrl);
    ctx.drawImage(carImg, 0, 0, wW, wH);
    URL.revokeObjectURL(svgBlobUrl);

    const decalEl = document.getElementById("ai-car-decal");
    const decalImg = await loadImage(aiDataUrl);
    const dW = parseInt(decalEl.style.width), dH = parseInt(decalEl.style.height);
    ctx.drawImage(decalImg, decalPos.x, decalPos.y, dW, dH);

    const a = document.createElement("a");
    a.href = c.toDataURL("image/png"); a.download = `preview_coche_${aiSeed}.png`; a.click();
    toast("Preview capturado");
  });

  document.getElementById("ai-export-svg").addEventListener("click", async () => {
    if (!aiDataUrl) return toast("Genera un decal primero", true);
    const btn = document.getElementById("ai-export-svg");
    const k = Math.max(2, Math.min(24, parseInt(document.getElementById("ai-color-k").value) || 6));
    btn.disabled = true; btn.textContent = "Trazando paths…";
    try {
      const svgStr = await imageToSVG(aiDataUrl, k);
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `decal_ai_${aiSeed}.svg`; a.click();
      URL.revokeObjectURL(url);
      toast("SVG exportado — ábrelo en Illustrator o Inkscape");
    } catch (e) {
      toast("Error al trazar el SVG", true);
    } finally {
      btn.disabled = false; btn.textContent = "⬡ Exportar SVG";
    }
  });
})();

// ============================================================
// DONACIÓN
// ============================================================
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

// ============================================================
// init
// ============================================================
loadPalettes();
loadBoard();
consumeIncoming();
if (location.hash === "#logos") showView("logos");

if (IS_EXT && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.palettes) { palettes = changes.palettes.newValue || []; renderPaletteSelect(); }
    if (changes.board) { board = changes.board.newValue || []; renderBoard(); }
    if (changes.workshopIncoming && changes.workshopIncoming.newValue) consumeIncoming();
  });
}
