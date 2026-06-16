// TP Companion — content script para tradingpaints.com
// 1) Registra los colores que usas (inputs de color y campos hex) en un historial.
// 2) Widget flotante con los últimos colores + cuentagotas (EyeDropper).
// 3) Recibe logos desde el popup y los mete en el input de subida de la página.

(() => {
  const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
  // Campo hex del color picker del Paint Builder (React/MUI). Verificado contra
  // el DOM real: <input placeholder="#------" type="text" value="#ffffff">.
  const PB_HEX_SEL = 'input[placeholder="#------"]';
  let captureEnabled = true;

  function normalizeHex(raw) {
    if (typeof raw !== "string") return null;
    let v = raw.trim().replace(/^#/, "").toLowerCase();
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return null;
    if (v.length === 3) v = v.split("").map((c) => c + c).join("");
    return "#" + v;
  }

  function recordColor(raw, source) {
    const hex = normalizeHex(raw);
    if (!hex) return;
    chrome.storage.local.get({ colorHistory: [] }, ({ colorHistory }) => {
      const rest = colorHistory.filter((c) => c.hex !== hex);
      rest.unshift({ hex, ts: Date.now(), source });
      chrome.storage.local.set({ colorHistory: rest.slice(0, 300) });
    });
  }

  // --- Captura de colores -------------------------------------------------
  // 'change' = valor confirmado (vale para <input type=color> y campos hex de texto)
  document.addEventListener(
    "change",
    (e) => {
      if (!captureEnabled) return;
      const t = e.target;
      if (!t || typeof t.value !== "string") return;
      if (t.type === "color") recordColor(t.value, "picker");
      else if (HEX_RE.test(t.value.trim())) recordColor(t.value, "campo");
    },
    true
  );

  // Arrastres del picker nativo: registrar solo cuando el usuario se asienta
  let dragTimer = null;
  document.addEventListener(
    "input",
    (e) => {
      if (!captureEnabled) return;
      const t = e.target;
      if (t && t.type === "color") {
        clearTimeout(dragTimer);
        dragTimer = setTimeout(() => recordColor(t.value, "picker"), 900);
      }
    },
    true
  );

  // Paint Builder: el picker es un componente React, así que los cambios de
  // color NO disparan eventos DOM (React escribe el value por propiedad). Por
  // eso sondeamos los campos hex (hay uno por capa; solo el activo trae valor)
  // y registramos cualquier color que lleve estable ≥1 tick (~350 ms), para no
  // guardar el ruido del arrastre. `pbCommitted` evita repetir mientras el
  // color sigue a la vista, y se limpia al desaparecer para poder recapturar.
  let pbLastSet = new Set();
  const pbCommitted = new Set();
  setInterval(() => {
    if (!captureEnabled) return;
    const current = new Set();
    document.querySelectorAll(PB_HEX_SEL).forEach((f) => {
      if (f.offsetParent === null) return;
      const hex = normalizeHex(f.value);
      if (hex) current.add(hex);
    });
    for (const h of [...pbCommitted]) if (!current.has(h)) pbCommitted.delete(h);
    for (const h of current) {
      if (pbLastSet.has(h) && !pbCommitted.has(h)) {
        recordColor(h, "paint builder");
        pbCommitted.add(h);
      }
    }
    pbLastSet = current;
  }, 350);

  // --- Widget flotante ----------------------------------------------------
  let shadowRoot = null;

  function buildWidget() {
    if (document.getElementById("tp-companion-widget")) return;
    const host = document.createElement("div");
    host.id = "tp-companion-widget";
    host.style.cssText =
      "position:fixed;bottom:18px;right:18px;z-index:2147483646;";
    shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: system-ui, sans-serif; }
        .fab {
          width: 44px; height: 44px; border-radius: 50%; border: none;
          background: #14181f; color: #fff; font-size: 20px; cursor: pointer;
          box-shadow: 0 2px 10px rgba(0,0,0,.45); display: grid; place-items: center;
        }
        .fab:hover { background: #1d242f; }
        .panel {
          display: none; position: absolute; bottom: 54px; right: 0; width: 248px;
          background: #14181f; color: #dbe2ee; border-radius: 12px; padding: 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,.55); border: 1px solid #2a3343;
        }
        .panel.open { display: block; }
        .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .head b { font-size: 12px; letter-spacing: .4px; }
        .tools button {
          background: #222b39; border: 1px solid #344053; color: #dbe2ee;
          border-radius: 6px; font-size: 11px; padding: 3px 7px; cursor: pointer;
        }
        .tools button:hover { background: #2c3748; }
        .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
        .sw {
          aspect-ratio: 1; border-radius: 6px; cursor: pointer;
          border: 1px solid rgba(255,255,255,.14);
        }
        .sw:hover { transform: scale(1.12); }
        .empty { font-size: 11px; color: #7a8699; margin: 4px 0; }
        .hint { font-size: 10px; color: #5d6878; margin-top: 8px; }
        .pb-section { margin-top: 10px; padding-top: 8px; border-top: 1px solid #2a3343; }
        .pb-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .pb-label { font-size: 10px; color: #6b768c; font-weight: 700; letter-spacing: .6px; }
        .pb-active { font-size: 10px; color: #e8443a; font-weight: 700; font-family: ui-monospace, monospace; }
        .pb-tools { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; }
        .pb-tools button { font-size: 10px; padding: 5px 4px; }
        .toast {
          position: absolute; bottom: 100%; right: 0; margin-bottom: 6px;
          background: #2ea043; color: #fff; font-size: 11px; padding: 4px 10px;
          border-radius: 6px; opacity: 0; transition: opacity .2s; pointer-events: none;
          white-space: nowrap;
        }
        .toast.show { opacity: 1; }
      </style>
      <div class="toast" id="toast"></div>
      <div class="panel" id="panel">
        <div class="head"><b>TP COMPANION</b>
          <span class="tools"><button id="eyed" title="Cuentagotas">🖉 Capturar</button></span>
        </div>
        <div class="grid" id="grid"></div>
        <div class="pb-section">
          <div class="pb-head">
            <span class="pb-label">PAINT BUILDER</span>
            <span class="pb-active" id="pb-active">—</span>
          </div>
          <div class="pb-tools">
            <button id="pb-copy" title="Copia los 6 colores de la livery actual">📋 Copiar livery</button>
            <button id="pb-paste" title="Aplica los 6 colores guardados">📌 Pegar</button>
            <button id="pb-swap" title="Intercambia el color activo con el siguiente">🔁 Swap</button>
          </div>
        </div>
        <div class="hint">Click en un color = copiar hex · Los colores que uses en la web se guardan solos</div>
      </div>
      <button class="fab" id="fab" title="TP Companion">🎨</button>
    `;
    document.documentElement.appendChild(host);

    const panel = shadowRoot.getElementById("panel");
    shadowRoot.getElementById("fab").addEventListener("click", () => {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) refreshSwatches();
    });

    const eyed = shadowRoot.getElementById("eyed");
    if (!window.EyeDropper) eyed.style.display = "none";
    eyed.addEventListener("click", async () => {
      try {
        const r = await new EyeDropper().open();
        recordColor(r.sRGBHex, "cuentagotas");
        copyHex(r.sRGBHex.toLowerCase());
      } catch (_) {
        /* cancelado */
      }
    });

    // ---- Paint Builder tools (copy/paste/swap de capas) ----
    shadowRoot.getElementById("pb-copy").addEventListener("click", () => {
      const vals = pbHexFields().map((i) => normalizeHex(i.value)).filter(Boolean);
      if (!vals.length) return toast("No veo el Paint Builder abierto");
      chrome.storage.local.set({ clipboardLayer: { hexes: vals, ts: Date.now() } });
      toast(`Copiado livery (${vals.length})`);
    });
    shadowRoot.getElementById("pb-paste").addEventListener("click", () => {
      chrome.storage.local.get({ clipboardLayer: null }, ({ clipboardLayer }) => {
        if (!clipboardLayer || !clipboardLayer.hexes || !clipboardLayer.hexes.length) return toast("Nada copiado todavía");
        const inputs = pbHexFields();
        if (!inputs.length) return toast("No veo el Paint Builder abierto");
        const n = Math.min(inputs.length, clipboardLayer.hexes.length);
        for (let i = 0; i < n; i++) setReactInputValue(inputs[i], clipboardLayer.hexes[i]);
        toast(`Pegados ${n} colores`);
      });
    });
    shadowRoot.getElementById("pb-swap").addEventListener("click", () => {
      const inputs = pbHexFields();
      const i = pbActiveIdx >= 0 ? pbActiveIdx : 0;
      const j = (i + 1) % Math.max(1, inputs.length);
      if (i === j || !inputs[i] || !inputs[j]) return toast("Necesito dos capas visibles", true);
      const a = inputs[i].value, b = inputs[j].value;
      setReactInputValue(inputs[i], b);
      setReactInputValue(inputs[j], a);
      toast(`Swap capas ${i + 1} ↔ ${j + 1}`);
    });
  }

  // setter React-aware: dispara el evento "input" que React escucha.
  const _nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  function setReactInputValue(input, value) {
    _nativeInputSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function pbHexFields() {
    return [...document.querySelectorAll(PB_HEX_SEL)].filter((i) => i.offsetParent !== null);
  }
  // detectar capa activa (input enfocado o último tocado)
  let pbActiveIdx = -1;
  function updatePbActive(idx) {
    pbActiveIdx = idx;
    const el = shadowRoot && shadowRoot.getElementById("pb-active");
    if (!el) return;
    el.textContent = idx >= 0 ? `Capa ${idx + 1}` : "—";
  }
  document.addEventListener("focusin", (e) => {
    if (!e.target || !e.target.matches || !e.target.matches(PB_HEX_SEL)) return;
    const all = pbHexFields();
    updatePbActive(all.indexOf(e.target));
  }, true);

  function toast(text) {
    const t = shadowRoot && shadowRoot.getElementById("toast");
    if (!t) return;
    t.textContent = text;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1200);
  }

  function copyHex(hex) {
    navigator.clipboard.writeText(hex).then(
      () => toast(hex + " copiado"),
      () => toast("No se pudo copiar")
    );
  }

  function refreshSwatches() {
    chrome.storage.local.get({ colorHistory: [] }, ({ colorHistory }) => {
      const grid = shadowRoot && shadowRoot.getElementById("grid");
      if (!grid) return;
      grid.innerHTML = "";
      if (!colorHistory.length) {
        grid.innerHTML = '<div class="empty">Aún no hay colores</div>';
        return;
      }
      colorHistory.slice(0, 18).forEach((c) => {
        const d = document.createElement("div");
        d.className = "sw";
        d.style.background = c.hex;
        d.title = c.hex;
        d.addEventListener("click", () => copyHex(c.hex));
        grid.appendChild(d);
      });
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.colorHistory) refreshSwatches();
    if (changes.settings) applySettings(changes.settings.newValue || {});
  });

  function applySettings(s) {
    captureEnabled = s.captureEnabled !== false;
    const host = document.getElementById("tp-companion-widget");
    if (host) host.style.display = s.widgetEnabled === false ? "none" : "";
  }

  chrome.storage.local.get({ settings: {} }, ({ settings }) => {
    buildWidget();
    applySettings(settings);
  });

  // --- Inyección de logos en inputs de subida ------------------------------
  function findFileInput() {
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    if (!inputs.length) return null;
    // preferir un input visible; si no, el primero
    return inputs.find((i) => i.offsetParent !== null) || inputs[0];
  }

  async function injectIntoInput(input, { dataUrl, mime, filename }) {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: mime || blob.type });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "ping") {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "injectFile") {
      (async () => {
        try {
          const input = findFileInput();
          if (!input) {
            sendResponse({ ok: false, reason: "no-input" });
            return;
          }
          await injectIntoInput(input, msg);
          toast("Logo enviado al formulario");
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, reason: String(e) });
        }
      })();
      return true;
    }
  });

  // --- Cola pendiente: archivos elegidos en el popup/estudio sin formulario
  // a la vista. Se inyectan uno a uno cuando aparezca un input de subida.
  const PENDING_TTL = 10 * 60 * 1000;
  let hasPending = false;
  let pendingBusy = false;

  function pruneExpired(queue) {
    const now = Date.now();
    return queue.filter((it) => now - it.ts <= PENDING_TTL);
  }

  function refreshQueueBadge(n) {
    if (!shadowRoot) return;
    const fab = shadowRoot.getElementById("fab");
    if (!fab) return;
    let bg = fab.querySelector(".tp-q");
    if (!n) { if (bg) bg.remove(); return; }
    if (!bg) {
      bg = document.createElement("div");
      bg.className = "tp-q";
      bg.style.cssText = "position:absolute;top:-4px;right:-4px;background:#e8443a;color:#fff;font-size:10px;font-weight:700;border-radius:50%;width:18px;height:18px;display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.4);";
      fab.style.position = "relative";
      fab.appendChild(bg);
    }
    bg.textContent = n;
  }

  function tryPending() {
    if (pendingBusy) return;
    chrome.storage.local.get({ pendingInjectQueue: [], pendingInject: null }, (st) => {
      let queue = pruneExpired(st.pendingInjectQueue || []);
      // compat: migrar pendingInject heredado a la cola
      if (st.pendingInject) {
        if (Date.now() - st.pendingInject.ts <= PENDING_TTL) queue.push(st.pendingInject);
        chrome.storage.local.remove("pendingInject");
      }
      if (!queue.length) {
        chrome.storage.local.set({ pendingInjectQueue: [] });
        hasPending = false;
        refreshQueueBadge(0);
        return;
      }
      hasPending = true;
      refreshQueueBadge(queue.length);
      const input = findFileInput();
      if (!input) {
        // dejar la cola tal cual; cuando el DOM cambie volvemos a intentarlo
        chrome.storage.local.set({ pendingInjectQueue: queue });
        return;
      }
      const item = queue[0];
      pendingBusy = true;
      injectIntoInput(input, item)
        .then(() => {
          const rest = queue.slice(1);
          chrome.storage.local.set({ pendingInjectQueue: rest }, () => {
            toast(`"${item.name || item.filename}" añadido`);
            refreshQueueBadge(rest.length);
            pendingBusy = false;
            if (rest.length) setTimeout(tryPending, 800);
          });
        })
        .catch(() => { pendingBusy = false; });
    });
  }

  chrome.storage.local.get({ pendingInjectQueue: [], pendingInject: null }, ({ pendingInjectQueue, pendingInject }) => {
    hasPending = (pendingInjectQueue && pendingInjectQueue.length > 0) || !!pendingInject;
    refreshQueueBadge((pendingInjectQueue || []).length);
    if (hasPending) tryPending();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.pendingInjectQueue) {
      const q = changes.pendingInjectQueue.newValue || [];
      hasPending = q.length > 0;
      refreshQueueBadge(q.length);
      if (hasPending) tryPending();
    }
    if (changes.pendingInject) {
      hasPending = hasPending || !!changes.pendingInject.newValue;
      if (changes.pendingInject.newValue) tryPending();
    }
  });

  let moTimer = null;
  new MutationObserver(() => {
    if (!hasPending) return;
    clearTimeout(moTimer);
    moTimer = setTimeout(tryPending, 600);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
