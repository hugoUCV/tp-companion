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
