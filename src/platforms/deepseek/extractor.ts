// ============================================================
// MindArchive — DeepSeek Message Extractor
// ============================================================
// Two extraction strategies (cache preferred, DOM fallback):
//
// ## Cache extraction (primary)
//   Reads window.__mindarchive_deepseek_cache__ populated by
//   the request interceptor (injected at document_start).
//   Zero network requests — the page's own API calls are
//   intercepted and accumulated.
//
// ## DOM extraction (fallback)
//   All messages: .ds-message
//   AI marker:    .ds-assistant-message-main-content
// ============================================================

import type { Message, DeepSeekApiMessage } from "@/core/types";

const BRIDGE_CACHE_KEY = "__mindarchive_bridge_cache__";

function getCachedData(): any {
  return (window as any)[BRIDGE_CACHE_KEY] || null;
}

// ─── Confirmed Selectors ────────────────────────────────────

const MSG_SELECTOR = ".ds-message";
const AI_MARKER = ".ds-assistant-message-main-content";

// ─── UI Strippers ───────────────────────────────────────────

const UI_STRIP = [
  "style", "script", "noscript",
  "button", '[role="button"]',
  ".sr-only", '[aria-hidden="true"]', ".hidden",
  ".md-code-block-banner-wrap", // DeepSeek copy button row
];

// ─── Public API ─────────────────────────────────────────────

export function countMessageElements(): number {
  return document.querySelectorAll(MSG_SELECTOR).length;
}

export function extractMessages(debug = true): Message[] {
  const messages = doExtract();

  if (debug) {
    console.log("[MindArchive] DeepSeek extraction:", {
      selector: MSG_SELECTOR, aiMarker: AI_MARKER,
      extracted: messages.length,
      previews: messages.map((m) =>
        `${m.role}: ${m.content.slice(0, 80)}...`
      ),
    });
  }

  return messages;
}

export function extractTitle(): string {
  const raw = document.title || "";
  return raw.replace(/\s*[-–|]\s*DeepSeek.*$/i, "").trim() || "Untitled Conversation";
}

// ─── Internal ───────────────────────────────────────────────

function doExtract(): Message[] {
  const msgEls = Array.from(document.querySelectorAll(MSG_SELECTOR));
  if (msgEls.length === 0) return [];

  const messages: Message[] = [];
  for (const el of msgEls) {
    const role: Message["role"] = el.querySelector(AI_MARKER) ? "assistant" : "user";
    const content = extractCleanText(el);
    if (!content) continue;
    messages.push({ role, content, timestamp: extractTimestamp(el) });
  }

  return messages;
}

// ─── Helpers ────────────────────────────────────────────────

function extractCleanText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;

  for (const sel of UI_STRIP) {
    clone.querySelectorAll(sel).forEach((c) => c.remove());
  }

  fenceCode(clone);

  // Preserve images as Markdown placeholders before text extraction
  preserveImages(clone);

  const text = (clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  return text.length < 3 ? "" : text;
}

