// ============================================================
// MindArchive — DeepSeek Page-Context Interceptor
// ============================================================
// Injected into the PAGE execution context via <script> tag
// so it can intercept the page's real fetch() and XHR.
//
// Stores accumulated conversation data on
//   window.__mindarchive_deepseek_cache__
// which is readable by the content script (same window).
// ============================================================

(function () {
  "use strict";

  // ─── Inline Types (no imports — runs in page context) ────

  interface ApiMessage {
    message_id: number;
    parent_message_id?: number;
    role: "user" | "assistant";
    content?: string;
    created_at?: number;
    model_name?: string;
    files?: unknown[];
    thinking?: unknown;
    search_results?: unknown[];
  }

  interface CacheStore {
    messages: ApiMessage[];
    session: { title?: string; model?: string } | null;
  }

  // ─── Cache ────────────────────────────────────────────────

  const KEY = "__mindarchive_deepseek_cache__";

  function getCache(): CacheStore {
    if (!(window as any)[KEY]) {
      (window as any)[KEY] = { messages: [], session: null };
    }
    return (window as any)[KEY];
  }

  function clearCache(): void {
    (window as any)[KEY] = null;
    // Notify isolated world to clear its cache buffer too
    window.postMessage(
      { type: "__mindarchive_cache_clear__" },
      "*"
    );
  }

  // ─── Accumulate ───────────────────────────────────────────

  function accumulate(response: any): void {
    console.log('[MindArchive] accumulate called, code:',
      response?.code,
      'messages count:', response?.data?.biz_data?.chat_messages?.length,
      'raw biz_data keys:', Object.keys(response?.data?.biz_data || {})
    );
    const biz = response?.data?.biz_data;
    if (!biz) return;

    const cache = getCache();
    const msgs: ApiMessage[] = biz.chat_messages || [];

    if (!cache.session && biz.chat_session) {
      cache.session = {
        title: biz.chat_session.title,
        model: biz.chat_session.model,
      };
    }

    const existingIds = new Set(cache.messages.map((m) => m.message_id));
    let added = 0;
    for (const msg of msgs) {
      if (!existingIds.has(msg.message_id)) {
        cache.messages.push(msg);
        existingIds.add(msg.message_id);
        added++;
      }
    }

    if (added > 0) {
      console.log(
        `[MindArchive] DeepSeek page interceptor: +${added} messages (total: ${cache.messages.length})`
      );
    }

    // Bridge to content script via postMessage (cross-world)
    window.postMessage(
      {
        type: "__mindarchive_cache_update__",
        payload: (window as any)[KEY],
      },
      "*"
    );
  }

  // ─── fetch() Hook (token capture only) ───────────────────

  const _fetch = window.fetch;
  window.fetch = async function (
    input: any,
    init?: any
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/v0/chat/history_messages")) {
      const headers = init?.headers || {};
      const auth =
        typeof headers.get === "function"
          ? headers.get("authorization")
          : headers["authorization"] || headers["Authorization"] || "";
      if (auth && auth.startsWith("Bearer ")) {
        console.log("[MindArchive] DeepSeek page: token captured");
      }
    }
    return _fetch.call(window, input, init);
  };

  // ─── SPA Navigation ───────────────────────────────────────

  window.addEventListener("popstate", clearCache);

  const _pushState = history.pushState.bind(history);
  history.pushState = function (
    data: any,
    title: string,
    url?: string | null
  ): void {
    clearCache();
    _pushState(data, title, url);
  };

  const _replaceState = history.replaceState.bind(history);
  history.replaceState = function (
    data: any,
    title: string,
    url?: string | null
  ): void {
    clearCache();
    _replaceState(data, title, url);
  };

  // ─── Fetch with provided headers (from content script) ───

  window.addEventListener("message", async (event: MessageEvent) => {
    if (event.source !== window) return;
    if (event.data?.type !== "__mindarchive_use_headers__") return;
    const headers = event.data.headers as Record<string, string>;
    if (!headers?.authorization) return;

    // Store token for reuse
    (window as any).__mindarchive_ds_token__ = headers.authorization;

    const convId = window.location.pathname.split("/").pop();
    if (!convId) return;

    try {
      // Step 1: probe
      const probeResp = await fetch(
        `/api/v0/chat/history_messages?chat_session_id=${convId}&cache_version=0&count=50`,
        { credentials: "include", headers }
      );
      const probeData = await probeResp.json();

      if (probeData?.code === 40003) {
        console.warn("[MindArchive] DeepSeek: token expired (40003)");
        window.dispatchEvent(new CustomEvent("__mindarchive_token_expired__"));
        return;
      }

      const totalCount =
        probeData?.data?.biz_data?.chat_session?.current_message_id;
      if (!totalCount) return;

      console.log(`[MindArchive] DeepSeek page: total_count = ${totalCount}`);

      // Step 2: full fetch
      const fullResp = await fetch(
        `/api/v0/chat/history_messages?chat_session_id=${convId}&cache_version=0&count=${totalCount}`,
        { credentials: "include", headers }
      );
      const fullData = await fullResp.json();
      accumulate(fullData);

      window.postMessage(
        {
          type: "__mindarchive_cache_update__",
          payload: (window as any)[KEY],
        },
        "*"
      );
    } catch (err) {
      console.warn("[MindArchive] DeepSeek: fetch with headers failed", err);
    }
  });

  console.log("[MindArchive] DeepSeek page interceptor: installed");
})();
