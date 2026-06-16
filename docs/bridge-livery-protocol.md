# Puente TP Companion ↔ iRacing Livery Creator — diseño del protocolo `livery://`

> Estado: **propuesta para revisar. Nada implementado.** · Fecha: 2026-06-13

## 1. Objetivo
Pasar **paletas de color** y **logos** desde la extensión TP Companion (navegador) a la app de escritorio iRacing Livery Creator (Electron), disparado con `livery://`. El flujo principal es extensión → editor; bidireccional (devolver del editor a la extensión) es deseable pero secundario.

## 2. Qué expone hoy cada lado (resultado de la inspección)

**iRacing Livery Creator** (Electron 31 · `main.js` + `preload.js` + `src/app.js` con fabric.js):
- Una sola ventana. `contextIsolation: true`, `nodeIntegration: false`, `preload.js` con `contextBridge`. Postura de seguridad correcta: el protocolo se maneja en *main* y se reenvía al *renderer* por IPC.
- **No** registra ningún custom protocol todavía, **ni** `requestSingleInstanceLock()`. Hay que añadir ambos.
- Sumidero de logos ya listo: `addSponsorFromDataUrl(dataUrl, name)` (`app.js:382`) mete una imagen al lienzo desde un data URL. Es el punto de entrada natural para un logo entrante. También existe el panel "Sponsors" (`BUILTIN_SPONSORS`, `renderSponsors`).
- Color: **no hay concepto de paleta**. Solo dos `<input type="color">` (`#fill-color`, `#stroke-color`); `$fillColor` aplica `fill` al objeto activo. Recibir una paleta implica **añadir una UI mínima de swatches** (no existe hoy).
- Persistencia: store KV en `Documents/iRacing/livery-creator-settings.json` (`store:get/set`). Sirve para guardar el token de emparejamiento de la Fase 2.

**TP Companion** (extensión MV3):
- `background.js` ya hace `fetchDataUrl` (trae cualquier imagen cross-origin → data URL base64) y `download`.
- `panel.js`: paletas = `[{id, name, colors:[hex]}]`; logos del catálogo = URLs de Commons; ya genera data URLs y quita fondo blanco. O sea, puede entregar `{palette, logos}` sin trabajo extra.
- Límite clave: una extensión **no puede lanzar** una app de escritorio salvo abriendo una URL de protocolo (`livery://…`), y **no puede escribir** ficheros arbitrarios (solo `chrome.downloads` → carpeta Descargas).

## 3. El problema de transporte
`livery://` es un *deep link*: el navegador pide al SO que abra el handler (la app Electron) pasándole **la URL como argumento**. Bien para datos pequeños (una paleta son ~50 bytes). Mal para:
- **Logos binarios** (PNG de decenas–cientos de KB, sobre todo los que la extensión ya procesó: fondo quitado, subidos por archivo). No caben de forma fiable en argv/URL (límite práctico ~2 KB; en Windows la línea de comandos peta antes de los 8 KB).
- **Confirmación / vuelta**: un deep link es unidireccional y sin acuse.

Conclusión: `livery://` resuelve **lanzar/enfocar** la app y llevar **datos pequeños**; para binarios y bidireccional hace falta un segundo canal.

## 4. Opciones de transporte

| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| **A. Solo `livery://`** (payload en la URL) | Paleta + *referencias* de logo (URL de Commons / id de catálogo); la app descarga los logos por su cuenta | Cero infra, sin servidor, instalación mínima | No lleva logos binarios ya procesados; unidireccional; sin acuse; la app necesita red |
| **B. `livery://` lanza + HTTP loopback para datos** *(recomendada)* | `livery://` enfoca/abre la app; los datos (paleta + logos base64) van por `POST http://127.0.0.1:PORT` | Binarios sin problema; bidireccional; acuse real; rápido | Servidor HTTP local en Electron; permiso de host en la extensión; requiere app abierta (lo resuelve el paso de lanzamiento); cuidado con seguridad (§6) |
| **C. Handoff por ficheros** | La extensión descarga manifest + PNGs a Descargas; `livery://import?token=…`; la app lee la carpeta | Sin servidor; soporta binarios | La extensión no sabe la ruta absoluta de Descargas; limpieza incómoda; carrera de lectura |
| **D. Native messaging** | Host nativo registrado; extensión ↔ binario por stdio | Canal oficial de Chrome, bidireccional, sin puerto abierto | No usa `livery://`; hay que instalar un manifest de host nativo apuntando a un binario; más fontanería |

**Recomendación: B**, entregada por fases, usando el subconjunto **A como Fase 1** (cubre el caso más común —mandar una paleta y logos estándar— sin añadir servidor).

## 5. Diseño recomendado (híbrido por fases)

### Fase 1 — `livery://` con paleta + referencias (MVP, sin servidor)
URL:
```
livery://import?v=1&palette=e8443a,14181f,f5c543&logos=<JSON url-encoded>
```
- `palette`: hex separados por coma (sin `#`).
- `logos`: JSON url-encoded de `[{"name":"Castrol","url":"https://commons.../Castrol.svg"}]` (referencias, no binario).
- Si crece, usar un único parámetro `d=` con el JSON canónico (§5.3) en base64url. Sigue limitado a ~2 KB.

