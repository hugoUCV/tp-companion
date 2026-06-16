# TP Companion

Extensión de navegador (Chrome / Edge, Manifest V3) que complementa **Trading Paints Pro**:

1. **Colores** — historial automático de los colores que usas en tradingpaints.com (Paint Builder incluido), paletas con nombre, cuentagotas, extractor de paleta desde imagen, paletas icónicas, armonías/contraste y **biblioteca de códigos de pintura reales**.
2. **Logos** — repositorio de logos típicos del simracing con descarga a un click y envío directo al formulario de subida de Trading Paints. Buscador web, packs, biblioteca personal, y botón **🪄 Taller** para abrir cualquier logo en el Estudio y retocarlo.
3. **Estudio** (botón ⛶ en el popup → pestaña a pantalla completa) — herramientas con espacio: taller de logos (contorno + recorte + quitar fondo), generador de texturas tileable (sin costura) y tablero de referencias.

## Instalación (modo desarrollador)

1. Abre `chrome://extensions` (o `edge://extensions`).
2. Activa **Modo de desarrollador** (interruptor arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige esta carpeta (`Documents\tp-companion`).
4. Fija el icono de TP Companion en la barra para tenerlo a mano.

## Uso

### Colores
- Navega y pinta en tradingpaints.com con normalidad: cada color que confirmes en un selector o campo hex se guarda solo en el historial (máx. 300, sin duplicados).
- **Paint Builder**: su picker es React/MUI y no dispara eventos DOM al cambiar color, así que el content script **sondea el campo hex** (`input[placeholder="#------"]`, uno por capa) y registra cualquier color que se asiente ~350 ms. Se puede desactivar desde los ajustes.
- **Ajustes** (pie del popup): activar/desactivar el widget flotante 🎨 en Trading Paints y la captura automática de colores (`settings.widgetEnabled` / `settings.captureEnabled`, que el content script honra al vuelo).
- En la web verás un botón flotante 🎨 abajo a la derecha: abre los últimos colores, y el botón **Capturar** lanza el cuentagotas del navegador para coger cualquier color del Paint Builder (o de un showroom que te guste). Click en un color = hex copiado.
- En el popup de la extensión (pestaña **Colores**): crea paletas, añade colores desde el historial con el botón ＋ de cada color, copia la lista de hex o exporta la paleta a JSON.
- **🖼 Extraer paleta de una imagen**: sube cualquier foto y saca sus 8 colores dominantes (median cut), con un click los conviertes en paleta.
- **🏁 Paletas icónicas**: Gulf, Martini, JPS, Castrol, Jägermeister, Repsol, Red Bull, Petronas, Alpine y Rosso corsa, clonables a tus paletas.
- **🛠 Armonías y contraste**: complementario/análogos/tríada/sombras de cualquier color, y chequeo de legibilidad fondo-dorsal con ratio WCAG.

### Logos
- **🔎 Buscador**: escribes la marca y busca en tres fuentes a la vez (archivos de Wikimedia Commons, archivos de Wikipedia y las imágenes del artículo de Wikipedia de la marca, donde suele estar el logo oficial de la infobox). Resultados con miniatura y botones ➕ TP / 💾 Mis logos / ⬇. Si no hay nada, enlace directo a Google Imágenes.
- **Quitar fondo blanco**: activado por defecto al guardar/enviar desde el buscador y al añadir logos propios (flood fill desde los bordes: respeta el blanco interior del logo). Los logos ya guardados tienen un botón 🪄 para limpiarlos a posteriori.
- **Packs**: kits temáticos descargables de golpe (GT3, Endurance, Clásico 70s, Streamer, Español) a `Descargas/TP-Companion/<kit>/`. Definidos en `catalog.json` → `packs`.
- **Repositorio**: **172 marcas en 9 categorías** (127 con URL verificada de Commons), categorías plegables (click en el título) y modo selección ☑ para descargar varios en lote.
  - **➕ TP** lo añade directamente a Trading Paints: si la pestaña activa es TP con formulario, lo inyecta al momento; si no, queda en cola, enfoca (o abre) la pestaña de TP y se inyecta solo en cuanto aparezca un formulario de subida (la cola caduca a los 10 minutos).
  - **⬇ PNG** (raster 1200 px) y **⬇ SVG** descargan a `Descargas/TP-Companion/`.
  - Las marcas sin archivo directo (Fanatec, MOZA...) tienen 🔍 que lanza el buscador con su nombre.
- El catálogo se regenera con `tools/check_commons.py` (verifica títulos contra la API de Commons) + `tools/build_catalog.py` (monta `logos/catalog.json`, incluye los packs).

### Códigos de pintura (popup)
Acordeón **🎨 Códigos de pintura reales** en la pestaña Colores: biblioteca buscable de colores reales (Ferrari, Porsche, Audi, BMW M, clásicos racing, neutros...) en `data/paints.json`. Hex aproximados para pantalla. Click = copiar, ＋ = a la paleta activa.

### Estudio (pantalla completa)
Se abre con el botón **⛶ Estudio** del popup (en la extensión, una pestaña nueva; en dev, `studio/studio.html`). Tres herramientas:
- **🪄 Taller de logos**: contorno por dilatación de alfa (color y grosor), recorte al ras del bounding box transparente, quitar fondo. Recibe logos del popup vía el botón 🪄 (storage `workshopIncoming` + `studio.html#logos`). Salida a Mis logos / Trading Paints / descarga.
- **🧵 Texturas** (`studio/textures.js`): generador **modular** de 17 patrones (carbono sarga/tafetán/forjado, rayas v/h/diagonal, chevron, rejilla, damero, rombos, lunares, **chapa lagrimada**, **dibujo de neumático**, **camuflaje orgánico y digital**, salpicado, terrazo). Cada patrón declara sus propios **colores** (los que necesite, p.ej. el camo 4) y **controles** (tamaño, densidad, redondez, grosor…), con **presets** (el camo trae Woodland/Desierto/Urbano/Invierno/Multicam/Naval). Selector con **miniaturas en vivo** + **buscador**. Botones para usar la **paleta activa**, **🎲 variar** la distribución, descargar PNG o **➕ enviar a Trading Paints**.
  - **Sin costura**: todo se genera sobre un **tile grande completo** (512–2048). Los orgánicos (camo, forjado, salpicado, terrazo) se dibujan **toroidalmente** — cada forma y sus copias en los bordes son idénticas — así que el tile es irregular pero encaja consigo mismo; los geométricos son periódicos con periodo que divide el tile. Verificado: en los patrones con relleno plano la junta da 0; en los orgánicos es estadísticamente igual al interior.
- **📌 Tablero**: mood board de referencias (URL o subida) en storage; click en una para extraerle la paleta.

Las paletas se comparten entre popup y estudio (misma `chrome.storage.local`).

## Estructura

```
manifest.json        — MV3: permisos, content script, popup
background.js        — service worker: descargas y fetch de logos
content/content.js   — captura de colores + widget flotante + inyección de archivos
panel/               — popup (html/css/js); funciona también como página suelta para desarrollo
studio/              — estudio a pantalla completa (html/css/js)
lib/tpc-core.js      — núcleo compartido: storage, mates de color, operaciones de imagen
data/paints.json     — biblioteca de códigos de pintura
logos/catalog.json   — catálogo de logos ("commons" = URL directa, "search" = atajo)
icons/               — iconos de la extensión
```

## Limitaciones y notas

- La inyección con 📤 depende de que la página tenga un `<input type="file">` visible; si Trading Paints rediseña la página de subida puede hacer falta ajustar `content.js`.
- La captura automática de colores escucha selectores de color y campos hex genéricos; si el Paint Builder usa algún control raro que se nos escape, el cuentagotas del widget lo cubre.
- Los logos son **marcas registradas** de sus propietarios: úsalos únicamente en tus liveries personales.
- Firefox: debería funcionar con cambios mínimos (MV3 está soportado), pero está pensada para Chrome/Edge.