function fenceCode(root: HTMLElement): void {
  for (const el of Array.from(
    root.querySelectorAll(".md-code-block, pre, code")
  ).reverse()) {
    if (!el.parentNode) continue;
    if (el.tagName === "CODE" && el.closest("pre, .md-code-block")) continue;

    const code = (el.textContent || "").trim();
    if (code.length < 5) continue;

    const lang = el.getAttribute("data-language") || "";
    const s = document.createElement("span");
    s.textContent = `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    el.parentNode.replaceChild(s, el);
  }
}

function extractTimestamp(el: Element): string | undefined {
  const t = el.querySelector("time");
  return t?.getAttribute("datetime") || t?.textContent?.trim() || undefined;
}

/**
 * Replace all <img> elements with Markdown ![alt](src) text nodes
 * so they survive textContent extraction as readable placeholders.
 */
function preserveImages(root: HTMLElement): void {
  const imgs = Array.from(root.querySelectorAll("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
    const alt = img.getAttribute("alt") || img.getAttribute("title") || "Image";

    let placeholder: string;
    if (src && (src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:"))) {
      placeholder = `![${alt}](${src})`;
    } else if (src) {
      placeholder = `![${alt}]({{${src}}})`;
    } else {
      placeholder = `[🖼 ${alt}]`;
    }

    const span = document.createElement("span");
    span.textContent = placeholder;
    img.parentNode?.replaceChild(span, img);
  }

  // Also handle <figure> wrappers
  const figures = Array.from(root.querySelectorAll("figure"));
  for (const fig of figures) {
    const img = fig.querySelector("img");
    const figcaption = fig.querySelector("figcaption");
    if (img && (fig.childElementCount === 1 || (fig.childElementCount === 2 && figcaption))) {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const alt = figcaption?.textContent?.trim() || img.getAttribute("alt") || "Image";
      let placeholder: string;
      if (src && (src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:"))) {
        placeholder = `![${alt}](${src})`;
      } else if (src) {
        placeholder = `![${alt}]({{${src}}})`;
      } else {
        placeholder = `[🖼 ${alt}]`;
      }
      const span = document.createElement("span");
      span.textContent = placeholder;
      fig.parentNode?.replaceChild(span, fig);
    }
  }
}

// ============================================================
// Cache Wait (primary strategy)
// ============================================================
// Three-tier flow: immediate cache → storage check → wait.

function cacheToResult(cache: {
  messages: DeepSeekApiMessage[];
  session: { title?: string; model?: string } | null;
}): { messages: Message[]; title: string; model: string } {
  return {
    messages: convertMessagesFromList(cache.messages),
    title: cache.session?.title || extractTitle(),
    model: cache.session?.model || "",
  };
}

async function waitForPostMessage(timeoutMs = 10000): Promise<{
  messages: DeepSeekApiMessage[];
  session: { title?: string; model?: string } | null;
} | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[MindArchive] DeepSeek: cache update timed out");
      resolve(null);
    }, timeoutMs);

    function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type === "__mindarchive_cache_update__") {
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        const cache = event.data.payload as {
          messages: DeepSeekApiMessage[];
          session: { title?: string; model?: string } | null;
        } | null;
        resolve(cache?.messages?.length ? cache : null);
      }
    }

    window.addEventListener("message", handler);
  });
}

export async function fetchConversationFromApi(): Promise<{
  messages: Message[];
  title: string;
  model: string;
  needsRefresh?: boolean;
} | null> {
  // 1. Immediate cache check — data may have arrived before we were called
  const immediate = getCachedData();
  if (immediate?.messages?.length > 0) {
    console.log("[MindArchive] DeepSeek: cache found immediately, returning");
    return cacheToResult(immediate);
  }

  // 2. Check for stored headers — no headers = instant needsRefresh
  try {
    const stored = await chrome.storage.session.get("deepseek_headers");
    if (!stored.deepseek_headers) {
      console.warn("[MindArchive] DeepSeek: no stored headers — needs refresh");
      return { messages: [], title: "", model: "", needsRefresh: true };
    }

    // 3. Headers exist — trigger fetch in page context and wait
    console.log("[MindArchive] DeepSeek: dispatching use_headers and waiting...");
    window.postMessage(
      { type: "__mindarchive_use_headers__", headers: stored.deepseek_headers },
      "*"
    );

    const cache = await waitForPostMessage();
    if (!cache) {
      return { messages: [], title: "", model: "", needsRefresh: true };
    }

    const result = cacheToResult(cache);
    console.log(
      `[MindArchive] DeepSeek: extracted ${result.messages.length} messages`
    );

    return result;
  } catch (err) {
    console.error("[MindArchive] DeepSeek: storage access failed", err);
    return { messages: [], title: "", model: "", needsRefresh: true };
  }
}

// ─── Message Conversion ─────────────────────────────────────

/** Convert DeepSeekApiMessage[] → Message[] (sorted, deduplicated) */
function convertMessagesFromList(rawMessages: DeepSeekApiMessage[]): Message[] {
  if (rawMessages.length === 0) return [];

  return rawMessages
    .sort((a, b) => a.message_id - b.message_id)
    .map((msg) => {
      // Role mapping: uppercase API → lowercase output
      const role: Message["role"] =
        msg.role === "USER" ? "user" : "assistant";

      // Extract content from fragments (preferred) or direct field
      let content = "";
      if (msg.fragments && msg.fragments.length > 0) {
        const fragmentType = msg.role === "USER" ? "REQUEST" : "RESPONSE";
        const target = msg.fragments.find((f) => f.type === fragmentType);
        content = (target?.content ?? "").trim();
      } else {
        content = (msg.content || "").trim();
      }

      const timestamp = msg.created_at
        ? new Date(msg.created_at * 1000).toISOString()
        : undefined;

      return {
        role,
        content,
        timestamp,
        uuid: String(msg.message_id),
      };
    });
}

