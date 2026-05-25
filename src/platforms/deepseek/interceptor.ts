// ============================================================
// MindArchive — DeepSeek Storage Bridge (isolated world)
// ============================================================
// Reads stored headers from chrome.storage.session and
// dispatches them to page context (MAIN world) for fetch.
// Buffers cache updates on window for extractor.ts.
// ============================================================

const CACHE_KEY = "__mindarchive_bridge_cache__";

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.data?.type === "__mindarchive_cache_update__") {
    (window as any)[CACHE_KEY] = event.data.payload;
    console.log(
      "[MindArchive] DeepSeek bridge: cache received, messages:",
      event.data.payload?.messages?.length
    );
  }
  if (event.data?.type === "__mindarchive_cache_clear__") {
    (window as any)[CACHE_KEY] = null;
    console.log("[MindArchive] DeepSeek bridge: cache cleared");
  }
});

// ── On load: check for stored headers ──────────────────────

chrome.storage.session.get("deepseek_headers").then((result) => {
  if (result.deepseek_headers) {
    console.log("[MindArchive] DeepSeek bridge: found stored headers on load");
    window.postMessage(
      { type: "__mindarchive_use_headers__", headers: result.deepseek_headers },
      "*"
    );
  }
});

// ── On message from popup: forward headers to page context ──

chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg.type === "DEEPSEEK_USE_HEADERS" && msg.headers) {
    console.log("[MindArchive] DeepSeek bridge: received headers from popup");
    window.postMessage(
      { type: "__mindarchive_use_headers__", headers: msg.headers },
      "*"
    );
  }
});

console.log("[MindArchive] DeepSeek bridge: installed");