Flujo:
1. Popup → botón **"Enviar a Livery Creator"**. Construye la URL y la abre con `chrome.tabs.create({ url })`.
2. Brave muestra el diálogo "¿Abrir iRacing Livery Creator?" (la 1ª vez; se puede recordar).
3. `main.js`: `app.setAsDefaultProtocolClient('livery')` + `requestSingleInstanceLock()` + handler `second-instance` (Windows entrega la URL en `argv`). Parsear, validar `v`, `webContents.send('livery:import', payload)`.
4. `preload.js`: exponer `livery.onImport(cb)` (`ipcRenderer.on('livery:import', …)`).
5. `app.js`: al recibir → **mostrar preview** (paleta + logos) y, al confirmar, aplicar: paleta → nueva UI de swatches; cada `logo.url` → `fetch` en *main* (evita CORS) → `addSponsorFromDataUrl`.

### Fase 2 — HTTP loopback para binarios y vuelta
- La app levanta `http.createServer` en `127.0.0.1:PORT` (puerto fijo, p.ej. 47615, o rango con descubrimiento vía `/ping`).
- Endpoints: `POST /import` (paleta + logos base64), `GET /ping` (¿viva? + versión), opcional `GET /export` (estado del editor → extensión).
- Extensión: el popup intenta `POST` directo; si falla (app cerrada) dispara `livery://focus`, espera y reintenta. Permiso `http://127.0.0.1/*` en `host_permissions` (o `optional_host_permissions`).
- Cubre logos con fondo quitado / subidos por archivo y da acuse real ("3 logos añadidos").

### 5.3 Esquema de payload canónico (vale para URL `d=` y para POST)
```json
{
  "v": 1,
  "source": "tp-companion",
  "kind": "import",
  "palette": { "name": "Mi GT3", "colors": ["#e8443a", "#14181f", "#f5c543"] },
  "logos": [
    { "name": "Castrol", "url": "https://commons.wikimedia.org/.../Castrol.svg" },
    { "name": "Sponsor propio", "mime": "image/png", "dataUrl": "data:image/png;base64,..." }
  ]
}
```
Reglas: cada logo lleva `url` **o** `dataUrl`. En Fase 1 solo `url`. `palette.colors` en hex con `#`.

## 6. Seguridad
- **`livery://`**: cualquier web puede disparar `livery://import?...`. Mitigación: la app **siempre muestra preview y pide confirmar** antes de aplicar; validar `v` y descartar lo malformado; aceptar solo color/imagen (nunca rutas ni nada ejecutable); rate-limit.
- **Loopback HTTP** (Fase 2): cualquier web que visites podría hacer `POST` a `127.0.0.1:PORT`. Mitigaciones combinadas:
  - Bind solo a `127.0.0.1` (no `0.0.0.0`).
  - **Allowlist de Origin**: aceptar solo `Origin: chrome-extension://<ID de TP Companion>`; CORS cerrado al resto.
  - **Token de emparejamiento**: la app genera un token al primer arranque (en `livery-creator-settings.json`); se empareja una vez con la extensión (la app enseña un código que pegas en el popup, o el token viaja en el primer `livery://pair?token=…`). Todo `POST` debe traerlo en cabecera; sin token válido → 403.
  - Confirmación visual igual que en `livery://`.
- **Electron**: el protocolo se procesa en *main* y se reenvía **saneado** por IPC; el renderer mantiene `contextIsolation`. Nunca pasar el payload crudo a `eval`/DOM sin validar.

## 7. Cambios por repo (resumen, sin implementar aún)

**iRacing Livery Creator:**
- `main.js`: `setAsDefaultProtocolClient('livery')`, single-instance lock + `second-instance`, parseo de `argv` en primer arranque, `webContents.send('livery:import', …)`. (Fase 2: servidor loopback + token.)
- `preload.js`: `contextBridge` → `livery.onImport(cb)` (+ Fase 2 `livery.getToken()`).
- `src/app.js` + `index.html`: **UI de paleta/swatches nueva**, modal de preview de import, y reuso de `addSponsorFromDataUrl` para logos. Para empaquetar (fuera de `electron .`) hace falta registrar el protocolo con la ruta del exe o config de electron-builder.

**TP Companion:**
- `panel.js`: botón "Enviar a Livery Creator" en paletas y en el buscador/repositorio de logos; construir la URL `livery://` (Fase 1) y/o el `POST` loopback con reintento tras lanzar (Fase 2).
- `manifest.json`: Fase 2 → `host_permissions` (u `optional_host_permissions`) `http://127.0.0.1/*`.
- `background.js`: ya tiene `fetchDataUrl`; reutilizable para preparar logos.

## 8. Decisiones abiertas
1. ¿Arrancamos por **Fase 1** (`livery://` con paleta + logos por URL, cero servidor) y dejamos el loopback para cuando lo necesites con logos procesados? *(recomendado)*
2. ¿La app **pide confirmación con preview** en cada import, o aplica directo? *(recomiendo preview, al menos al principio)*
3. Logos entrantes: ¿al lienzo directo (`addSponsorFromDataUrl`) o a una bandeja "Recibidos" para colocarlos tú?
4. Empaquetado: ¿la app corre siempre como `electron .` en dev, o vas a empaquetarla con electron-builder? Cambia cómo se registra el protocolo.
