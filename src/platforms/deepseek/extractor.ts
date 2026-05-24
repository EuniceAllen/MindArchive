// ============================================================
// MindArchive — DeepSeek Message Extractor
// ============================================================
// Two extraction strategies (API preferred, DOM fallback):
//
// ## API extraction (primary)
//   Recursive pagination: loop with count=50 until exhausted.
//   Detects cursor fields (next_seq_id / cursor / min_seq_id).
//   Deduplicates by message_id, sorts chronologically.
//
// ## DOM extraction (fallback)
//   All messages: .ds-message
//   AI marker:    .ds-assistant-message-main-content
// ============================================================

import type { Message, DeepSeekApiResponse, DeepSeekApiMessage } from "@/core/types";

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

// ============================================================
// API Extraction (primary strategy)
// ============================================================
// Fetches the full conversation from chat.deepseek.com's
// internal API. Returns raw markdown, avoiding DOM issues.

/**
 * Fetch the full conversation from DeepSeek's internal API
 * with recursive pagination.
 *
 * DeepSeek paginates history_messages (default 50 per page).
 * This function loops until no more pages or exhausted cursor,
 * then deduplicates and sorts all messages.
 *
 * DOM fallback ONLY on HTTP/auth/malformed response — NOT on
 * empty chat_messages or missing cursor (valid pagination end).
 */
export async function fetchConversationFromApi(): Promise<{
  messages: Message[];
  title: string;
  model: string;
} | null> {
  try {
    console.log("[MindArchive] DeepSeek API: fetchConversationFromApi called, URL:", window.location.pathname);

    const convId = getDeepSeekConversationId();
    console.log("[MindArchive] DeepSeek API: convId =", convId);
    if (!convId) {
      console.warn("[MindArchive] DeepSeek API: no conversation_id in URL");
      return null;
    }

    const allMessages: DeepSeekApiMessage[] = [];
    const seen = new Set<number>();
    let cursor: Cursor | null = null;
    let page = 0;
    let sessionTitle: string | undefined;
    let sessionModel: string | undefined;

    while (true) {
      page++;

      // Build URL with cursor if present
      let apiUrl = `/api/v0/chat/history_messages?chat_session_id=${convId}&cache_version=0&count=50`;
      if (cursor) {
        apiUrl += `&${cursor.param}=${cursor.value}`;
      }

      console.log(`[MindArchive] DeepSeek API: page ${page}, cursor=${cursor ? `${cursor.param}=${cursor.value}` : "none"}`);

      const resp = await fetch(apiUrl, { credentials: "include" });
      if (!resp.ok) {
        // HTTP failure → DOM fallback
        console.warn(`[MindArchive] DeepSeek API page ${page}: HTTP ${resp.status}`);
        if (page === 1) return null; // first page failed → full fallback
        break; // subsequent page failed → use what we have
      }

      const data: DeepSeekApiResponse = await resp.json();

      // null data during pagination is normal exhaustion — don't fallback to DOM
      if (!data?.data?.biz_data) {
        console.log(`[MindArchive] DeepSeek API page ${page}: null data (pagination exhausted)`);
        break;
      }

      const biz = data.data.biz_data;
      const msgs = biz.chat_messages || [];

      // Capture session metadata from first page
      if (page === 1 && biz.chat_session) {
        sessionTitle = biz.chat_session.title;
        sessionModel = biz.chat_session.model;
      }

      console.log(`[MindArchive] DeepSeek API page ${page}: got ${msgs.length} messages`);

      if (msgs.length === 0) {
        console.log(`[MindArchive] DeepSeek API page ${page}: empty page, stopping`);
        break;
      }

      // Deduplicate and accumulate
      let newCount = 0;
      for (const msg of msgs) {
        if (!seen.has(msg.message_id)) {
          seen.add(msg.message_id);
          allMessages.push(msg);
          newCount++;
        }
      }
      console.log(`[MindArchive] DeepSeek API page ${page}: ${newCount} new (total: ${allMessages.length})`);

      // Detect pagination end
      if (biz.has_more === false) {
        console.log("[MindArchive] DeepSeek API: has_more=false, stopping");
        break;
      }

      if (msgs.length < 50) {
        console.log(`[MindArchive] DeepSeek API page ${page}: returned ${msgs.length} < 50, stopping`);
        break;
      }

      // Extract cursor for next page
      const nextCursor = extractCursor(biz);
      if (!nextCursor) {
        console.log("[MindArchive] DeepSeek API: no cursor found, stopping");
        break;
      }

      cursor = nextCursor;
    }

    // Convert accumulated messages
    const messages = convertMessagesFromList(allMessages);
    const title = sessionTitle || extractTitle();
    const model = sessionModel || "";

    console.log(
      `[MindArchive] DeepSeek API: done — ${messages.length} total messages across ${page} pages`
    );

    return { messages, title, model };
  } catch (err) {
    console.error("[MindArchive] DeepSeek API: fetch failed", err);
    return null;
  }
}

// ─── Pagination Helpers ─────────────────────────────────────

/** Pagination cursor: param name + value for next request */
interface Cursor {
  param: string;
  value: string;
}

/** Try known cursor field names in the biz_data object */
function extractCursor(biz: Record<string, unknown>): Cursor | null {
  // Priority order: try known pagination field names
  const candidates: [string, string][] = [
    ["next_seq_id", "seq_id"],
    ["cursor", "cursor"],
    ["min_seq_id", "seq_id"],
    ["seq_id", "seq_id"],
  ];

  for (const [field, param] of candidates) {
    const val = biz[field];
    if (val !== undefined && val !== null && val !== "") {
      return { param, value: String(val) };
    }
  }

  return null;
}

/** Extract conversation_id from URL: /a/chat/s/{id} */
function getDeepSeekConversationId(): string | null {
  return window.location.pathname.split("/").pop() || null;
}

/** Convert DeepSeekApiMessage[] → Message[] (sorted, deduplicated) */
function convertMessagesFromList(rawMessages: DeepSeekApiMessage[]): Message[] {
  if (rawMessages.length === 0) return [];

  return rawMessages
    .sort((a, b) => a.message_id - b.message_id)
    .map((msg) => {
      const role: Message["role"] = msg.role === "user" ? "user" : "assistant";
      const content = (msg.content || "").trim();
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

