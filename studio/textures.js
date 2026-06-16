// TP Companion — generador de texturas modular (sin costura)
// Cada patrón declara sus colores, controles y presets, y se dibuja sobre un
// LIENZO COMPLETO (no celdas pequeñas repetidas): los orgánicos se generan
// toroidalmente (las formas que cruzan un borde reaparecen en el opuesto) y los
// geométricos son periódicos con periodo que divide el tile. Resultado: tiles
// grandes, irregulares y SIN costura.

(function () {
  const { hexToRgb, rgbToHex, store, toast, IS_EXT, safeName } = TPC;
  const $ = (s) => document.querySelector(s);

  // ---------------- helpers ----------------
  function rng32(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex), t = amt < 0 ? 0 : 255, k = Math.abs(amt);
    return rgbToHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
  }
  // dibuja fn(x,y) en las 9 posiciones toroidales que tocan el lienzo (con culling)
  function torusN(ctx, N, cx, cy, rad, fn) {
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const x = cx + dx, y = cy + dy;
      if (x + rad < 0 || x - rad > N || y + rad < 0 || y - rad > N) continue;
      fn(x, y);
    }
  }
  function blobOffsets(rng, r, pts, jit) {
    const rot = rng() * 6.2832, o = [];
    for (let i = 0; i < pts; i++) {
      const a = rot + (i / pts) * 6.2832, rr = r * (1 - jit + rng() * jit * 2);
      o.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    return o;
  }
  function fillPoly(ctx, cx, cy, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(cx + p[0], cy + p[1]) : ctx.moveTo(cx + p[0], cy + p[1])));
    ctx.closePath(); ctx.fill();
  }
  // polígono suavizado (curvas por puntos medios) → manchas redonditas
  function fillBlob(ctx, cx, cy, pts) {
    const n = pts.length;
    ctx.beginPath();
    ctx.moveTo(cx + (pts[n - 1][0] + pts[0][0]) / 2, cy + (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) {
      const c = pts[i], nx = pts[(i + 1) % n];
      ctx.quadraticCurveTo(cx + c[0], cy + c[1], cx + (c[0] + nx[0]) / 2, cy + (c[1] + nx[1]) / 2);
    }
    ctx.closePath(); ctx.fill();
  }
  // celda por píxel para patrones matemáticos; se reescala al tile sin costura
  function pixelCell(cw, c1, c2, fn) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = cw;
    const x = cv.getContext("2d"), im = x.createImageData(cw, cw), a = hexToRgb(c1), b = hexToRgb(c2);
    for (let yy = 0; yy < cw; yy++) for (let xx = 0; xx < cw; xx++) {
      const t = fn(xx, yy, cw), i = (yy * cw + xx) * 4;
      im.data[i] = a[0] + (b[0] - a[0]) * t;
      im.data[i + 1] = a[1] + (b[1] - a[1]) * t;
      im.data[i + 2] = a[2] + (b[2] - a[2]) * t;
      im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return cv;
  }
  // tila una celda periódica `reps`×`reps` cubriendo N EXACTAMENTE (sin resto)
  function tileCell(ctx, N, cell, reps) {
    const period = N / reps;
    for (let i = 0; i < reps; i++) for (let j = 0; j < reps; j++)
      ctx.drawImage(cell, Math.round(i * period), Math.round(j * period), Math.ceil(period) + 1, Math.ceil(period) + 1);
  }
  // tila celda rectangular cols×rows cubriendo N×N exactamente (sin costuras por offset)
  function tileCellRect(ctx, N, cell, cols, rows) {
    const px = N / cols, py = N / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
      ctx.drawImage(cell, Math.round(i * px), Math.round(j * py), Math.ceil(px) + 1, Math.ceil(py) + 1);
  }
  // divisor de N más cercano a `target` (para que cell × reps == N exacto, sin shift sub-pixel).
  // Usado por hex/triángulos/plumas/snake/ladrillo donde el tile pixel-perfecto es crítico.
  function snapDivisor(N, target) {
    target = Math.max(1, Math.min(N, target | 0));
    const divisors = [];
    for (let d = 1; d * d <= N; d++) if (N % d === 0) { divisors.push(d); if (d !== N / d) divisors.push(N / d); }
    divisors.sort((a, b) => a - b);
    let best = divisors[0];
    for (const d of divisors) if (Math.abs(d - target) < Math.abs(best - target)) best = d;
    return best;
  }
  // celda hex tileable: dibuja 2 hexágonos en una celda y la tilea con tileCellRect.
  // Forzamos cellW=round(N/cols) y cellH=round(N/rows) → tile pixel-perfecto sin sub-px shift.
  // El aspect del hex puede quedar levemente alterado pero NO genera costura.
  function hexTile(ctx, N, reps, drawHexCell) {
    // forzamos cols y rows a divisores exactos de N → tile pixel-perfecto sin sub-shift
    const cols = snapDivisor(N, Math.max(1, Math.round(reps)));
    const rows = snapDivisor(N, Math.max(1, Math.round(reps / Math.sqrt(3))));
    const cellW = N / cols, cellH = N / rows;
    const cell = document.createElement("canvas");
    cell.width = cellW; cell.height = cellH;
    const cx = cell.getContext("2d");
    const r = cellW / Math.sqrt(3);
    drawHexCell(cx, cellW / 2, cellH * 0.25, r);
    drawHexCell(cx, 0,         cellH * 0.75, r);
    drawHexCell(cx, cellW,     cellH * 0.75, r);
    tileCellRect(ctx, N, cell, cols, rows);
  }

  // ---------------- registro de patrones ----------------
  // draw(ctx, N, c {colores}, o {opciones}, rng)
  const PATTERNS = [
    {
      id: "carbon-twill", name: "Carbono · sarga", tags: "carbono fibra",
      colors: [{ id: "c1", label: "Urdimbre", def: "#16161a" }, { id: "c2", label: "Trama", def: "#2c2c33" }],
      controls: [{ id: "tow", label: "Hilos", min: 3, max: 300, def: 8 }, { id: "sheen", label: "Brillo", min: 0, max: 100, def: 60 }],
      draw(ctx, N, c, o) {
        const u = N / (o.tow * 2), k = o.sheen / 100;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let y = 0; y < N; y += u * 2) for (let x = 0; x < N; x += u * 2) { ctx.fillRect(x, y, u, u); ctx.fillRect(x + u, y + u, u, u); }
        // brillo POR UNIDAD (periódico → sin costura), no de lienzo completo
        if (k > 0) for (let y = 0; y < N; y += u * 2) for (let x = 0; x < N; x += u * 2) {
          const g = ctx.createLinearGradient(x, y, x + u * 2, y + u * 2);
          g.addColorStop(0, `rgba(255,255,255,${0.13 * k})`);
          g.addColorStop(.5, `rgba(0,0,0,${0.11 * k})`);
          g.addColorStop(1, `rgba(255,255,255,${0.13 * k})`);
          ctx.fillStyle = g; ctx.fillRect(x, y, u * 2, u * 2);
        }
      },
    },
    {
      id: "carbon-plain", name: "Carbono · tafetán", tags: "carbono fibra",
      colors: [{ id: "c1", label: "Base", def: "#16161a" }, { id: "c2", label: "Hilo", def: "#2c2c33" }],
      controls: [{ id: "tow", label: "Hilos", min: 3, max: 300, def: 9 }, { id: "sheen", label: "Brillo", min: 0, max: 100, def: 50 }],
      draw(ctx, N, c, o) {
        const u = N / (o.tow * 2), r = u * 0.42;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const rr = (col, x, y) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, u * 0.86, u * 0.86, r) : ctx.rect(x, y, u * 0.86, u * 0.86); ctx.fill(); };
        const hi = `rgba(255,255,255,${0.12 * (o.sheen / 100)})`;
        for (let y = 0; y < N; y += u * 2) for (let x = 0; x < N; x += u * 2) {
          rr(c.c2, x + u * 0.07, y + u * 0.07); rr(c.c2, x + u + u * 0.07, y + u + u * 0.07);
          rr(hi, x + u + u * 0.07, y + u * 0.07); rr(hi, x + u * 0.07, y + u + u * 0.07);
        }
      },
    },
    {
      id: "forged", name: "Carbono forjado", tags: "carbono fibra marmol",
      colors: [{ id: "c1", label: "Base", def: "#1b1b1f" }, { id: "c2", label: "Escamas", def: "#54555c" }],
      controls: [{ id: "size", label: "Escama", min: 3, max: 300, def: 11 }, { id: "density", label: "Densidad", min: 5, max: 600, def: 70 }, { id: "sheen", label: "Brillo", min: 0, max: 100, def: 45 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        const a = hexToRgb(c.c1), b = hexToRgb(c.c2);
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const r = N * (o.size / 600);
        const count = Math.round(((N * N) / (r * r)) * (o.density / 100) * 0.5);
        for (let k = 0; k < count; k++) {
          const cx = rng() * N, cy = rng() * N, rr = r * (0.6 + rng() * 0.9);
          const pts = blobOffsets(rng, rr, 4 + ((rng() * 3) | 0), 0.6);
          const sh = (rng() - 0.45) * 210 * (o.sheen / 100), col = mix(a, b, rng());
          const fill = rgbToHex(col[0] + sh, col[1] + sh, col[2] + sh);
          torusN(ctx, N, cx, cy, rr * 1.6, (x, y) => { ctx.fillStyle = fill; fillPoly(ctx, x, y, pts); });
        }
      },
    },
    {
      id: "stripe-v", name: "Rayas verticales", tags: "rayas lineas",
      colors: [{ id: "c1", label: "Fondo", def: "#101216" }, { id: "c2", label: "Raya", def: "#e8443a" }],
      controls: [{ id: "reps", label: "Rayas", min: 1, max: 300, def: 6 }, { id: "width", label: "Ancho %", min: 5, max: 95, def: 50 }],
      draw(ctx, N, c, o) {
        // snapDivisor para que las rayas tilen pixel-perfecto sin gap residual
        const reps = snapDivisor(N, Math.max(1, o.reps | 0));
        const period = N / reps, w = period * (o.width / 100);
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let i = 0; i < reps; i++) ctx.fillRect(Math.round(i * period), 0, Math.round(w), N);
      },
    },
    {
      id: "stripe-h", name: "Rayas horizontales", tags: "rayas lineas",
      colors: [{ id: "c1", label: "Fondo", def: "#101216" }, { id: "c2", label: "Raya", def: "#e8443a" }],
      controls: [{ id: "reps", label: "Rayas", min: 1, max: 300, def: 6 }, { id: "width", label: "Ancho %", min: 5, max: 95, def: 50 }],
      draw(ctx, N, c, o) {
        const reps = snapDivisor(N, Math.max(1, o.reps | 0));
        const period = N / reps, w = period * (o.width / 100);
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let i = 0; i < reps; i++) ctx.fillRect(0, Math.round(i * period), N, Math.round(w));
      },
    },
    {
      id: "stripe-d", name: "Rayas diagonales", tags: "rayas lineas diagonal",
      colors: [{ id: "c1", label: "Fondo", def: "#101216" }, { id: "c2", label: "Raya", def: "#f5c543" }],
      controls: [{ id: "reps", label: "Rayas", min: 2, max: 300, def: 8 }, { id: "width", label: "Ancho %", min: 5, max: 95, def: 50 }],
      draw(ctx, N, c, o) {
        const cw = Math.max(8, Math.round(N / o.reps)), w = o.width / 100;
        tileCell(ctx, N, pixelCell(cw, c.c1, c.c2, (x, y, W) => ((x + y) % W) < W * w ? 1 : 0), o.reps);
      },
    },
    {
      id: "chevron", name: "Chevron (espiga)", tags: "chevron espiga zigzag",
      colors: [{ id: "c1", label: "Fondo", def: "#101216" }, { id: "c2", label: "Raya", def: "#2a9df4" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 2, max: 300, def: 6 }, { id: "width", label: "Ancho %", min: 5, max: 95, def: 50 }],
      draw(ctx, N, c, o) {
        const cw = Math.max(10, Math.round(N / o.reps)), w = o.width / 100;
        tileCell(ctx, N, pixelCell(cw, c.c1, c.c2, (x, y, W) => { const xm = x < W / 2 ? x : W - x; return ((xm * 2 + y) % W) < W * w ? 1 : 0; }), o.reps);
      },
    },
    {
      id: "grid", name: "Rejilla", tags: "rejilla cuadricula grid",
      colors: [{ id: "c1", label: "Fondo", def: "#14181f" }, { id: "c2", label: "Línea", def: "#3a4458" }],
      controls: [{ id: "reps", label: "Celdas", min: 2, max: 400, def: 10 }, { id: "thickness", label: "Grosor %", min: 2, max: 60, def: 10 }],
      draw(ctx, N, c, o) {
        const period = N / o.reps;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.strokeStyle = c.c2; ctx.lineWidth = Math.max(1, period * (o.thickness / 100));
        for (let i = 0; i <= o.reps; i++) { const p = i * period; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, N); ctx.moveTo(0, p); ctx.lineTo(N, p); ctx.stroke(); }
      },
    },
    {
      id: "checker", name: "Damero", tags: "damero ajedrez checker",
      colors: [{ id: "c1", label: "Color A", def: "#101216" }, { id: "c2", label: "Color B", def: "#eef0ef" }],
      controls: [{ id: "reps", label: "Cuadros", min: 1, max: 300, def: 4 }],
      draw(ctx, N, c, o) {
        const cw = Math.max(8, Math.round(N / o.reps));
        tileCell(ctx, N, pixelCell(cw, c.c1, c.c2, (x, y, W) => (Math.floor(x / (W / 2)) + Math.floor(y / (W / 2))) % 2 ? 1 : 0), o.reps);
      },
    },
    {
      id: "diamond", name: "Rombos / argyle", tags: "rombos argyle diamante",
      colors: [{ id: "c1", label: "Color A", def: "#14181f" }, { id: "c2", label: "Color B", def: "#9b1822" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 1, max: 300, def: 5 }],
      draw(ctx, N, c, o) {
        const cw = Math.max(10, Math.round(N / o.reps));
        tileCell(ctx, N, pixelCell(cw, c.c1, c.c2, (x, y, W) => { const a = ((x + y) % W) < W / 2, b = ((x - y + W * 8) % W) < W / 2; return a !== b ? 1 : 0; }), o.reps);
      },
    },
    {
      id: "dots", name: "Lunares", tags: "lunares puntos topos dots",
      colors: [{ id: "c1", label: "Fondo", def: "#101216" }, { id: "c2", label: "Punto", def: "#eef0ef" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 2, max: 300, def: 8 }, { id: "size", label: "Tamaño %", min: 5, max: 90, def: 30 }],
      draw(ctx, N, c, o) {
        const period = N / o.reps, r = period * (o.size / 100);
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let gy = 0; gy < o.reps; gy++) for (let gx = 0; gx < o.reps; gx++) {
          const cx = (gx + 0.5) * period, cy = (gy + 0.5) * period;
          torusN(ctx, N, cx, cy, r, (x, y) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); });
        }
      },
    },
    {
      id: "diamond-plate", name: "Chapa lagrimada", tags: "metal chapa lagrimada diamond plate motorsport",
      colors: [{ id: "c1", label: "Metal", def: "#3a3e44" }, { id: "c2", label: "Realce", def: "#9aa1aa" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 2, max: 300, def: 6 }, { id: "depth", label: "Relieve %", min: 20, max: 100, def: 70 }],
      draw(ctx, N, c, o) {
        const period = N / o.reps;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N); // base plana (un degradado vertical dejaría costura)
        const bw = period * 0.5, bh = period * 0.16, k = o.depth / 100;
        const bar = (x, y, ang) => torusN(ctx, N, x, y, period, (px, py) => {
          ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
          ctx.fillStyle = shade(c.c1, -0.18 * k);
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2) : ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${0.5 * k})`;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-bw / 2, -bh / 2, bw, bh * 0.5, bh / 3) : ctx.rect(-bw / 2, -bh / 2, bw, bh * 0.5); ctx.fill();
          ctx.restore();
        });
        for (let gy = 0; gy < o.reps; gy++) for (let gx = 0; gx < o.reps; gx++) {
          const cx = (gx + 0.5) * period, cy = (gy + 0.5) * period, ang = (gx + gy) % 2 ? 0.7 : -0.7;
          bar(cx, cy, ang);
        }
      },
    },
    {
      id: "tire", name: "Dibujo de neumático", tags: "neumatico tire tread taco motorsport",
      colors: [{ id: "c1", label: "Goma", def: "#15151a" }, { id: "c2", label: "Taco", def: "#2c2c33" }],
      controls: [{ id: "reps", label: "Tacos", min: 2, max: 200, def: 6 }, { id: "round", label: "Redondeo %", min: 0, max: 50, def: 25 }],
      draw(ctx, N, c, o) {
        const period = N / o.reps, lw = period * 0.7, lh = period * 0.7, r = lw * (o.round / 100);
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let gy = 0; gy < o.reps; gy++) for (let gx = 0; gx < o.reps; gx++) {
          const off = gy % 2 ? period / 2 : 0;
          const cx = (gx + 0.5) * period + off, cy = (gy + 0.5) * period;
          torusN(ctx, N, cx, cy, period, (x, y) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - lw / 2, y - lh / 2, lw, lh, r) : ctx.rect(x - lw / 2, y - lh / 2, lw, lh); ctx.fill(); });
        }
      },
    },
    {
      id: "camo", name: "Camuflaje", tags: "camuflaje camo woodland militar",
      colors: [
        { id: "c1", label: "Base", def: "#4a5333" }, { id: "c2", label: "Tono 2", def: "#6b7544" },
        { id: "c3", label: "Tono 3", def: "#2f3526" }, { id: "c4", label: "Tono 4", def: "#23211c" },
      ],
      controls: [
        { id: "scale", label: "Tamaño mancha", min: 4, max: 400, def: 28 },
        { id: "density", label: "Densidad", min: 10, max: 600, def: 70 },
        { id: "round", label: "Redondez", min: 0, max: 100, def: 75 },
        { id: "irregular", label: "Irregularidad", min: 10, max: 90, def: 45 },
      ],
      organic: true,
      presets: [
        { name: "Woodland", colors: { c1: "#4a5333", c2: "#6b7544", c3: "#2f3526", c4: "#23211c" } },
        { name: "Desierto", colors: { c1: "#c2a878", c2: "#9c875a", c3: "#d8c79e", c4: "#6f5b3e" } },
        { name: "Urbano", colors: { c1: "#9aa0a6", c2: "#c8ccd0", c3: "#5b626b", c4: "#2b2f34" } },
        { name: "Invierno", colors: { c1: "#e8eaec", c2: "#c2c8cf", c3: "#9aa3ad", c4: "#4f565e" } },
        { name: "Multicam", colors: { c1: "#8f8259", c2: "#b3a47a", c3: "#5f6347", c4: "#3a3327" } },
        { name: "Naval", colors: { c1: "#3a4a5a", c2: "#56697d", c3: "#26323d", c4: "#14181f" } },
      ],
      draw(ctx, N, c, o, rng) {
        const tones = [c.c1, c.c2, c.c3, c.c4];
        ctx.fillStyle = tones[0]; ctx.fillRect(0, 0, N, N);
        const base = N * (o.scale / 600), round = o.round / 100, jit = o.irregular / 100;
        const layers = [{ t: 1, rm: 1.0, cm: 1.0 }, { t: 2, rm: 0.66, cm: 1.5 }, { t: 3, rm: 0.42, cm: 2.0 }];
        for (const L of layers) {
          const r = base * L.rm;
          const count = Math.round(((N * N) / (Math.PI * r * r)) * 0.42 * (o.density / 100) * L.cm);
          ctx.fillStyle = tones[L.t];
          for (let k = 0; k < count; k++) {
            const cx = rng() * N, cy = rng() * N, rr = r * (0.6 + rng() * 0.9);
            const pts = blobOffsets(rng, rr, 9 + ((rng() * 4) | 0), jit);
            torusN(ctx, N, cx, cy, rr * (1 + jit), (x, y) => (round > 0.5 ? fillBlob : fillPoly)(ctx, x, y, pts));
          }
        }
      },
    },
    {
      id: "camo-digital", name: "Camuflaje digital", tags: "camuflaje camo digital pixel militar",
      colors: [
        { id: "c1", label: "Base", def: "#2b2f34" }, { id: "c2", label: "Tono 2", def: "#5b626b" },
        { id: "c3", label: "Tono 3", def: "#9aa0a6" }, { id: "c4", label: "Tono 4", def: "#14181f" },
      ],
      controls: [{ id: "block", label: "Píxel", min: 3, max: 400, def: 22 }, { id: "cluster", label: "Agrupado %", min: 0, max: 80, def: 45 }],
      organic: true,
      presets: [
        { name: "Urbano", colors: { c1: "#2b2f34", c2: "#5b626b", c3: "#9aa0a6", c4: "#14181f" } },
        { name: "Bosque", colors: { c1: "#3a4a2a", c2: "#5f6e3c", c3: "#7e8a52", c4: "#23291a" } },
        { name: "Desierto", colors: { c1: "#b8a070", c2: "#d8c79e", c3: "#8f7a52", c4: "#6f5b3e" } },
      ],
      draw(ctx, N, c, o, rng) {
        const tones = [c.c1, c.c2, c.c3, c.c4];
        const cols = Math.max(2, Math.round(N / (N * (o.block / 600))));
        const bs = N / cols, cl = o.cluster / 100;
        const idx = [];
        for (let gy = 0; gy < cols; gy++) { idx[gy] = []; for (let gx = 0; gx < cols; gx++) idx[gy][gx] = (rng() * tones.length) | 0; }
        for (let gy = 0; gy < cols; gy++) for (let gx = 0; gx < cols; gx++) if (rng() < cl) idx[gy][gx] = idx[(gy + cols - 1) % cols][(gx + cols - 1) % cols];
        for (let gy = 0; gy < cols; gy++) for (let gx = 0; gx < cols; gx++) {
          ctx.fillStyle = tones[idx[gy][gx]];
          ctx.fillRect(Math.floor(gx * bs), Math.floor(gy * bs), Math.ceil(bs) + 1, Math.ceil(bs) + 1);
        }
      },
    },
    {
      id: "splatter", name: "Salpicado", tags: "salpicado splatter manchas pintura",
      colors: [{ id: "c1", label: "Fondo", def: "#101216" }, { id: "c2", label: "Pintura", def: "#e8443a" }],
      controls: [{ id: "size", label: "Tamaño", min: 4, max: 400, def: 22 }, { id: "density", label: "Densidad", min: 5, max: 500, def: 45 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        const r = N * (o.size / 600), count = Math.round(((N * N) / (Math.PI * r * r)) * 0.3 * (o.density / 100));
        for (let k = 0; k < count; k++) {
          const cx = rng() * N, cy = rng() * N, rr = r * (0.4 + rng() * 1.1);
          const pts = blobOffsets(rng, rr, 8, 0.5);
          torusN(ctx, N, cx, cy, rr * 1.5, (x, y) => fillBlob(ctx, x, y, pts));
          // gotas satélite
          const sat = 2 + ((rng() * 4) | 0);
          for (let s = 0; s < sat; s++) {
            const a = rng() * 6.2832, d = rr * (1.2 + rng() * 1.8), sr = rr * (0.08 + rng() * 0.18);
            const sx = cx + Math.cos(a) * d, sy = cy + Math.sin(a) * d;
            torusN(ctx, N, sx, sy, sr, (x, y) => { ctx.beginPath(); ctx.arc(x, y, sr, 0, 6.2832); ctx.fill(); });
          }
        }
      },
    },
    {
      id: "terrazzo", name: "Terrazo", tags: "terrazzo chips piedra moteado",
      colors: [
        { id: "c1", label: "Base", def: "#eceae3" }, { id: "c2", label: "Chip A", def: "#e8443a" },
        { id: "c3", label: "Chip B", def: "#2a9df4" }, { id: "c4", label: "Chip C", def: "#14181f" },
      ],
      controls: [{ id: "size", label: "Chip", min: 3, max: 300, def: 16 }, { id: "density", label: "Densidad", min: 10, max: 600, def: 70 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        const tones = [c.c2, c.c3, c.c4];
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const r = N * (o.size / 700), count = Math.round(((N * N) / (r * r)) * 0.12 * (o.density / 100));
        for (let k = 0; k < count; k++) {
          const cx = rng() * N, cy = rng() * N, rr = r * (0.5 + rng() * 1.0);
          const pts = blobOffsets(rng, rr, 5 + ((rng() * 3) | 0), 0.5);
          const col = tones[(rng() * tones.length) | 0];
          torusN(ctx, N, cx, cy, rr * 1.5, (x, y) => { ctx.fillStyle = col; fillPoly(ctx, x, y, pts); });
        }
      },
    },
    // ====== NUEVOS PATRONES ======
    {
      id: "marble", name: "Mármol", tags: "marmol marble vetas piedra",
      colors: [
        { id: "c1", label: "Base", def: "#f1ede2" },
        { id: "c2", label: "Veta oscura", def: "#3a3a3a" },
        { id: "c3", label: "Veta clara", def: "#bcb6a8" },
      ],
      controls: [
        { id: "veins", label: "Vetas", min: 3, max: 400, def: 14 },
        { id: "freq", label: "Frecuencia", min: 1, max: 80, def: 2 },
        { id: "thick", label: "Grosor (px)", min: 1, max: 40, def: 2 },
      ],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const freq = Math.max(1, Math.round(o.freq));
        const veins = [];
        for (let i = 0; i < o.veins; i++) {
          veins.push({
            base: rng() * N, amp: N * (0.10 + rng() * 0.25),
            phase: rng() * Math.PI * 2,
            fmul: 1 + ((rng() * 3) | 0),
            col: rng() < 0.75 ? c.c2 : c.c3,
            a: 0.30 + rng() * 0.35,
          });
        }
        ctx.lineWidth = o.thick;
        // dibujar cada veta en 9 offsets toroidales (3 en x × 3 en y) → tileable en ambas direcciones
        for (const v of veins) {
          ctx.strokeStyle = v.col;
          ctx.globalAlpha = v.a;
          for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
            ctx.beginPath();
            for (let x = 0; x <= N; x += 4) {
              const y = v.base + Math.sin((x / N) * v.fmul * freq * Math.PI * 2 + v.phase) * v.amp;
              x === 0 ? ctx.moveTo(x + ox, y + oy) : ctx.lineTo(x + ox, y + oy);
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "holo", name: "Holograma iridiscente", tags: "holograma holo iridiscente arcoiris foil",
      colors: [],
      controls: [
        { id: "bands", label: "Bandas", min: 2, max: 200, def: 6 },
        { id: "sat", label: "Saturación", min: 30, max: 100, def: 80 },
        { id: "vertical", label: "Vertical", min: 0, max: 1, def: 0 },
      ],
      draw(ctx, N, c, o) {
        const freq = Math.max(1, Math.round(o.bands));
        const unit = N / freq;
        const stops = [
          [255, 32, 220], [255, 64, 100], [255, 180, 50], [255, 250, 70],
          [60, 240, 100], [40, 220, 220], [60, 130, 255], [180, 60, 255], [255, 32, 220],
        ];
        const desat = (rgb, s) => rgb.map((v) => Math.round(180 + (v - 180) * s));
        const sat = o.sat / 100;
        const vertical = o.vertical >= 0.5;
        const grad = vertical
          ? ctx.createLinearGradient(0, 0, 0, unit)
          : ctx.createLinearGradient(0, 0, unit, 0);
        stops.forEach((rgb, i) => {
          const [r, g, b] = desat(rgb, sat);
          grad.addColorStop(i / (stops.length - 1), `rgb(${r},${g},${b})`);
        });
        ctx.fillStyle = grad; ctx.fillRect(0, 0, N, N);
        if (vertical) {
          for (let y = unit; y < N; y += unit) {
            const g2 = ctx.createLinearGradient(0, y, 0, y + unit);
            stops.forEach((rgb, i) => {
              const [r, g, b] = desat(rgb, sat);
              g2.addColorStop(i / (stops.length - 1), `rgb(${r},${g},${b})`);
            });
            ctx.fillStyle = g2; ctx.fillRect(0, y, N, unit + 1);
          }
        } else {
          for (let x = unit; x < N; x += unit) {
            const g2 = ctx.createLinearGradient(x, 0, x + unit, 0);
            stops.forEach((rgb, i) => {
              const [r, g, b] = desat(rgb, sat);
              g2.addColorStop(i / (stops.length - 1), `rgb(${r},${g},${b})`);
            });
            ctx.fillStyle = g2; ctx.fillRect(x, 0, unit + 1, N);
          }
        }
      },
    },
    {
      id: "grunge", name: "Grunge / stencil", tags: "grunge stencil desgaste sucio rugoso",
      colors: [
        { id: "c1", label: "Base", def: "#e6e6e6" },
        { id: "c2", label: "Manchas", def: "#1a1a1a" },
      ],
      controls: [
        { id: "density", label: "Densidad", min: 30, max: 1500, def: 110 },
        { id: "size", label: "Tamaño", min: 4, max: 500, def: 14 },
        { id: "alpha", label: "Opacidad", min: 20, max: 100, def: 70 },
      ],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const baseR = N * (o.size / 1000);
        const count = Math.round((N * N) / (baseR * baseR * 4) * (o.density / 100));
        ctx.fillStyle = c.c2;
        ctx.globalAlpha = (o.alpha / 100) * 0.5;
        for (let k = 0; k < count; k++) {
          const cx = rng() * N, cy = rng() * N;
          const rr = baseR * (0.3 + rng() * 1.8);
          const pts = blobOffsets(rng, rr, 7 + ((rng() * 4) | 0), 0.7);
          torusN(ctx, N, cx, cy, rr * 1.6, (x, y) => fillPoly(ctx, x, y, pts));
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "mosaic", name: "Mosaico", tags: "mosaico mosaic trencadis pixel",
      colors: [
        { id: "c1", label: "Color A", def: "#d4af37" },
        { id: "c2", label: "Color B", def: "#0b3d62" },
        { id: "c3", label: "Color C", def: "#bf2a30" },
        { id: "c4", label: "Junta", def: "#0a0a0a" },
      ],
      controls: [
        { id: "size", label: "Celda (px)", min: 3, max: 500, def: 28 },
        { id: "gap", label: "Junta (px)", min: 0, max: 40, def: 2 },
      ],
      organic: true,
      draw(ctx, N, c, o, rng) {
        const sz = Math.max(4, o.size | 0);
        const cols = Math.max(2, Math.round(N / sz));
        const cellW = N / cols;
        const tones = [c.c1, c.c2, c.c3];
        const grid = [];
        for (let j = 0; j < cols; j++) {
          const row = []; for (let i = 0; i < cols; i++) row.push(tones[(rng() * tones.length) | 0]);
          grid.push(row);
        }
        ctx.fillStyle = c.c4; ctx.fillRect(0, 0, N, N);
        for (let j = 0; j < cols; j++) for (let i = 0; i < cols; i++) {
          ctx.fillStyle = grid[j][i];
          ctx.fillRect(i * cellW + o.gap / 2, j * cellW + o.gap / 2, cellW - o.gap, cellW - o.gap);
        }
      },
    },
    {
      id: "vaporwave", name: "Vaporwave 80s", tags: "vaporwave 80s sunset retro grid",
      colors: [
        { id: "c1", label: "Cielo claro", def: "#ff3079" },
        { id: "c2", label: "Cielo oscuro", def: "#1b0036" },
        { id: "c3", label: "Sol", def: "#ffd400" },
        { id: "c5", label: "Grid", def: "#ff42b3" },
      ],
      controls: [
        { id: "rows", label: "Filas grid", min: 4, max: 100, def: 10 },
        { id: "cols", label: "Columnas grid", min: 4, max: 100, def: 10 },
      ],
      draw(ctx, N, c, o) {
        // versión COMPLETAMENTE tileable: dos cintas (sol arriba y abajo) con gradient cíclico
        // c2→c1→c3→c1→c2 y rejilla periódica encima. NO hay horizonte fijo.
        const g = ctx.createLinearGradient(0, 0, 0, N);
        g.addColorStop(0, c.c2);
        g.addColorStop(0.25, c.c1);
        g.addColorStop(0.5, c.c3);
        g.addColorStop(0.75, c.c1);
        g.addColorStop(1, c.c2);
        ctx.fillStyle = g; ctx.fillRect(0, 0, N, N);
        ctx.strokeStyle = c.c5; ctx.lineWidth = Math.max(1, N / 700);
        ctx.globalAlpha = 0.85;
        const rows = Math.max(2, o.rows | 0);
        const stepY = N / rows;
        for (let i = 0; i < rows; i++) {
          const y = (i + 0.5) * stepY;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(N, y); ctx.stroke();
        }
        const cols = Math.max(2, o.cols | 0);
        const stepX = N / cols;
        for (let i = 0; i < cols; i++) {
          const x = (i + 0.5) * stepX;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, N); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    },
    // ============================================================
    // ====== TANDA GRANDE DE PATRONES (v1.1) ======
    // ============================================================

    // --- FIBRAS TÉCNICAS ---
    {
      id: "carbon-ud", name: "Carbono UD (unidireccional)", tags: "carbono ud unidireccional fibra",
      colors: [{ id: "c1", label: "Base", def: "#16161a" }, { id: "c2", label: "Hilo", def: "#2c2c33" }],
      controls: [{ id: "tow", label: "Hilos", min: 6, max: 500, def: 40 }, { id: "sheen", label: "Brillo", min: 0, max: 100, def: 50 }],
      draw(ctx, N, c, o) {
        const u = N / o.tow, k = o.sheen / 100;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let x = 0; x < N; x += u) {
          const g = ctx.createLinearGradient(x, 0, x + u, 0);
          g.addColorStop(0, c.c1);
          g.addColorStop(0.5, shade(c.c2, 0.18 * k));
          g.addColorStop(1, c.c1);
          ctx.fillStyle = g; ctx.fillRect(x, 0, u, N);
        }
      },
    },
    {
      id: "carbon-3k", name: "Carbono 3K (compacto)", tags: "carbono 3k tejido fibra denso",
      colors: [{ id: "c1", label: "Base", def: "#0e0e12" }, { id: "c2", label: "Trama", def: "#2a2a31" }],
      controls: [{ id: "tow", label: "Hilos", min: 6, max: 500, def: 32 }, { id: "sheen", label: "Brillo", min: 0, max: 100, def: 55 }],
      draw(ctx, N, c, o) {
        const u = N / (o.tow * 2), k = o.sheen / 100;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let y = 0; y < N; y += u * 2) for (let x = 0; x < N; x += u * 2) {
          ctx.fillRect(x, y, u, u); ctx.fillRect(x + u, y + u, u, u);
        }
        if (k > 0) for (let y = 0; y < N; y += u) for (let x = 0; x < N; x += u) {
          const g = ctx.createLinearGradient(x, y, x + u, y + u);
          g.addColorStop(0, `rgba(255,255,255,${0.08 * k})`);
          g.addColorStop(1, `rgba(0,0,0,${0.10 * k})`);
          ctx.fillStyle = g; ctx.fillRect(x, y, u, u);
        }
      },
    },
    {
      id: "carbon-12k", name: "Carbono 12K (grueso)", tags: "carbono 12k tejido fibra grueso",
      colors: [{ id: "c1", label: "Base", def: "#1c1c22" }, { id: "c2", label: "Trama", def: "#34353c" }],
      controls: [{ id: "tow", label: "Hilos", min: 4, max: 200, def: 6 }, { id: "sheen", label: "Brillo", min: 0, max: 100, def: 70 }],
      draw(ctx, N, c, o) {
        const u = N / (o.tow * 2), k = o.sheen / 100;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let y = 0; y < N; y += u * 2) for (let x = 0; x < N; x += u * 2) {
          ctx.fillRect(x, y, u, u); ctx.fillRect(x + u, y + u, u, u);
        }
        if (k > 0) for (let y = 0; y < N; y += u * 2) for (let x = 0; x < N; x += u * 2) {
          const g = ctx.createLinearGradient(x, y, x + u * 2, y + u * 2);
          g.addColorStop(0, `rgba(255,255,255,${0.20 * k})`);
          g.addColorStop(0.5, `rgba(0,0,0,${0.16 * k})`);
          g.addColorStop(1, `rgba(255,255,255,${0.20 * k})`);
          ctx.fillStyle = g; ctx.fillRect(x, y, u * 2, u * 2);
        }
      },
    },
    {
      id: "carbon-hex", name: "Carbono hex weave", tags: "carbono hex panal hexagonal lambo",
      colors: [{ id: "c1", label: "Base", def: "#16161a" }, { id: "c2", label: "Hex", def: "#3a3a44" }],
      controls: [{ id: "reps", label: "Hexágonos", min: 4, max: 300, def: 12 }, { id: "edge", label: "Borde %", min: 0, max: 30, def: 6 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const edge = o.edge / 100;
        hexTile(ctx, N, o.reps, (cx, x0, y0, r) => {
          cx.fillStyle = c.c2;
          cx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + i * Math.PI / 3;
            const x = x0 + Math.cos(a) * r * (1 - edge), y = y0 + Math.sin(a) * r * (1 - edge);
            i ? cx.lineTo(x, y) : cx.moveTo(x, y);
          }
          cx.closePath(); cx.fill();
        });
      },
    },
    {
      id: "kevlar", name: "Kevlar", tags: "kevlar aramida amarillo fibra tejido",
      colors: [{ id: "c1", label: "Base", def: "#c79d2a" }, { id: "c2", label: "Hilo", def: "#a07a18" }],
      controls: [{ id: "tow", label: "Hilos", min: 4, max: 300, def: 14 }, { id: "sheen", label: "Brillo", min: 0, max: 100, def: 65 }],
      draw(ctx, N, c, o) {
        const u = N / (o.tow * 2), k = o.sheen / 100;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let y = 0; y < N; y += u * 2) for (let x = 0; x < N; x += u * 2) {
          ctx.fillRect(x, y, u, u); ctx.fillRect(x + u, y + u, u, u);
        }
        if (k > 0) for (let y = 0; y < N; y += u * 2) for (let x = 0; x < N; x += u * 2) {
          const g = ctx.createLinearGradient(x, y, x + u * 2, y + u * 2);
          g.addColorStop(0, `rgba(255,235,140,${0.18 * k})`);
          g.addColorStop(1, `rgba(120,80,0,${0.18 * k})`);
          ctx.fillStyle = g; ctx.fillRect(x, y, u * 2, u * 2);
        }
      },
    },

    // --- METAL / PINTURA INDUSTRIAL ---
    {
      id: "brushed-v", name: "Aluminio cepillado vertical", tags: "metal aluminio cepillado brushed",
      colors: [{ id: "c1", label: "Base", def: "#8a8c92" }, { id: "c2", label: "Veta", def: "#a8aab0" }],
      controls: [{ id: "lines", label: "Vetas", min: 50, max: 2000, def: 400 }, { id: "contrast", label: "Contraste", min: 5, max: 80, def: 25 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const k = o.contrast / 100, lines = Math.max(2, o.lines | 0);
        ctx.globalAlpha = k * 0.6;
        ctx.strokeStyle = c.c2;
        for (let i = 0; i < lines; i++) {
          const x = (i + 0.5) * N / lines;
          ctx.lineWidth = 0.5 + ((i * 9301 + 49297) % 233) / 200;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, N); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "brushed-h", name: "Aluminio cepillado horizontal", tags: "metal aluminio cepillado brushed horizontal",
      colors: [{ id: "c1", label: "Base", def: "#8a8c92" }, { id: "c2", label: "Veta", def: "#a8aab0" }],
      controls: [{ id: "lines", label: "Vetas", min: 50, max: 2000, def: 400 }, { id: "contrast", label: "Contraste", min: 5, max: 80, def: 25 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const k = o.contrast / 100, lines = Math.max(2, o.lines | 0);
        ctx.globalAlpha = k * 0.6;
        ctx.strokeStyle = c.c2;
        for (let i = 0; i < lines; i++) {
          const y = (i + 0.5) * N / lines;
          ctx.lineWidth = 0.5 + ((i * 9301 + 49297) % 233) / 200;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(N, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "brushed-circular", name: "Aluminio cepillado circular", tags: "metal aluminio cepillado circular spun",
      colors: [{ id: "c1", label: "Base", def: "#9a9ca2" }, { id: "c2", label: "Veta", def: "#b8bac0" }],
      controls: [{ id: "rays", label: "Rayos", min: 50, max: 2000, def: 600 }, { id: "contrast", label: "Contraste", min: 5, max: 80, def: 30 }],
      draw(ctx, N, c, o) {
        // grid de mini-spuns: cada celda tiene su centro de rayos → tileable
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const reps = 4;
        const cw = N / reps;
        const rays = Math.max(20, Math.round(o.rays / (reps * reps)));
        ctx.globalAlpha = (o.contrast / 100) * 0.55;
        ctx.strokeStyle = c.c2;
        for (let gy = 0; gy < reps; gy++) for (let gx = 0; gx < reps; gx++) {
          const cx = (gx + 0.5) * cw, cy = (gy + 0.5) * cw;
          for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2;
            ctx.lineWidth = 0.3 + ((i * 9301) % 211) / 250;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * cw * 0.5, cy + Math.sin(a) * cw * 0.5);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "chrome", name: "Cromo", tags: "cromo chrome metal pulido espejo",
      colors: [{ id: "c1", label: "Oscuro", def: "#3a3e44" }, { id: "c2", label: "Medio", def: "#a8abb1" }, { id: "c3", label: "Brillo", def: "#f0f2f5" }],
      controls: [{ id: "bands", label: "Bandas", min: 2, max: 60, def: 6 }, { id: "vertical", label: "Vertical", min: 0, max: 1, def: 0 }],
      draw(ctx, N, c, o) {
        const vert = o.vertical >= 0.5;
        const unit = N / o.bands;
        for (let i = 0; i < o.bands; i++) {
          const off = i * unit;
          const g = vert ? ctx.createLinearGradient(0, off, 0, off + unit) : ctx.createLinearGradient(off, 0, off + unit, 0);
          g.addColorStop(0, c.c1); g.addColorStop(0.45, c.c3); g.addColorStop(0.55, c.c2); g.addColorStop(1, c.c1);
          ctx.fillStyle = g;
          vert ? ctx.fillRect(0, off, N, unit + 1) : ctx.fillRect(off, 0, unit + 1, N);
        }
      },
    },
    {
      id: "hammertone", name: "Pintura martillada", tags: "metal hammertone martillada industrial",
      colors: [{ id: "c1", label: "Base", def: "#2c4a5e" }, { id: "c2", label: "Realce", def: "#5b8eaa" }],
      controls: [{ id: "size", label: "Hoyuelos", min: 4, max: 600, def: 24 }, { id: "density", label: "Densidad", min: 30, max: 1500, def: 200 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const r = N * (o.size / 1000);
        const count = Math.round((N * N) / (r * r * 4) * (o.density / 100));
        for (let k = 0; k < count; k++) {
          const cx = rng() * N, cy = rng() * N, rr = r * (0.6 + rng() * 0.8);
          torusN(ctx, N, cx, cy, rr * 1.3, (x, y) => {
            // gradient relativo al centro torus actual → consistente entre copias
            const g = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.3, 0, x, y, rr);
            g.addColorStop(0, c.c2); g.addColorStop(1, c.c1);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.fill();
          });
        }
      },
    },
    {
      id: "copper", name: "Cobre / latón", tags: "cobre latón brass copper metal",
      colors: [{ id: "c1", label: "Base", def: "#a86a2c" }, { id: "c2", label: "Veta", def: "#e0a060" }, { id: "c3", label: "Oscuro", def: "#5c3a18" }],
      controls: [{ id: "veins", label: "Vetas", min: 20, max: 800, def: 200 }, { id: "warm", label: "Calidez", min: 0, max: 100, def: 60 }],
      draw(ctx, N, c, o) {
        // base sólida (gradient vertical completo deja costura al tilear)
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const veins = Math.max(2, o.veins | 0), k = o.warm / 100;
        ctx.globalAlpha = 0.35 + k * 0.3;
        for (let i = 0; i < veins; i++) {
          const y = (i + 0.5) * N / veins;
          ctx.strokeStyle = i % 3 === 0 ? c.c3 : (i % 3 === 1 ? c.c2 : c.c1);
          ctx.lineWidth = 0.4 + ((i * 7301) % 211) / 280;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(N, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "patina", name: "Pátina oxidación", tags: "patina oxidacion oxido herrumbre rust verde",
      colors: [{ id: "c1", label: "Base metal", def: "#2c4a4a" }, { id: "c2", label: "Pátina verde", def: "#4f8c6a" }, { id: "c3", label: "Óxido", def: "#a14820" }],
      controls: [{ id: "size", label: "Mancha", min: 10, max: 400, def: 60 }, { id: "rust", label: "Óxido %", min: 0, max: 80, def: 25 }, { id: "density", label: "Densidad", min: 10, max: 400, def: 80 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const r = N * (o.size / 600);
        const count = Math.round((N * N) / (r * r * 3) * (o.density / 100));
        for (let k = 0; k < count; k++) {
          const cx = rng() * N, cy = rng() * N, rr = r * (0.4 + rng() * 1.4);
          const pts = blobOffsets(rng, rr, 8, 0.6);
          const col = rng() < (o.rust / 100) ? c.c3 : c.c2;
          ctx.fillStyle = col; ctx.globalAlpha = 0.55 + rng() * 0.3;
          torusN(ctx, N, cx, cy, rr * 1.5, (x, y) => fillBlob(ctx, x, y, pts));
        }
        ctx.globalAlpha = 1;
      },
    },

    // --- PINTURA ESPECIAL RACING ---
    {
      id: "candy-flake", name: "Candy flake", tags: "candy flake perlado purpurina racing",
      colors: [{ id: "c1", label: "Candy", def: "#7a0f1c" }, { id: "c2", label: "Flake", def: "#ffd870" }],
      controls: [{ id: "flakes", label: "Flakes", min: 100, max: 6000, def: 1500 }, { id: "size", label: "Tamaño flake", min: 1, max: 12, def: 3 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        // base sólida (radial gradient global produciría costura al tilear)
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let k = 0; k < o.flakes; k++) {
          const cx = rng() * N, cy = rng() * N, r = o.size * (0.3 + rng());
          ctx.globalAlpha = 0.25 + rng() * 0.55;
          torusN(ctx, N, cx, cy, r * 1.4, (x, y) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "chameleon", name: "Chameleon", tags: "chameleon color shift pearl iridiscente",
      colors: [{ id: "c1", label: "Color 1", def: "#7d2bfa" }, { id: "c2", label: "Color 2", def: "#1ec9c5" }, { id: "c3", label: "Color 3", def: "#fa3c8a" }],
      controls: [{ id: "bands", label: "Bandas", min: 1, max: 80, def: 4 }],
      draw(ctx, N, c, o) {
        // cada banda recorre c1→c2→c3→c1 (cíclico) para empalmar limpio con la siguiente
        const bands = Math.max(1, o.bands | 0);
        const unit = N / bands;
        for (let i = 0; i < bands; i++) {
          const g = ctx.createLinearGradient(0, i * unit, 0, i * unit + unit);
          g.addColorStop(0, c.c1); g.addColorStop(0.33, c.c2); g.addColorStop(0.66, c.c3); g.addColorStop(1, c.c1);
          ctx.fillStyle = g; ctx.fillRect(0, i * unit, N, unit + 1);
        }
      },
    },
    {
      id: "oil-slick", name: "Aceite arcoíris", tags: "oil slick gasolina petroleo arcoiris",
      colors: [{ id: "c1", label: "Base", def: "#0a0a14" }, { id: "c2", label: "Mancha", def: "#48d8b0" }, { id: "c3", label: "Mancha 2", def: "#7848d8" }],
      controls: [{ id: "size", label: "Mancha", min: 20, max: 800, def: 200 }, { id: "swirl", label: "Densidad", min: 10, max: 400, def: 80 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const r = N * (o.size / 1200);
        const count = Math.round((N * N) / (r * r * 6) * (o.swirl / 100));
        const cols = [c.c2, c.c3, shade(c.c2, 0.3), shade(c.c3, 0.3)];
        for (let k = 0; k < count; k++) {
          const cx = rng() * N, cy = rng() * N, rr = r * (0.4 + rng() * 1.8);
          const pts = blobOffsets(rng, rr, 8 + ((rng() * 4) | 0), 0.5);
          ctx.fillStyle = cols[(rng() * cols.length) | 0];
          ctx.globalAlpha = 0.35 + rng() * 0.35;
          torusN(ctx, N, cx, cy, rr * 1.6, (x, y) => fillBlob(ctx, x, y, pts));
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "patina-aged", name: "Pintura desgastada", tags: "aged desgastado patina viejo race rallado",
      colors: [{ id: "c1", label: "Pintura", def: "#3a6c46" }, { id: "c2", label: "Desgaste", def: "#d4ccb6" }],
      controls: [{ id: "wear", label: "Desgaste", min: 10, max: 600, def: 150 }, { id: "size", label: "Tamaño", min: 4, max: 300, def: 40 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const r = N * (o.size / 1200);
        const count = Math.round((N * N) / (r * r * 4) * (o.wear / 100));
        ctx.fillStyle = c.c2;
        for (let k = 0; k < count; k++) {
          const cx = rng() * N, cy = rng() * N, rr = r * (0.3 + rng() * 1.4);
          const pts = blobOffsets(rng, rr, 9, 0.7);
          ctx.globalAlpha = 0.15 + rng() * 0.4;
          torusN(ctx, N, cx, cy, rr * 1.5, (x, y) => fillBlob(ctx, x, y, pts));
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "glow", name: "Glow in the dark", tags: "glow neon radioactivo brillo verde",
      colors: [{ id: "c1", label: "Base oscura", def: "#0a1208" }, { id: "c2", label: "Glow", def: "#a8ff52" }],
      controls: [{ id: "spots", label: "Brillos", min: 4, max: 400, def: 40 }, { id: "size", label: "Tamaño", min: 20, max: 1000, def: 200 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        // base sólida + brillos esparcidos toroidalmente → tileable
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.spots; k++) {
          const cx = rng() * N, cy = rng() * N, r = o.size * (0.4 + rng() * 1.2);
          torusN(ctx, N, cx, cy, r, (x, y) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, c.c2); g.addColorStop(0.5, shade(c.c2, -0.5)); g.addColorStop(1, "transparent");
            ctx.fillStyle = g; ctx.globalAlpha = 0.6 + rng() * 0.3;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
          });
        }
        ctx.globalAlpha = 1;
      },
    },

    // --- CAMUFLAJE (VARIANTES) ---
    {
      id: "camo-flecktarn", name: "Camo Flecktarn", tags: "camo flecktarn aleman puntitos militar",
      colors: [
        { id: "c1", label: "Base", def: "#4a4a32" }, { id: "c2", label: "Tono 2", def: "#6b6a44" },
        { id: "c3", label: "Tono 3", def: "#252522" }, { id: "c4", label: "Tono 4", def: "#8e6a3e" },
      ],
      controls: [{ id: "density", label: "Densidad", min: 100, max: 5000, def: 1500 }, { id: "size", label: "Punto", min: 1, max: 30, def: 5 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        const tones = [c.c2, c.c3, c.c4];
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.density; k++) {
          const cx = rng() * N, cy = rng() * N, r = o.size * (0.6 + rng() * 1.5);
          ctx.fillStyle = tones[(rng() * tones.length) | 0];
          torusN(ctx, N, cx, cy, r * 1.3, (x, y) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); });
        }
      },
    },
    {
      id: "camo-tigerstripe", name: "Camo Tigerstripe", tags: "camo tigerstripe vietnam tigre rayas",
      colors: [
        { id: "c1", label: "Base", def: "#5c6438" }, { id: "c2", label: "Marrón", def: "#3d3622" }, { id: "c3", label: "Negro", def: "#16160e" },
      ],
      controls: [{ id: "stripes", label: "Rayas", min: 4, max: 200, def: 16 }, { id: "wobble", label: "Distorsión", min: 0, max: 100, def: 60 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        // dibujamos cada raya como manchas toroidales superpuestas → sin costura
        const stripes = Math.max(2, o.stripes | 0);
        const unit = N / stripes, wob = o.wobble / 100;
        for (let i = 0; i < stripes; i++) {
          const col = i % 3 === 0 ? c.c3 : (i % 3 === 1 ? c.c2 : c.c1);
          if (col === c.c1) continue;
          ctx.fillStyle = col;
          const y0 = i * unit + unit / 2;
          const blobs = Math.max(6, Math.round(N / (unit * 0.8)));
          for (let b = 0; b < blobs; b++) {
            const cx = (b + 0.5) * N / blobs + (rng() - 0.5) * unit * wob;
            const cy = y0 + (rng() - 0.5) * unit * wob;
            const rx = unit * (0.55 + rng() * 0.6), ry = unit * (0.35 + rng() * 0.3);
            const pts = blobOffsets(rng, (rx + ry) / 2, 7 + ((rng() * 3) | 0), 0.6);
            torusN(ctx, N, cx, cy, Math.max(rx, ry) * 1.4, (x, y) => fillBlob(ctx, x, y, pts));
          }
        }
      },
    },
    {
      id: "camo-multicam", name: "Camo Multicam", tags: "camo multicam ocp moderno operacional",
      colors: [
        { id: "c1", label: "Base", def: "#a89668" }, { id: "c2", label: "Verde", def: "#586a3e" },
        { id: "c3", label: "Marrón", def: "#5a4426" }, { id: "c4", label: "Marrón osc", def: "#322618" },
      ],
      controls: [{ id: "scale", label: "Mancha", min: 6, max: 500, def: 38 }, { id: "density", label: "Densidad", min: 20, max: 500, def: 90 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        const tones = [c.c2, c.c3, c.c4];
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const base = N * (o.scale / 500);
        for (const t of tones) {
          const r = base * (t === c.c4 ? 0.5 : 1);
          const count = Math.round((N * N) / (r * r * 4) * (o.density / 100));
          ctx.fillStyle = t;
          for (let k = 0; k < count; k++) {
            const cx = rng() * N, cy = rng() * N, rr = r * (0.5 + rng());
            const pts = blobOffsets(rng, rr, 10, 0.5);
            torusN(ctx, N, cx, cy, rr * 1.5, (x, y) => fillBlob(ctx, x, y, pts));
          }
        }
      },
    },
    {
      id: "camo-snake", name: "Camo Snake skin", tags: "camo serpiente snake escamas reptil",
      colors: [{ id: "c1", label: "Base", def: "#6e5430" }, { id: "c2", label: "Escama", def: "#3c2c18" }, { id: "c3", label: "Brillo", def: "#bea878" }],
      controls: [{ id: "reps", label: "Filas de escamas", min: 4, max: 200, def: 32 }],
      draw(ctx, N, c, o) {
        // 2 filas alternadas por celda (par/impar); cols/rows snapeados a divisores exactos
        const reps = Math.max(2, Math.round(o.reps / 2) * 2);
        const rows = snapDivisor(N, Math.max(1, reps / 2 | 0));
        const cellH = N / rows;
        const cols = snapDivisor(N, Math.max(2, Math.round(N / (cellH * 0.85 / 2))));
        const cellW = N / cols;
        const cell = document.createElement("canvas");
        cell.width = cellW; cell.height = cellH;
        const x = cell.getContext("2d");
        x.fillStyle = c.c1; x.fillRect(0, 0, cellW, cellH);
        x.strokeStyle = c.c2; x.lineWidth = Math.max(1, cellH * 0.045);
        x.fillStyle = c.c3;
        const drawRow = (cy, off) => {
          const r = cellH * 0.28;
          for (let xi = -1; xi <= 1; xi++) {
            const cx = xi * cellW + off;
            x.beginPath(); x.arc(cx, cy, r, Math.PI * 0.1, Math.PI - 0.1, false); x.stroke();
            x.globalAlpha = 0.22; x.fill(); x.globalAlpha = 1;
            const cx2 = cx + cellW / 2;
            x.beginPath(); x.arc(cx2, cy, r, Math.PI * 0.1, Math.PI - 0.1, false); x.stroke();
            x.globalAlpha = 0.22; x.fill(); x.globalAlpha = 1;
          }
        };
        drawRow(cellH * 0.25, 0);
        drawRow(cellH * 0.75, cellW / 2);
        tileCellRect(ctx, N, cell, cols, rows);
      },
    },

    // --- GEOMÉTRICO ---
    {
      id: "honeycomb", name: "Honeycomb / panal", tags: "honeycomb panal hexagonal abeja",
      colors: [{ id: "c1", label: "Fondo", def: "#f5c543" }, { id: "c2", label: "Borde", def: "#1c1c1c" }],
      controls: [{ id: "reps", label: "Celdas", min: 4, max: 300, def: 16 }, { id: "edge", label: "Grosor borde", min: 1, max: 30, def: 6 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        hexTile(ctx, N, o.reps, (cx, x0, y0, r) => {
          cx.strokeStyle = c.c2; cx.lineWidth = o.edge;
          cx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + i * Math.PI / 3;
            const x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r;
            i ? cx.lineTo(x, y) : cx.moveTo(x, y);
          }
          cx.closePath(); cx.stroke();
        });
      },
    },
    {
      id: "voronoi", name: "Voronoi", tags: "voronoi celulas regiones organico mosaico",
      colors: [{ id: "c1", label: "Color A", def: "#1c2030" }, { id: "c2", label: "Color B", def: "#3a4458" }, { id: "c3", label: "Color C", def: "#d8443a" }],
      controls: [{ id: "points", label: "Puntos", min: 10, max: 1500, def: 80 }, { id: "edge", label: "Borde", min: 0, max: 10, def: 2 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        const pts = [];
        for (let i = 0; i < o.points; i++) pts.push({ x: rng() * N, y: rng() * N, col: [c.c1, c.c2, c.c3][i % 3] });
        const step = Math.max(2, Math.floor(N / 200));
        for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
          let best = Infinity, bestI = 0;
          for (let i = 0; i < pts.length; i++) {
            let dx = x - pts[i].x; dx = Math.abs(dx); dx = Math.min(dx, N - dx);
            let dy = y - pts[i].y; dy = Math.abs(dy); dy = Math.min(dy, N - dy);
            const d = dx * dx + dy * dy;
            if (d < best) { best = d; bestI = i; }
          }
          ctx.fillStyle = pts[bestI].col;
          ctx.fillRect(x, y, step + 1, step + 1);
        }
      },
    },
    {
      id: "pinstripe-diag", name: "Pinstripes diagonales", tags: "pinstripe diagonal rayas finas",
      colors: [{ id: "c1", label: "Fondo", def: "#101216" }, { id: "c2", label: "Raya", def: "#e8c43a" }],
      controls: [{ id: "lines", label: "Líneas", min: 4, max: 400, def: 40 }, { id: "thickness", label: "Grosor %", min: 1, max: 50, def: 8 }],
      draw(ctx, N, c, o) {
        const cw = Math.max(4, Math.round(N / o.lines)), w = o.thickness / 100;
        tileCell(ctx, N, pixelCell(cw, c.c1, c.c2, (x, y, W) => ((x + y) % W) < W * w ? 1 : 0), o.lines);
      },
    },
    {
      id: "herringbone", name: "Espiga / Herringbone", tags: "espiga herringbone tweed clasico",
      colors: [{ id: "c1", label: "Color A", def: "#2c2f36" }, { id: "c2", label: "Color B", def: "#8f9098" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 2, max: 200, def: 12 }],
      draw(ctx, N, c, o) {
        const cw = Math.max(8, Math.round(N / o.reps));
        tileCell(ctx, N, pixelCell(cw, c.c1, c.c2, (x, y, W) => {
          const yi = Math.floor(y / (W / 2));
          return (yi % 2 === 0 ? (x + y) : (W - x + y)) % W < W / 2 ? 1 : 0;
        }), o.reps);
      },
    },
    {
      id: "basket-weave", name: "Tejido cesta", tags: "cesta basket weave entrelazado",
      colors: [{ id: "c1", label: "Color A", def: "#a87856" }, { id: "c2", label: "Color B", def: "#6c4c30" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 2, max: 200, def: 10 }],
      draw(ctx, N, c, o) {
        // celda = 2x2 sub-tiles alternando hilo horizontal/vertical → estrictamente periódico
        const cw = Math.max(8, Math.round(N / o.reps));
        tileCell(ctx, N, pixelCell(cw, c.c1, c.c2, (x, y, W) => {
          const h = W / 2;
          const cx = (x / h) | 0; // 0 ó 1
          const cy = (y / h) | 0;
          // sub-bloque (cx, cy): si par alternado → líneas horizontales; impar → verticales
          const inX = x - cx * h, inY = y - cy * h;
          return ((cx + cy) % 2 === 0)
            ? (Math.floor(inY * 4 / h) % 2)
            : (Math.floor(inX * 4 / h) % 2);
        }), o.reps);
      },
    },
    {
      id: "triangles", name: "Triángulos teselados", tags: "triangulos teselado geometrico",
      colors: [{ id: "c1", label: "Color A", def: "#e8443a" }, { id: "c2", label: "Color B", def: "#ffffff" }, { id: "c3", label: "Color C", def: "#1c1c20" }],
      controls: [{ id: "reps", label: "Columnas", min: 2, max: 200, def: 16 }],
      draw(ctx, N, c, o) {
        // celda con 2 sub-filas (par/impar) y triángulos que encajan con la cell vecina
        // tanto vertical como horizontalmente. snapDivisor para tile pixel-perfecto.
        const cols = snapDivisor(N, Math.max(2, o.reps | 0));
        const rows = snapDivisor(N, Math.max(2, Math.round(cols / Math.sqrt(3))));
        const cw = N / cols, ch = N / rows; // ch = alto de 2 sub-filas
        const h = ch / 2; // alto de 1 sub-fila
        const cell = document.createElement("canvas");
        cell.width = cw; cell.height = ch;
        const x = cell.getContext("2d");
        const cols3 = [c.c1, c.c2, c.c3];
        const tri = (x0, y0, up, idx) => {
          x.fillStyle = cols3[((idx % 3) + 3) % 3];
          x.beginPath();
          if (up) { x.moveTo(x0, y0 + h); x.lineTo(x0 + cw / 2, y0); x.lineTo(x0 + cw, y0 + h); }
          else { x.moveTo(x0, y0); x.lineTo(x0 + cw, y0); x.lineTo(x0 + cw / 2, y0 + h); }
          x.closePath(); x.fill();
        };
        // sub-fila superior (y=0..h): pares de triángulos arriba/abajo
        tri(-cw / 2, 0, false, 0); tri(0, 0, true, 1); tri(cw / 2, 0, false, 2); tri(cw, 0, true, 0);
        // sub-fila inferior (y=h..ch): con offset cw/2 (los triángulos invertidos encajan abajo)
        tri(0, h, false, 2); tri(cw / 2, h, true, 0); tri(cw, h, false, 1); tri(-cw / 2, h, true, 1);
        tileCellRect(ctx, N, cell, cols, rows);
      },
    },
    {
      id: "hex-neon", name: "Hexágonos neón", tags: "hexagono neon sci futurista",
      colors: [{ id: "c1", label: "Fondo", def: "#0a0a12" }, { id: "c2", label: "Neón", def: "#00f5ff" }],
      controls: [{ id: "reps", label: "Hexágonos", min: 4, max: 300, def: 14 }, { id: "glow", label: "Glow", min: 0, max: 80, def: 30 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        hexTile(ctx, N, o.reps, (cx, x0, y0, r) => {
          cx.strokeStyle = c.c2; cx.lineWidth = Math.max(1, r * 0.06);
          if (o.glow > 0) { cx.shadowColor = c.c2; cx.shadowBlur = r * (o.glow / 100); }
          cx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + i * Math.PI / 3;
            const x = x0 + Math.cos(a) * r * 0.9, y = y0 + Math.sin(a) * r * 0.9;
            i ? cx.lineTo(x, y) : cx.moveTo(x, y);
          }
          cx.closePath(); cx.stroke();
          cx.shadowBlur = 0;
        });
      },
    },
    {
      id: "halftone", name: "Halftone gradient", tags: "halftone bencol comic gradiente puntos",
      colors: [{ id: "c1", label: "Fondo", def: "#ffffff" }, { id: "c2", label: "Punto", def: "#e8443a" }],
      controls: [{ id: "reps", label: "Puntos", min: 8, max: 300, def: 40 }, { id: "vertical", label: "Vertical", min: 0, max: 1, def: 1 }],
      draw(ctx, N, c, o) {
        // gradiente cíclico (pequeño→grande→pequeño) para que tile sin costura
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const reps = snapDivisor(N, Math.max(4, o.reps | 0));
        const period = N / reps;
        ctx.fillStyle = c.c2;
        for (let gy = 0; gy < reps; gy++) for (let gx = 0; gx < reps; gx++) {
          const t = o.vertical >= 0.5 ? gy / reps : gx / reps;
          // función triangular: 0→1→0 a través del rango → cíclica
          const tt = 1 - Math.abs(t * 2 - 1);
          const r = period * 0.5 * tt;
          if (r < 0.5) continue;
          torusN(ctx, N, (gx + 0.5) * period, (gy + 0.5) * period, r, (x, y) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); });
        }
      },
    },
    {
      id: "argyle", name: "Argyle", tags: "argyle rombos cruzados golf preppy",
      colors: [{ id: "c1", label: "Color A", def: "#2c4a6e" }, { id: "c2", label: "Color B", def: "#a83e3e" }, { id: "c3", label: "Línea", def: "#e8c43a" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 1, max: 100, def: 4 }],
      draw(ctx, N, c, o) {
        const cw = Math.max(20, Math.round(N / o.reps));
        const cell = document.createElement("canvas");
        cell.width = cell.height = cw;
        const x = cell.getContext("2d");
        x.fillStyle = c.c1; x.fillRect(0, 0, cw, cw);
        x.fillStyle = c.c2;
        x.beginPath(); x.moveTo(cw / 2, 0); x.lineTo(cw, cw / 2); x.lineTo(cw / 2, cw); x.lineTo(0, cw / 2); x.closePath(); x.fill();
        x.strokeStyle = c.c3; x.lineWidth = Math.max(1, cw * 0.02);
        x.beginPath(); x.moveTo(0, 0); x.lineTo(cw, cw); x.moveTo(cw, 0); x.lineTo(0, cw); x.stroke();
        tileCell(ctx, N, cell, o.reps);
      },
    },
    {
      id: "tartan", name: "Plaid / Tartán", tags: "plaid tartan escocia cuadros",
      colors: [{ id: "c1", label: "Base", def: "#1a2a4a" }, { id: "c2", label: "Banda", def: "#a83a3a" }, { id: "c3", label: "Línea", def: "#e8c43a" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 1, max: 60, def: 4 }, { id: "thick", label: "Grosor banda %", min: 3, max: 40, def: 15 }],
      draw(ctx, N, c, o) {
        // construyo una cell de período exacto N/reps y la tile con createPattern → encaja seguro
        const reps = Math.max(1, o.reps | 0);
        const cellW = N / reps;
        const cell = document.createElement("canvas");
        cell.width = cell.height = Math.max(8, Math.ceil(cellW));
        const x = cell.getContext("2d");
        x.fillStyle = c.c1; x.fillRect(0, 0, cell.width, cell.height);
        const tw = cell.width * (o.thick / 100);
        x.globalAlpha = 0.55; x.fillStyle = c.c2;
        x.fillRect(0, cell.height * 0.3, cell.width, tw);
        x.fillRect(cell.width * 0.3, 0, tw, cell.height);
        x.globalAlpha = 1; x.fillStyle = c.c3;
        const tl = Math.max(1, cell.width * 0.02);
        x.fillRect(0, cell.height * 0.66, cell.width, tl);
        x.fillRect(cell.width * 0.66, 0, tl, cell.height);
        tileCell(ctx, N, cell, reps);
      },
    },
    {
      id: "houndstooth", name: "Houndstooth (pata gallo)", tags: "houndstooth pata de gallo clasico",
      colors: [{ id: "c1", label: "Color A", def: "#1a1a1a" }, { id: "c2", label: "Color B", def: "#f0f0f0" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 2, max: 80, def: 8 }],
      draw(ctx, N, c, o) {
        const cw = Math.max(16, Math.round(N / o.reps));
        const cell = document.createElement("canvas");
        cell.width = cell.height = cw;
        const x = cell.getContext("2d");
        const u = cw / 4;
        x.fillStyle = c.c2; x.fillRect(0, 0, cw, cw);
        x.fillStyle = c.c1;
        x.fillRect(0, 0, u * 2, u * 2);
        x.fillRect(u * 2, u * 2, u * 2, u * 2);
        x.beginPath(); x.moveTo(0, u * 2); x.lineTo(u * 2, u * 2); x.lineTo(u * 2, u * 4); x.lineTo(0, u * 2); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(u * 2, 0); x.lineTo(u * 4, 0); x.lineTo(u * 4, u * 2); x.lineTo(u * 2, 0); x.closePath(); x.fill();
        tileCell(ctx, N, cell, o.reps);
      },
    },
    {
      id: "op-art", name: "Op art ilusión", tags: "op art ilusion psicodelico ondas",
      colors: [{ id: "c1", label: "Color A", def: "#ffffff" }, { id: "c2", label: "Color B", def: "#000000" }],
      controls: [{ id: "rings", label: "Anillos", min: 4, max: 300, def: 30 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const step = N / o.rings / 2;
        ctx.fillStyle = c.c2;
        for (let i = 0; i < o.rings; i++) {
          const r = step * (i * 2 + 1);
          torusN(ctx, N, N / 2, N / 2, r + step, (x, y) => {
            ctx.beginPath();
            ctx.arc(x, y, r + step, 0, 6.2832); ctx.arc(x, y, r, 0, 6.2832, true);
            ctx.fill("evenodd");
          });
        }
      },
    },

    // --- ORGÁNICO ---
    {
      id: "wood", name: "Madera vetas", tags: "madera wood vetas natural",
      colors: [{ id: "c1", label: "Base clara", def: "#a87a48" }, { id: "c2", label: "Veta", def: "#5a3e1a" }, { id: "c3", label: "Anillo", def: "#3a280f" }],
      controls: [{ id: "lines", label: "Vetas", min: 20, max: 1500, def: 200 }, { id: "rings", label: "Anillos", min: 0, max: 40, def: 8 }],
      draw(ctx, N, c, o) {
        const g = ctx.createLinearGradient(0, 0, 0, N);
        g.addColorStop(0, c.c1); g.addColorStop(0.5, shade(c.c1, -0.1)); g.addColorStop(1, c.c1);
        ctx.fillStyle = g; ctx.fillRect(0, 0, N, N);
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = c.c2;
        for (let i = 0; i < o.lines; i++) {
          const y = (i / o.lines) * N;
          ctx.lineWidth = 0.4 + ((i * 9311) % 233) / 280;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(N, y); ctx.stroke();
        }
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = c.c3; ctx.lineWidth = 2;
        for (let i = 1; i <= o.rings; i++) {
          const y = (i / (o.rings + 1)) * N;
          ctx.beginPath();
          for (let x = 0; x <= N; x += 8) {
            const yy = y + Math.sin(x / N * Math.PI * 4) * 5;
            x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "leather", name: "Cuero", tags: "leather cuero poro natural",
      colors: [{ id: "c1", label: "Cuero", def: "#5e3a1e" }, { id: "c2", label: "Poro", def: "#3a230f" }, { id: "c3", label: "Brillo", def: "#a87852" }],
      controls: [{ id: "pores", label: "Poros", min: 100, max: 8000, def: 2000 }, { id: "size", label: "Tamaño", min: 1, max: 20, def: 3 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.pores; k++) {
          const cx = rng() * N, cy = rng() * N, r = o.size * (0.4 + rng() * 1.2);
          ctx.fillStyle = rng() < 0.7 ? c.c2 : c.c3;
          ctx.globalAlpha = 0.4 + rng() * 0.4;
          torusN(ctx, N, cx, cy, r * 1.3, (x, y) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "crocodile", name: "Piel de cocodrilo", tags: "cocodrilo croc piel reptil",
      colors: [{ id: "c1", label: "Base", def: "#4a5a32" }, { id: "c2", label: "Junta", def: "#1a2210" }, { id: "c3", label: "Brillo", def: "#7c8e58" }],
      controls: [{ id: "reps", label: "Placas", min: 2, max: 200, def: 24 }, { id: "gap", label: "Junta %", min: 1, max: 30, def: 8 }],
      draw(ctx, N, c, o) {
        // tile mediante celda exacta + createPattern
        const reps = Math.max(2, o.reps | 0);
        const sz = N / reps;
        const cell = document.createElement("canvas");
        cell.width = cell.height = Math.max(4, Math.ceil(sz));
        const x = cell.getContext("2d");
        const gap = cell.width * (o.gap / 100), r = cell.width * 0.18;
        x.fillStyle = c.c2; x.fillRect(0, 0, cell.width, cell.height);
        x.fillStyle = c.c1;
        x.beginPath();
        x.roundRect ? x.roundRect(gap, gap, cell.width - gap * 2, cell.height - gap * 2, r)
                    : x.rect(gap, gap, cell.width - gap * 2, cell.height - gap * 2);
        x.fill();
        const g = x.createRadialGradient(cell.width * 0.35, cell.height * 0.35, 0, cell.width / 2, cell.height / 2, cell.width * 0.7);
        g.addColorStop(0, c.c3); g.addColorStop(1, "transparent");
        x.fillStyle = g; x.globalAlpha = 0.35; x.fill();
        x.globalAlpha = 1;
        tileCell(ctx, N, cell, reps);
      },
    },
    {
      id: "feathers", name: "Plumas", tags: "plumas feathers escamas vegano",
      colors: [{ id: "c1", label: "Base", def: "#0a4a6e" }, { id: "c2", label: "Pluma", def: "#2a8eaa" }, { id: "c3", label: "Borde", def: "#062a40" }],
      controls: [{ id: "reps", label: "Plumas (cols)", min: 2, max: 200, def: 16 }],
      draw(ctx, N, c, o) {
        const cols = snapDivisor(N, Math.max(2, o.reps | 0));
        const rowsAim = snapDivisor(N, Math.max(2, Math.round(cols / 1.1)));
        const cellW = N / cols, cellH = N / rowsAim;
        const cell = document.createElement("canvas");
        cell.width = cellW; cell.height = cellH;
        const x = cell.getContext("2d");
        x.fillStyle = c.c1; x.fillRect(0, 0, cellW, cellH);
        const r = cellW * 0.55;
        const drawFeather = (cx, cy) => {
          const g = x.createRadialGradient(cx, cy + r * 0.4, 0, cx, cy, r);
          g.addColorStop(0, c.c2); g.addColorStop(1, c.c1);
          x.fillStyle = g;
          x.beginPath(); x.arc(cx, cy, r, 0, Math.PI, false); x.fill();
          x.strokeStyle = c.c3; x.lineWidth = 1; x.stroke();
        };
        drawFeather(0, cellH * 0.3); drawFeather(cellW, cellH * 0.3);
        drawFeather(cellW / 2, cellH * 0.8);
        tileCellRect(ctx, N, cell, cols, rowsAim);
      },
    },
    {
      id: "waves", name: "Olas marinas", tags: "olas mar agua japones wave",
      colors: [{ id: "c1", label: "Cielo", def: "#a8d8e8" }, { id: "c2", label: "Mar", def: "#1a5a8c" }, { id: "c3", label: "Espuma", def: "#ffffff" }],
      controls: [{ id: "rows", label: "Filas", min: 2, max: 200, def: 8 }, { id: "peaks", label: "Picos por fila", min: 2, max: 100, def: 6 }],
      draw(ctx, N, c, o) {
        // forzamos peaks par y filas pares para que la onda cierre exactamente en x=0 y x=N,
        // y la fila inferior comparta borde con la superior (sin junta horizontal)
        const peaks = Math.max(2, Math.round(o.peaks / 2) * 2);
        const rows = Math.max(2, o.rows | 0);
        const rowH = N / rows;
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const dx = N / peaks / 6;
        for (let r = 0; r < rows; r++) {
          const y0 = r * rowH;
          ctx.fillStyle = r % 2 === 0 ? c.c2 : c.c1;
          ctx.beginPath();
          ctx.moveTo(0, y0 + rowH);
          for (let x = 0; x <= N; x += dx) {
            const y = y0 + rowH * 0.5 + Math.sin(x / N * Math.PI * 2 * peaks) * rowH * 0.45;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(N, y0 + rowH);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = c.c3; ctx.lineWidth = Math.max(1, rowH * 0.04);
          ctx.beginPath();
          for (let x = 0; x <= N; x += dx) {
            const y = y0 + rowH * 0.5 + Math.sin(x / N * Math.PI * 2 * peaks) * rowH * 0.45;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      },
    },
    {
      id: "bubbles", name: "Burbujas", tags: "burbujas bubbles agua liquido",
      colors: [{ id: "c1", label: "Fondo", def: "#0a2a4a" }, { id: "c2", label: "Burbuja", def: "#aaeeff" }],
      controls: [{ id: "count", label: "Cantidad", min: 30, max: 3000, def: 400 }, { id: "size", label: "Tamaño", min: 4, max: 200, def: 28 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.count; k++) {
          const cx = rng() * N, cy = rng() * N, r = o.size * (0.3 + rng() * 1.5);
          ctx.strokeStyle = c.c2; ctx.lineWidth = Math.max(1, r * 0.06);
          ctx.globalAlpha = 0.5 + rng() * 0.4;
          torusN(ctx, N, cx, cy, r * 1.2, (x, y) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke(); });
        }
        ctx.globalAlpha = 1;
      },
    },

    // --- SCI-FI / TECH ---
    {
      id: "circuit", name: "Circuit PCB", tags: "circuit pcb chip tecnologico electronica",
      colors: [{ id: "c1", label: "Base", def: "#0a2a14" }, { id: "c2", label: "Pista", def: "#3eb852" }, { id: "c3", label: "Pad", def: "#f5c543" }],
      controls: [{ id: "reps", label: "Densidad", min: 4, max: 200, def: 14 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const reps = Math.max(4, o.reps | 0);
        const step = N / reps;
        ctx.strokeStyle = c.c2; ctx.lineWidth = Math.max(1, step * 0.05);
        for (let i = 0; i < reps * reps; i++) {
          const gx = (rng() * reps) | 0;
          const gy = (rng() * reps) | 0;
          const x = gx * step, y = gy * step;
          const horizontal = rng() < 0.5;
          const len = (1 + ((rng() * 4) | 0)) * step;
          // dibujar con torus para que las pistas que salen reaparezcan en el otro lado
          if (horizontal) {
            torusN(ctx, N, x + len / 2, y, len, (px, py) => {
              ctx.beginPath(); ctx.moveTo(px - len / 2, py); ctx.lineTo(px + len / 2, py); ctx.stroke();
            });
          } else {
            torusN(ctx, N, x, y + len / 2, len, (px, py) => {
              ctx.beginPath(); ctx.moveTo(px, py - len / 2); ctx.lineTo(px, py + len / 2); ctx.stroke();
            });
          }
        }
        ctx.fillStyle = c.c3;
        for (let gy = 0; gy < reps; gy++) for (let gx = 0; gx < reps; gx++) {
          if (rng() < 0.15) {
            ctx.beginPath();
            ctx.arc(gx * step + step * 0.5, gy * step + step * 0.5, step * 0.1, 0, 6.2832);
            ctx.fill();
          }
        }
      },
    },
    {
      id: "tron-grid", name: "TRON grid", tags: "tron grid neon cyber futurista",
      colors: [{ id: "c1", label: "Fondo", def: "#000010" }, { id: "c2", label: "Línea", def: "#00f5ff" }],
      controls: [{ id: "reps", label: "Celdas", min: 4, max: 200, def: 16 }, { id: "glow", label: "Glow", min: 0, max: 60, def: 18 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const period = N / o.reps;
        ctx.strokeStyle = c.c2; ctx.lineWidth = Math.max(1, period * 0.04);
        if (o.glow > 0) { ctx.shadowColor = c.c2; ctx.shadowBlur = period * (o.glow / 100); }
        for (let i = 0; i <= o.reps; i++) {
          const p = i * period;
          ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, N); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(N, p); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      },
    },
    {
      id: "nebula", name: "Nebulosa", tags: "nebulosa espacio galaxia clouds estrellas",
      colors: [{ id: "c1", label: "Espacio", def: "#0a0420" }, { id: "c2", label: "Nube 1", def: "#a02a8a" }, { id: "c3", label: "Nube 2", def: "#2a52a0" }, { id: "c4", label: "Estrella", def: "#ffffff" }],
      controls: [{ id: "clouds", label: "Nubes", min: 5, max: 400, def: 30 }, { id: "stars", label: "Estrellas", min: 50, max: 6000, def: 500 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.clouds; k++) {
          const cx = rng() * N, cy = rng() * N, r = N * (0.05 + rng() * 0.15);
          const col = rng() < 0.5 ? c.c2 : c.c3;
          const a = 0.3 + rng() * 0.4;
          torusN(ctx, N, cx, cy, r, (x, y) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, col); g.addColorStop(1, "transparent");
            ctx.fillStyle = g; ctx.globalAlpha = a;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
          });
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.c4;
        for (let k = 0; k < o.stars; k++) {
          const x = rng() * N, y = rng() * N, r = 0.3 + rng() * 2.2;
          ctx.globalAlpha = 0.4 + rng() * 0.6;
          torusN(ctx, N, x, y, r, (px, py) => { ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill(); });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "aurora", name: "Aurora boreal", tags: "aurora boreal northern lights cielo",
      colors: [{ id: "c1", label: "Cielo", def: "#070a1e" }, { id: "c2", label: "Verde", def: "#2effa0" }, { id: "c3", label: "Violeta", def: "#9a2eff" }],
      controls: [{ id: "bands", label: "Bandas", min: 2, max: 200, def: 12 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        // hacemos bands par para que el ciclo verde→violeta empate al tilear
        const bands = Math.max(2, Math.round(o.bands / 2) * 2);
        const unit = N / bands;
        for (let i = 0; i < bands; i++) {
          const y = i * unit;
          const g = ctx.createLinearGradient(0, y, 0, y + unit);
          const col = i % 2 === 0 ? c.c2 : c.c3;
          g.addColorStop(0, "transparent"); g.addColorStop(0.5, col); g.addColorStop(1, "transparent");
          ctx.fillStyle = g; ctx.globalAlpha = 0.4;
          ctx.fillRect(0, y, N, unit + 1);
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "glitch", name: "Glitch", tags: "glitch error digital pixel datamoshing",
      colors: [{ id: "c1", label: "Base", def: "#0a0a0a" }, { id: "c2", label: "RGB R", def: "#ff2c2c" }, { id: "c3", label: "RGB G", def: "#2cff64" }, { id: "c4", label: "RGB B", def: "#2c64ff" }],
      controls: [{ id: "blocks", label: "Bloques", min: 10, max: 2000, def: 80 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const cols = [c.c2, c.c3, c.c4];
        for (let k = 0; k < o.blocks; k++) {
          const cx = rng() * N, cy = rng() * N;
          const w = (rng() * N * 0.5) | 0, h = ((rng() * 12) | 0) + 1;
          const col = cols[(rng() * cols.length) | 0];
          const a = 0.5 + rng() * 0.5;
          ctx.fillStyle = col; ctx.globalAlpha = a;
          // envolvemos para que las barras que cruzan borde reaparezcan en el opuesto
          torusN(ctx, N, cx + w / 2, cy + h / 2, Math.max(w, h), (x, y) => {
            ctx.fillRect(x - w / 2, y - h / 2, w, h);
          });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "vhs-scan", name: "VHS scanlines", tags: "vhs scanlines retro tv crt",
      colors: [{ id: "c1", label: "Base", def: "#1a1014" }, { id: "c2", label: "Scanline", def: "#000000" }, { id: "c3", label: "Tinte", def: "#7a2cf5" }],
      controls: [{ id: "lines", label: "Líneas", min: 30, max: 4000, def: 400 }],
      draw(ctx, N, c, o) {
        // scanline centrada en la celda → fila 0 y fila N-1 son base (no scanline) → sin discontinuidad visible
        const lines = snapDivisor(N, Math.max(4, o.lines | 0));
        const periodPx = N / lines;
        const cell = document.createElement("canvas");
        cell.width = N; cell.height = Math.max(2, Math.ceil(periodPx));
        const x = cell.getContext("2d");
        const g = x.createLinearGradient(0, 0, N, 0);
        g.addColorStop(0, c.c1); g.addColorStop(0.5, shade(c.c3, 0.2)); g.addColorStop(1, c.c1);
        x.fillStyle = g; x.fillRect(0, 0, N, cell.height);
        x.fillStyle = c.c2; x.globalAlpha = 0.45;
        const lineH = Math.max(1, periodPx * 0.4);
        x.fillRect(0, Math.round((cell.height - lineH) / 2), N, Math.round(lineH));
        x.globalAlpha = 1;
        tileCellRect(ctx, N, cell, 1, lines);
      },
    },
    {
      id: "matrix", name: "Matrix rain", tags: "matrix lluvia digital cifras codigo",
      colors: [{ id: "c1", label: "Fondo", def: "#000008" }, { id: "c2", label: "Texto", def: "#00ff52" }],
      controls: [{ id: "cols", label: "Columnas", min: 10, max: 400, def: 60 }, { id: "density", label: "Densidad", min: 20, max: 200, def: 80 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const cols = Math.max(4, o.cols | 0);
        const cw = N / cols;
        ctx.fillStyle = c.c2;
        ctx.font = `${cw * 0.92}px monospace`;
        ctx.textBaseline = "top"; ctx.textAlign = "center";
        const chars = "アイウエオカキクケコサシスセソタチツテト0123456789";
        // posición vertical en celdas; uso `(gy % cols + cols) % cols` para envolver
        for (let gx = 0; gx < cols; gx++) {
          const tailLen = ((rng() * o.density / 4) | 0) + 4;
          const startY = (rng() * cols) | 0;
          for (let i = 0; i < tailLen; i++) {
            const gy = ((startY + i) % cols + cols) % cols;
            ctx.globalAlpha = 1 - (i / tailLen) * 0.85;
            ctx.fillText(chars[(rng() * chars.length) | 0], gx * cw + cw / 2, gy * cw + cw * 0.05);
          }
        }
        ctx.globalAlpha = 1;
      },
    },

    // --- VINTAGE / ARTÍSTICO ---
    {
      id: "paper-crease", name: "Papel arrugado", tags: "papel arrugado paper crease vintage",
      colors: [{ id: "c1", label: "Papel", def: "#e8e0c8" }, { id: "c2", label: "Sombra", def: "#a89870" }],
      controls: [{ id: "creases", label: "Arrugas", min: 10, max: 1500, def: 60 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.strokeStyle = c.c2;
        for (let k = 0; k < o.creases; k++) {
          ctx.globalAlpha = 0.05 + rng() * 0.25;
          ctx.lineWidth = 0.4 + rng() * 1.8;
          const x1 = rng() * N, y1 = rng() * N;
          const dx = (rng() - 0.5) * N * 0.4, dy = (rng() - 0.5) * N * 0.4;
          const len = Math.hypot(dx, dy);
          torusN(ctx, N, x1 + dx / 2, y1 + dy / 2, len, (cx, cy) => {
            ctx.beginPath();
            ctx.moveTo(cx - dx / 2, cy - dy / 2);
            ctx.lineTo(cx + dx / 2, cy + dy / 2);
            ctx.stroke();
          });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "craquelure", name: "Pintura craquelada", tags: "craquelado grietas pintura viejo cracks",
      colors: [{ id: "c1", label: "Pintura", def: "#c8a868" }, { id: "c2", label: "Grieta", def: "#3a2818" }],
      controls: [{ id: "cracks", label: "Grietas", min: 20, max: 2000, def: 200 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.strokeStyle = c.c2;
        ctx.lineWidth = Math.max(0.5, N / 1200);
        ctx.lineCap = "round";
        for (let k = 0; k < o.cracks; k++) {
          const x0 = rng() * N, y0 = rng() * N;
          const segs = 3 + ((rng() * 8) | 0);
          const pts = [[0, 0]];
          let dx = 0, dy = 0;
          for (let i = 0; i < segs; i++) {
            dx += (rng() - 0.5) * N * 0.06;
            dy += (rng() - 0.5) * N * 0.06;
            pts.push([dx, dy]);
          }
          const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
          const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
          const span = Math.max(maxX - minX, maxY - minY);
          ctx.globalAlpha = 0.4 + rng() * 0.5;
          torusN(ctx, N, x0, y0, span, (cx, cy) => {
            ctx.beginPath();
            pts.forEach((p, i) => i === 0 ? ctx.moveTo(cx + p[0], cy + p[1]) : ctx.lineTo(cx + p[0], cy + p[1]));
            ctx.stroke();
          });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "sketch", name: "Sketch a lápiz", tags: "sketch lapiz pencil dibujo hatching",
      colors: [{ id: "c1", label: "Papel", def: "#f0ece0" }, { id: "c2", label: "Trazo", def: "#1a1a1a" }],
      controls: [{ id: "lines", label: "Trazos", min: 50, max: 8000, def: 800 }, { id: "angle", label: "Ángulo", min: 0, max: 180, def: 45 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.strokeStyle = c.c2;
        const ang = o.angle * Math.PI / 180;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        for (let k = 0; k < o.lines; k++) {
          ctx.lineWidth = 0.3 + rng() * 0.9;
          ctx.globalAlpha = 0.15 + rng() * 0.35;
          const x0 = rng() * N, y0 = rng() * N;
          const len = N * 0.03 * (0.5 + rng() * 1.5);
          const ex = dx * len, ey = dy * len;
          torusN(ctx, N, x0 + ex / 2, y0 + ey / 2, len, (cx, cy) => {
            ctx.beginPath(); ctx.moveTo(cx - ex / 2, cy - ey / 2); ctx.lineTo(cx + ex / 2, cy + ey / 2); ctx.stroke();
          });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "watercolor", name: "Acuarela", tags: "acuarela watercolor mancha agua arte",
      colors: [{ id: "c1", label: "Papel", def: "#f4ecdc" }, { id: "c2", label: "Color A", def: "#a82e5e" }, { id: "c3", label: "Color B", def: "#2e7ea8" }],
      controls: [{ id: "spots", label: "Manchas", min: 5, max: 600, def: 30 }, { id: "size", label: "Tamaño", min: 20, max: 1500, def: 200 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.spots; k++) {
          const cx = rng() * N, cy = rng() * N, r = o.size * (0.5 + rng() * 1.4);
          const col = rng() < 0.5 ? c.c2 : c.c3;
          const a = 0.35 + rng() * 0.4;
          // el gradient debe centrarse en la posición torus actual, no en la original
          torusN(ctx, N, cx, cy, r, (x, y) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, col); g.addColorStop(0.6, col); g.addColorStop(1, "transparent");
            ctx.fillStyle = g; ctx.globalAlpha = a;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
          });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "benday", name: "Pop art Benday dots", tags: "pop art benday lichtenstein dots comic",
      colors: [{ id: "c1", label: "Fondo", def: "#ffe35a" }, { id: "c2", label: "Punto", def: "#e8443a" }],
      controls: [{ id: "reps", label: "Repeticiones", min: 8, max: 400, def: 40 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const period = N / o.reps, r = period * 0.32;
        ctx.fillStyle = c.c2;
        for (let gy = 0; gy < o.reps; gy++) for (let gx = 0; gx < o.reps; gx++) {
          torusN(ctx, N, (gx + 0.5) * period, (gy + 0.5) * period, r, (x, y) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); });
        }
      },
    },

    // --- RACING-SPECIFIC ---
    {
      id: "mesh-grill", name: "Rejilla admisión", tags: "rejilla mesh grill admision radiador",
      colors: [{ id: "c1", label: "Fondo", def: "#0a0a0e" }, { id: "c2", label: "Rejilla", def: "#3a3a44" }],
      controls: [{ id: "reps", label: "Celdas", min: 10, max: 400, def: 50 }, { id: "thickness", label: "Grosor %", min: 10, max: 90, def: 50 }],
      draw(ctx, N, c, o) {
        // celda con barra centrada en el borde de cada lado: las mitades de cells
        // adyacentes forman una barra completa al tilear → sin gap residual.
        const reps = snapDivisor(N, Math.max(2, o.reps | 0));
        const cw = N / reps;
        const cell = document.createElement("canvas");
        cell.width = cell.height = Math.max(2, Math.ceil(cw));
        const x = cell.getContext("2d");
        x.fillStyle = c.c1; x.fillRect(0, 0, cell.width, cell.height);
        x.fillStyle = c.c2;
        const t = cw * (o.thickness / 100), h = t / 2;
        x.fillRect(0, 0, h, cell.height);
        x.fillRect(cell.width - h, 0, h, cell.height);
        x.fillRect(0, 0, cell.width, h);
        x.fillRect(0, cell.height - h, cell.width, h);
        tileCell(ctx, N, cell, reps);
      },
    },
    {
      id: "tire-tracks", name: "Marcas de neumático", tags: "marcas neumatico tire tracks goma",
      colors: [{ id: "c1", label: "Pista", def: "#3a3a3e" }, { id: "c2", label: "Marca", def: "#0a0a0e" }],
      controls: [{ id: "tracks", label: "Marcas", min: 2, max: 200, def: 10 }, { id: "size", label: "Patrón", min: 5, max: 400, def: 30 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        // verticales perfectas (sin rotar) para que tile en y, distribuidas en x
        for (let t = 0; t < o.tracks; t++) {
          const xc = rng() * N;
          for (let y = 0; y < N; y += o.size * 0.8) {
            ctx.globalAlpha = 0.5 + rng() * 0.4;
            torusN(ctx, N, xc, y + o.size * 0.25, o.size, (px, py) => {
              ctx.fillRect(px - o.size * 0.3, py - o.size * 0.25, o.size * 0.6, o.size * 0.5);
            });
          }
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "rubber-streak", name: "Rubber streaks", tags: "rubber streaks marcas derrape goma quemada",
      colors: [{ id: "c1", label: "Asfalto", def: "#2a2a30" }, { id: "c2", label: "Goma", def: "#0a0a0a" }],
      controls: [{ id: "streaks", label: "Líneas", min: 4, max: 800, def: 30 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.strokeStyle = c.c2; ctx.lineCap = "butt";
        // verticales exactas: el x final = x inicial → tile vertical limpio
        for (let k = 0; k < o.streaks; k++) {
          const x = rng() * N;
          const w = N * 0.005 + rng() * N * 0.02;
          ctx.lineWidth = w;
          ctx.globalAlpha = 0.3 + rng() * 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, N); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "burnt-oil", name: "Aceite quemado", tags: "aceite quemado mancha negra oil burn",
      colors: [{ id: "c1", label: "Base", def: "#48422c" }, { id: "c2", label: "Mancha", def: "#0a0a06" }],
      controls: [{ id: "spots", label: "Manchas", min: 5, max: 800, def: 40 }, { id: "size", label: "Tamaño", min: 10, max: 1500, def: 80 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.spots; k++) {
          const cx = rng() * N, cy = rng() * N, r = o.size * (0.4 + rng() * 1.4);
          const a = 0.6 + rng() * 0.3;
          torusN(ctx, N, cx, cy, r, (x, y) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, c.c2); g.addColorStop(0.6, shade(c.c2, 0.3)); g.addColorStop(1, "transparent");
            ctx.fillStyle = g; ctx.globalAlpha = a;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
          });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "splitter-rays", name: "Splitter rays", tags: "splitter rays radial racing dynamic",
      colors: [{ id: "c1", label: "Fondo", def: "#0a0a14" }, { id: "c2", label: "Rayo", def: "#e8443a" }],
      controls: [{ id: "reps", label: "Centros", min: 1, max: 40, def: 4 }, { id: "rays", label: "Rayos por centro", min: 4, max: 80, def: 16 }],
      draw(ctx, N, c, o) {
        // rejilla de mini splitters → tileable. Un único centro fijo en el lienzo no tilea.
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        const reps = Math.max(1, o.reps | 0);
        const cw = N / reps;
        const half = cw / 2;
        for (let gy = 0; gy < reps; gy++) for (let gx = 0; gx < reps; gx++) {
          const cx = (gx + 0.5) * cw, cy = (gy + 0.5) * cw;
          for (let i = 0; i < o.rays; i += 2) {
            const a = (i / o.rays) * Math.PI * 2, da = Math.PI / o.rays;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a - da) * half, cy + Math.sin(a - da) * half);
            ctx.lineTo(cx + Math.cos(a + da) * half, cy + Math.sin(a + da) * half);
            ctx.closePath(); ctx.fill();
          }
        }
      },
    },

    // --- EXTRA: MISC ---
    {
      id: "bricks", name: "Ladrillo", tags: "ladrillo brick muro pared",
      colors: [{ id: "c1", label: "Ladrillo", def: "#a04830" }, { id: "c2", label: "Mortero", def: "#dcd6c4" }],
      controls: [{ id: "reps", label: "Filas", min: 4, max: 200, def: 20 }, { id: "gap", label: "Mortero (px)", min: 1, max: 30, def: 3 }],
      draw(ctx, N, c, o) {
        // celda de 2 filas (par+impar). rows/cols snapeados a divisores exactos.
        const cells = snapDivisor(N, Math.max(1, Math.round(o.reps / 2)));
        const cellH = N / cells * 2; // alto de 2 filas
        const ratio = 2.2;
        const cols = snapDivisor(N, Math.max(1, Math.round(N / (cellH * ratio / 2))));
        const cellW = N / cols;
        const cell = document.createElement("canvas");
        cell.width = Math.max(4, Math.ceil(cellW));
        cell.height = Math.max(4, Math.ceil(cellH));
        const x = cell.getContext("2d");
        const w = cell.width, hr = cell.height / 2;
        x.fillStyle = c.c2; x.fillRect(0, 0, w, hr * 2);
        x.fillStyle = c.c1;
        // fila superior
        x.fillRect(o.gap, o.gap, w - o.gap * 2, hr - o.gap * 2);
        // fila inferior con offset w/2 (dos mitades a izq/der)
        x.fillRect(-w / 2 + o.gap, hr + o.gap, w / 2 - o.gap * 2, hr - o.gap * 2);
        x.fillRect(w / 2 + o.gap, hr + o.gap, w / 2 - o.gap * 2, hr - o.gap * 2);
        tileCellRect(ctx, N, cell, cols, cells);
      },
    },
    {
      id: "cobblestone", name: "Adoquines", tags: "adoquin cobblestone calle piedra",
      colors: [{ id: "c1", label: "Mortero", def: "#1c1a14" }, { id: "c2", label: "Piedra", def: "#7a766a" }, { id: "c3", label: "Brillo", def: "#a8a498" }],
      controls: [{ id: "size", label: "Tamaño", min: 10, max: 500, def: 80 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const sz = o.size;
        for (let y = 0; y < N; y += sz * 0.85) {
          const off = ((y / sz) | 0) % 2 ? sz / 2 : 0;
          for (let x = -sz; x < N + sz; x += sz) {
            const cx = x + off + sz / 2, cy = y + sz / 2;
            const r = sz * 0.42 * (0.85 + rng() * 0.25);
            const pts = blobOffsets(rng, r, 7, 0.25);
            ctx.fillStyle = rng() < 0.5 ? c.c2 : c.c3;
            torusN(ctx, N, cx, cy, r, (px, py) => fillBlob(ctx, px, py, pts));
          }
        }
      },
    },
    {
      id: "asphalt", name: "Asfalto", tags: "asfalto asphalt road carretera grava",
      colors: [{ id: "c1", label: "Base", def: "#2a2a2e" }, { id: "c2", label: "Grava", def: "#1a1a1c" }, { id: "c3", label: "Brillo", def: "#5a5a60" }],
      controls: [{ id: "grain", label: "Grava", min: 200, max: 10000, def: 2500 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.grain; k++) {
          const x = rng() * N, y = rng() * N, r = 0.6 + rng() * 2.4;
          ctx.fillStyle = rng() < 0.5 ? c.c2 : c.c3;
          ctx.globalAlpha = 0.3 + rng() * 0.5;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "bokeh", name: "Bokeh", tags: "bokeh luces desenfocadas circulos light",
      colors: [{ id: "c1", label: "Fondo", def: "#0a0420" }, { id: "c2", label: "Luz", def: "#f5c543" }, { id: "c3", label: "Luz 2", def: "#a82a8e" }],
      controls: [{ id: "lights", label: "Luces", min: 10, max: 1500, def: 80 }, { id: "size", label: "Tamaño", min: 10, max: 1500, def: 80 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        for (let k = 0; k < o.lights; k++) {
          const cx = rng() * N, cy = rng() * N, r = o.size * (0.3 + rng() * 1.4);
          const col = rng() < 0.5 ? c.c2 : c.c3;
          const a = 0.3 + rng() * 0.4;
          torusN(ctx, N, cx, cy, r, (x, y) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, col); g.addColorStop(0.8, "transparent");
            ctx.fillStyle = g; ctx.globalAlpha = a;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
          });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "confetti", name: "Confetti", tags: "confetti fiesta carnaval color papelitos",
      colors: [{ id: "c1", label: "Fondo", def: "#ffffff" }, { id: "c2", label: "A", def: "#e8443a" }, { id: "c3", label: "B", def: "#2a9df4" }, { id: "c4", label: "C", def: "#f5c543" }],
      controls: [{ id: "pieces", label: "Trozos", min: 100, max: 8000, def: 1200 }, { id: "size", label: "Tamaño", min: 2, max: 80, def: 6 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const cols = [c.c2, c.c3, c.c4];
        for (let k = 0; k < o.pieces; k++) {
          const cx = rng() * N, cy = rng() * N, w = o.size * (0.5 + rng()), h = w * 0.4;
          const rot = rng() * Math.PI;
          const col = cols[(rng() * cols.length) | 0];
          torusN(ctx, N, cx, cy, w, (x, y) => {
            ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
            ctx.fillStyle = col;
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.restore();
          });
        }
      },
    },
    {
      id: "tweed", name: "Tela tweed", tags: "tweed tela telar lana hilo",
      colors: [{ id: "c1", label: "Color A", def: "#46362a" }, { id: "c2", label: "Color B", def: "#a89878" }, { id: "c3", label: "Hilo", def: "#7c5c3a" }],
      controls: [{ id: "reps", label: "Pixeles", min: 8, max: 800, def: 100 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        const cols = [c.c1, c.c2, c.c3];
        const reps = Math.max(2, o.reps | 0);
        const sz = N / reps;
        // dibujamos a período exacto N/reps en floor/round → tile coherente
        for (let gy = 0; gy < reps; gy++) for (let gx = 0; gx < reps; gx++) {
          ctx.fillStyle = cols[(rng() * cols.length) | 0];
          ctx.fillRect(Math.round(gx * sz), Math.round(gy * sz), Math.ceil(sz) + 1, Math.ceil(sz) + 1);
        }
      },
    },
    {
      id: "gears", name: "Engranajes", tags: "engranajes gears mecanico steampunk",
      colors: [{ id: "c1", label: "Fondo", def: "#1c1c20" }, { id: "c2", label: "Engranaje", def: "#a87a30" }],
      controls: [{ id: "reps", label: "Cantidad", min: 2, max: 60, def: 6 }, { id: "teeth", label: "Dientes", min: 6, max: 60, def: 16 }],
      draw(ctx, N, c, o) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        const reps = Math.max(2, o.reps | 0);
        const period = N / reps;
        const r = period * 0.32; // un poco más pequeño para que los dientes no toquen el borde de la celda
        for (let gy = 0; gy < reps; gy++) for (let gx = 0; gx < reps; gx++) {
          const cx = (gx + 0.5) * period, cy = (gy + 0.5) * period;
          ctx.fillStyle = c.c2;
          ctx.beginPath();
          for (let i = 0; i < o.teeth * 2; i++) {
            const a = (i / (o.teeth * 2)) * Math.PI * 2;
            const rr = i % 2 ? r : r * 1.18;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = c.c1; ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, 6.2832); ctx.fill();
        }
      },
    },
    {
      id: "stars-shiny", name: "Estrellas brillantes", tags: "estrellas stars sparkle brillo",
      colors: [{ id: "c1", label: "Fondo", def: "#0a0420" }, { id: "c2", label: "Estrella", def: "#ffffff" }],
      controls: [{ id: "count", label: "Estrellas", min: 30, max: 6000, def: 300 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.strokeStyle = c.c2; ctx.fillStyle = c.c2;
        for (let k = 0; k < o.count; k++) {
          const cx = rng() * N, cy = rng() * N, r = 0.5 + rng() * 4;
          const a = 0.4 + rng() * 0.6;
          const cross = rng() < 0.3;
          torusN(ctx, N, cx, cy, r * 4, (x, y) => {
            ctx.globalAlpha = a;
            ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
            if (cross) {
              ctx.lineWidth = r * 0.3;
              ctx.beginPath();
              ctx.moveTo(x - r * 4, y); ctx.lineTo(x + r * 4, y);
              ctx.moveTo(x, y - r * 4); ctx.lineTo(x, y + r * 4);
              ctx.stroke();
            }
          });
        }
        ctx.globalAlpha = 1;
      },
    },
    {
      id: "drip", name: "Gotas de pintura", tags: "drip drop gotas pintura goteo",
      colors: [{ id: "c1", label: "Fondo", def: "#ffffff" }, { id: "c2", label: "Pintura", def: "#e8443a" }],
      controls: [{ id: "drips", label: "Gotas", min: 5, max: 400, def: 30 }, { id: "length", label: "Longitud %", min: 10, max: 90, def: 50 }],
      organic: true,
      draw(ctx, N, c, o, rng) {
        ctx.fillStyle = c.c1; ctx.fillRect(0, 0, N, N);
        ctx.fillStyle = c.c2;
        for (let k = 0; k < o.drips; k++) {
          const x = rng() * N, w = N * 0.01 + rng() * N * 0.05;
          const len = Math.min(N * 0.7, N * (o.length / 100) * (0.5 + rng()));
          const headR = w * 1.2;
          // ubicar la gota completa (rect + cabeza) DENTRO del lienzo para tile vertical seguro
          const yTop = rng() * (N - len - headR * 2);
          torusN(ctx, N, x, yTop + len / 2 + headR, Math.max(headR, len), (px, py) => {
            ctx.fillRect(px - w / 2, py - len / 2 - headR, w, len);
            ctx.beginPath(); ctx.arc(px, py + len / 2 - headR + len / 2, headR, 0, 6.2832); ctx.fill();
          });
        }
      },
    },

    // ====== BLEND DE 2 PATRONES ======
    {
      id: "_blend", name: "Mezcla 2 patrones", tags: "blend mezcla overlay multiply mix desgaste",
      colors: [],
      controls: [
        { id: "patA", label: "Patrón base", min: 0, max: 0, def: 0 },
        { id: "patB", label: "Patrón overlay", min: 0, max: 0, def: 0 },
        { id: "mode", label: "Modo", min: 0, max: 0, def: 0 },
        { id: "alpha", label: "Opacidad overlay (%)", min: 0, max: 100, def: 75 },
      ],
      isBlend: true,
      draw(ctx, N, c, o, rng) {
        const A = BY_ID[o.patA || "carbon-twill"];
        const B = BY_ID[o.patB || "grunge"];
        if (!A || !B) return;
        // base
        A.draw(ctx, N, stateFor(A).colors, stateFor(A).opts, rng32(seed ^ 0x9e3779b1));
        // overlay
        const tmp = document.createElement("canvas");
        tmp.width = tmp.height = N;
        const tctx = tmp.getContext("2d");
        B.draw(tctx, N, stateFor(B).colors, stateFor(B).opts, rng32(seed ^ 0xbeef0001));
        ctx.save();
        ctx.globalAlpha = (o.alpha || 75) / 100;
        ctx.globalCompositeOperation = o.mode || "overlay";
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();
      },
    },
  ];
  const BY_ID = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));

  // ---------------- estado ----------------
  let curId = PATTERNS[0].id;
  let seed = 12345;
  const memo = {}; // id -> {colors, opts}

  function stateFor(p) {
    if (!memo[p.id]) {
      const colors = {}; p.colors.forEach((c) => (colors[c.id] = c.def));
      const opts = {}; p.controls.forEach((c) => (opts[c.id] = c.def));
      if (p.isBlend) {
        opts.patA = "carbon-twill"; opts.patB = "grunge"; opts.mode = "overlay"; opts.alpha = 75;
      }
      memo[p.id] = { colors, opts };
    }
    return memo[p.id];
  }

  // ---------------- render del tile ----------------
  function renderInto(canvas, p, st, N) {
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext("2d");
    p.draw(ctx, N, st.colors, st.opts, rng32(seed ^ (N * 2654435761)));
  }

  let curUrl = null;
  function render() {
    const p = BY_ID[curId], st = stateFor(p), N = +$("#tex-size").value;
    const cv = $("#tex-canvas");
    renderInto(cv, p, st, N);
    curUrl = cv.toDataURL("image/png");
    const prev = $("#tex-preview");
    prev.style.backgroundImage = `url(${curUrl})`;
    prev.style.backgroundSize = Math.max(120, N / 3) + "px";
    prev.style.backgroundRepeat = "repeat";
  }

  // ---------------- UI dinámica ----------------
  function buildThumbs(filter) {
    const wrap = $("#tex-thumbs");
    wrap.innerHTML = "";
    const f = (filter || "").toLowerCase().trim();
    PATTERNS.filter((p) => !f || p.name.toLowerCase().includes(f) || (p.tags || "").includes(f)).forEach((p) => {
      const b = document.createElement("button");
      b.className = "tex-thumb" + (p.id === curId ? " sel" : "");
      b.title = p.name;
      const cv = document.createElement("canvas");
      renderInto(cv, p, stateFor(p), 64);
      b.appendChild(cv);
      const lb = document.createElement("span"); lb.textContent = p.name; b.appendChild(lb);
      b.addEventListener("click", () => selectPattern(p.id));
      wrap.appendChild(b);
    });
    if (!wrap.children.length) wrap.innerHTML = '<div class="empty">Sin patrones para "' + filter + '"</div>';
  }

  function selectPattern(id) {
    curId = id;
    document.querySelectorAll(".tex-thumb").forEach((t) => t.classList.toggle("sel", t.title === BY_ID[id].name));
    buildControls();
    render();
  }

  function buildControls() {
    const p = BY_ID[curId], st = stateFor(p);
    // colores
    const cbox = $("#tex-colors"); cbox.innerHTML = "";
    p.colors.forEach((cd) => {
      const w = document.createElement("label"); w.className = "tex-cinput";
      const inp = document.createElement("input"); inp.type = "color"; inp.value = st.colors[cd.id];
      inp.addEventListener("input", () => { st.colors[cd.id] = inp.value; render(); });
      const sp = document.createElement("span"); sp.textContent = cd.label;
      w.append(inp, sp); cbox.appendChild(w);
    });
    // presets
    const pbox = $("#tex-presets"); pbox.innerHTML = "";
    if (p.presets) {
      p.presets.forEach((pr) => {
        const b = document.createElement("button"); b.className = "btn small"; b.textContent = pr.name;
        b.addEventListener("click", () => {
          Object.assign(st.colors, pr.colors || {}); Object.assign(st.opts, pr.opts || {});
          buildControls(); render();
        });
        pbox.appendChild(b);
      });
    }
    // sliders / selects
    const sbox = $("#tex-controls"); sbox.innerHTML = "";
    if (p.isBlend) {
      const choices = PATTERNS.filter((x) => !x.isBlend).map((x) => [x.id, x.name]);
      const modes = [["overlay", "Overlay"], ["multiply", "Multiply"], ["screen", "Screen"], ["darken", "Darken"], ["lighten", "Lighten"], ["soft-light", "Soft light"], ["hard-light", "Hard light"], ["color-dodge", "Dodge"], ["color-burn", "Burn"]];
      const mkSelect = (label, key, options) => {
        const row = document.createElement("div"); row.className = "tex-slider";
        const lab = document.createElement("label"); lab.textContent = label;
        const sel = document.createElement("select"); sel.style.width = "100%";
        options.forEach(([val, lbl]) => {
          const op = document.createElement("option"); op.value = val; op.textContent = lbl;
          if (val === st.opts[key]) op.selected = true;
          sel.appendChild(op);
        });
        sel.addEventListener("change", () => { st.opts[key] = sel.value; render(); });
        row.append(lab, sel); sbox.appendChild(row);
      };
      mkSelect("Patrón base", "patA", choices);
      mkSelect("Patrón overlay", "patB", choices);
      mkSelect("Modo blend", "mode", modes);
      // alpha slider
      const cd = p.controls.find((x) => x.id === "alpha");
      if (cd) {
        const row = document.createElement("div"); row.className = "tex-slider";
        const lab = document.createElement("label"); lab.innerHTML = `${cd.label} <b>${st.opts.alpha}</b>`;
        const inp = document.createElement("input"); inp.type = "range";
        inp.min = cd.min; inp.max = cd.max; inp.step = 1; inp.value = st.opts.alpha;
        inp.addEventListener("input", () => { st.opts.alpha = +inp.value; lab.querySelector("b").textContent = inp.value; render(); });
        row.append(lab, inp); sbox.appendChild(row);
      }
    } else {
      p.controls.forEach((cd) => {
        const row = document.createElement("div"); row.className = "tex-slider";
        const lab = document.createElement("label"); lab.innerHTML = `${cd.label} <b>${st.opts[cd.id]}</b>`;
        const inp = document.createElement("input"); inp.type = "range";
        inp.min = cd.min; inp.max = cd.max; inp.step = cd.step || 1; inp.value = st.opts[cd.id];
        inp.addEventListener("input", () => { st.opts[cd.id] = +inp.value; lab.querySelector("b").textContent = inp.value; render(); });
        row.append(lab, inp); sbox.appendChild(row);
      });
    }
    // botón variar (solo orgánicos)
    $("#tex-shuffle").style.display = p.organic ? "" : "none";
  }

  // ---------------- acciones ----------------
  $("#tex-search").addEventListener("input", (e) => buildThumbs(e.target.value));
  $("#tex-size").addEventListener("change", render);
  $("#tex-shuffle").addEventListener("click", () => { seed = (Math.random() * 1e9) | 0; buildThumbs($("#tex-search").value); render(); });

  $("#tex-palette").addEventListener("click", async () => {
    const { palettes } = await store.get({ palettes: [] });
    const { activePalette } = await store.get({ activePalette: null });
    const pal = palettes.find((p) => p.id === activePalette) || palettes[0];
    if (!pal || !pal.colors.length) return toast("No hay paleta activa con colores", true);
    const p = BY_ID[curId], st = stateFor(p);
    p.colors.forEach((cd, i) => { if (pal.colors[i]) st.colors[cd.id] = pal.colors[i]; });
    buildControls(); render();
    toast("Colores de “" + pal.name + "” aplicados");
  });

  $("#tex-dl").addEventListener("click", () => {
    if (!curUrl) render();
    const a = document.createElement("a");
    a.href = curUrl; a.download = `textura_${curId}_${$("#tex-size").value}.png`; a.click();
    toast("Textura descargada");
  });

  $("#tex-tp").addEventListener("click", async () => {
    if (!curUrl) render();
    if (!IS_EXT) return toast("Solo disponible como extensión", true);
    const filename = `textura_${curId}.png`;
    const n = await TPC.enqueueInject({ dataUrl: curUrl, mime: "image/png", filename, name: "textura " + BY_ID[curId].name });
    const onTP = await TPC.focusTradingPaintsTab();
    toast(onTP ? `Textura en cola (${n}) · se añade al formulario` : `Abriendo TP · ${n} en cola`);
  });

  // init
  buildThumbs("");
  buildControls();
  render();
  window.Textures = { render };
})();
