// ============================================================
// MindArchive — ChatGPT Page-Context Interceptor
// ============================================================
// Injected into the PAGE execution context (MAIN world) via
// content_scripts so it can intercept the page's fetch().
//
// The page calls GET /backend-api/conversation/{id} on load.
// We intercept the response JSON and store it on:
//   window.__mindarchive_chatgpt_cache__
//
// The isolated-world extractor reads this cache via
// the same window object.
// ============================================================

(function () {
  "use strict";

  const CACHE_KEY = "__mindarchive_chatgpt_cache__";

  // ─── Cache helpers ────────────────────────────────────────

  function setCache(data) {
    window[CACHE_KEY] = data;
    // Bridge to isolated world via postMessage
    window.postMessage(
      { type: "__mindarchive_chatgpt_cache_update__", payload: data },
      "*"
    );
  }

  function clearCache() {
    window[CACHE_KEY] = null;
    window.postMessage(
      { type: "__mindarchive_chatgpt_cache_clear__" },
      "*"
    );
  }

  // ─── SPA Navigation — clear cache on route change ────────

  window.addEventListener("popstate", clearCache);

  const _pushState = history.pushState.bind(history);
  history.pushState = function (data, title, url) {
    clearCache();
    return _pushState(data, title, url);
  };

  const _replaceState = history.replaceState.bind(history);
  history.replaceState = function (data, title, url) {
    clearCache();
    return _replaceState(data, title, url);
  };

  // ─── fetch() Hook ─────────────────────────────────────────
  // Intercept the page's own API call to /backend-api/conversation/
  // Store the parsed JSON response in our cache.

  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";

    // Call through first — don't block the page
    const response = await _fetch.call(window, input, init);

    // Match the conversation API
    if (url.includes("/backend-api/conversation/") && response.ok) {
      try {
        // Clone so we can read the body without consuming it
        const cloned = response.clone();
        const data = await cloned.json();

        if (data && data.mapping) {
          console.log(
            "[MindArchive] ChatGPT page: intercepted conversation API",
            "| title:", data.title,
            "| mapping nodes:", Object.keys(data.mapping).length
          );
          setCache(data);
        }
      } catch (e) {
        // JSON parse failed — not our concern
      }
    }

    return response;
  };

  console.log("[MindArchive] ChatGPT interceptor: installed (MAIN world)");
})();
