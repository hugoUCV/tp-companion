// TP Companion — service worker
// Descargas y fetch de logos (el popup no siempre puede hacer fetch cross-origin).

function bufToBase64(buf) {
  let s = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "download") {
    chrome.downloads.download(
      { url: msg.url, filename: "TP-Companion/" + msg.filename, saveAs: false },
      () => {
        const err = chrome.runtime.lastError;
        sendResponse({ ok: !err, error: err ? err.message : null });
      }
    );
    return true;
  }

  if (msg.type === "fetchDataUrl") {
    (async () => {
      try {
        const r = await fetch(msg.url);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const mime =
          (r.headers.get("content-type") || "application/octet-stream").split(";")[0];
        const buf = await r.arrayBuffer();
        sendResponse({ ok: true, dataUrl: `data:${mime};base64,${bufToBase64(buf)}`, mime });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});
