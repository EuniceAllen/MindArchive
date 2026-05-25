// ============================================================
// MindArchive — Claude Message Extractor
// ============================================================
// Two extraction strategies (API preferred, DOM fallback):
//
// ## API extraction (primary)
//   GET /api/organizations/{org}/chat_conversations/{id}
//   Returns full conversation with raw markdown text per message.
//
// ## DOM extraction (fallback)
//   User:   div[class*="font-user-message"]
//   Claude: div.font-claude-response
//   Depth-first traversal emitting blocks sequentially.
// ============================================================

import type { Message, ContentBlock, ClaudeApiResponse } from "@/core/types";

// ─── Primary Selectors ──────────────────────────────────────

const USER_SELECTOR = 'div[class*="font-user-message"]';
const CLAUDE_SELECTOR = "div.font-claude-response";

// ─── UI Elements ────────────────────────────────────────────
// These are skipped during traversal. Note: .overflow-x-auto
// is NOT in this list — it's a code block wrapper we emit.

const UI_SKIP = new Set([
  "BUTTON", "STYLE", "SCRIPT", "NOSCRIPT", "SVG", "PATH",
]);

function shouldSkip(el: Element): boolean {
  if (UI_SKIP.has(el.tagName)) return true;
  if (el.getAttribute("role") === "button") return true;
  if (el.classList.contains("sr-only")) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  if (el.classList.contains("hidden")) return true;
  return false;
}

// ─── Public API ─────────────────────────────────────────────

export function countMessageElements(): number {
  return (
    document.querySelectorAll(USER_SELECTOR).length +
    document.querySelectorAll(CLAUDE_SELECTOR).length
  );
}

export function extractMessages(debug = true): Message[] {
  const messages = doExtract();

  if (debug) {
    console.log("[MindArchive] Claude extraction result:", {
      userSelector: USER_SELECTOR,
      claudeSelector: CLAUDE_SELECTOR,
      messagesExtracted: messages.length,
      previews: messages.map((m) => {
        const preview =
          m.blocks && m.blocks.length > 0
            ? `${m.blocks[0].type}: ${blockPreview(m.blocks[0])}`
            : m.content.slice(0, 80);
        return `${m.role}: ${preview}`;
      }),
    });
  }

  return messages;
}

export function extractTitle(): string {
  const raw = document.title || "";
  const cleaned = raw.replace(/\s*[-–|]\s*Claude.*$/i, "").trim();
  if (cleaned && cleaned.length < 200) return cleaned;
  return "Untitled Conversation";
}

// ─── Internal: Main Extraction ──────────────────────────────

interface MessageEntry {
  el: Element;
  role: "user" | "assistant";
}

function doExtract(): Message[] {
  // Step 1: collect all message containers from both selectors
  const entries: MessageEntry[] = [
    ...Array.from(document.querySelectorAll(USER_SELECTOR)).map(
      (el) => ({ el, role: "user" as const })
    ),
    ...Array.from(document.querySelectorAll(CLAUDE_SELECTOR)).map(
      (el) => ({ el, role: "assistant" as const })
    ),
  ];

  if (entries.length === 0) return [];

  // Step 2: sort by DOM position (top-to-bottom = chronological)
  const sorted = sortByDOM(entries);

  // Step 3: for each container, walk DFS and emit blocks
  const messages: Message[] = [];

  for (const { el, role } of sorted) {
    const blocks: ContentBlock[] = [];
    walkDFS(el, blocks);

    if (blocks.length === 0) continue;

    messages.push({
      role,
      content: blocksToText(blocks),
      blocks,
      timestamp: extractTimestamp(el),
    });
  }

  return messages;
}

// ─── Depth-First Traversal ──────────────────────────────────

/**
 * Single depth-first walk over child nodes in DOM order.
 * Each recognised element type emits exactly one block.
 * Unrecognised elements are skipped (no recursion into them).
 */
function walkDFS(parent: Element, blocks: ContentBlock[]): void {
  for (const child of Array.from(parent.children)) {
    if (shouldSkip(child)) continue;

    const tag = child.tagName.toLowerCase();

    // ── p: serialize full innerText (inline <code> merged) ──
    if (tag === "p") {
      const clone = child.cloneNode(true) as HTMLElement;
      preserveImages(clone);
      const text = clone.innerText?.trim() || "";
      if (text) {
        blocks.push({ type: "text", content: text });
      }
      continue;
    }

    // ── h1–h4: heading with level ───────────────────────────
    if (/^h[1-4]$/.test(tag)) {
      const level = parseInt(tag.charAt(1), 10);
      const text = (child as HTMLElement).innerText?.trim() || "";
      if (text) {
        blocks.push({ type: "heading", level, content: text });
      }
      continue;
    }

    // ── ul / ol: list ───────────────────────────────────────
    if (tag === "ul" || tag === "ol") {
      const items = Array.from(child.querySelectorAll(":scope > li"))
        .map((li) => (li as HTMLElement).innerText?.trim() || "")
        .filter(Boolean);
      if (items.length > 0) {
        blocks.push({ type: "list", ordered: tag === "ol", items });
      }
      continue;
    }

    // ── blockquote ──────────────────────────────────────────
    if (tag === "blockquote") {
      const text = (child as HTMLElement).innerText?.trim() || "";
      if (text) {
        blocks.push({ type: "blockquote", content: text });
      }
      continue;
    }

    // ── img / figure → image placeholder ────────────────────
    if (tag === "img") {
      const placeholder = imgToPlaceholder(child as HTMLImageElement);
      if (placeholder) {
        blocks.push({ type: "text", content: placeholder });
      }
      continue;
    }

    if (tag === "figure") {
      const img = child.querySelector("img");
      const figcaption = child.querySelector("figcaption");
      const alt = figcaption?.textContent?.trim() || img?.getAttribute("alt") || "Image";
      if (img) {
        const placeholder = imgToPlaceholder(img, alt);
        if (placeholder) {
          blocks.push({ type: "text", content: placeholder });
        }
      }
      continue;
    }

    // ── div.overflow-x-auto → code block ────────────────────
    if (tag === "div" && child.classList.contains("overflow-x-auto")) {
      const code = child.querySelector(
        'pre.code-block__code > code[class*="language-"]'
      );
      if (code) {
        const language = getCodeLanguage(code);
        const content = (code as HTMLElement).innerText?.trim() || "";
        if (content) {
          blocks.push({ type: "code_block", language, content });
        }
      }
      // Do NOT descend further into the code block wrapper
      continue;
    }

    // ── All other nodes: skip ───────────────────────────────
  }
}

// ─── Helpers ────────────────────────────────────────────────

/** Extract the language from code[class*="language-xxx"] */
function getCodeLanguage(code: Element): string {
  for (const cls of code.classList) {
    if (cls.startsWith("language-")) {
      return cls.slice("language-".length);
    }
  }
  return "";
}

/** Extract ISO timestamp from a <time> element */
function extractTimestamp(el: Element): string | undefined {
  const timeEl = el.querySelector("time");
  return (
    timeEl?.getAttribute("datetime") ||
    timeEl?.textContent?.trim() ||
    undefined
  );
}

/** Flatten blocks to a single text string (backward compat) */
function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "text":
          return b.content;
        case "heading":
          return `${"#".repeat(b.level)} ${b.content}`;
        case "code_block":
          return `\`\`\`${b.language}\n${b.content}\n\`\`\``;
        case "list": {
          const marker = b.ordered ? "1." : "-";
          return b.items.map((item) => `${marker} ${item}`).join("\n");
        }
        case "blockquote":
          return `> ${b.content}`;
      }
    })
    .join("\n\n");
}

/** Sort elements by DOM position (top-to-bottom) */
function sortByDOM<T extends { el: Element }>(items: T[]): T[] {
  return items.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

/**
 * Convert an <img> element to a Markdown placeholder string.
 */
function imgToPlaceholder(img: HTMLImageElement, overrideAlt?: string): string {
  const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
  const alt = overrideAlt || img.getAttribute("alt") || img.getAttribute("title") || "Image";

  if (src && (src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:"))) {
    return `![${alt}](${src})`;
  } else if (src) {
    return `![${alt}]({{${src}}})`;
  }
  return `[🖼 ${alt}]`;
}

/**
 * Replace <img> elements inside a cloned container with text
 * placeholders so innerText extraction preserves them.
 */
function preserveImages(root: HTMLElement): void {
  const imgs = Array.from(root.querySelectorAll("img"));
  for (const img of imgs) {
    const placeholder = imgToPlaceholder(img);
    const span = document.createElement("span");
    span.textContent = placeholder;
    img.parentNode?.replaceChild(span, img);
  }
}

/** Short preview for debug logging */
function blockPreview(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.content.slice(0, 60);
    case "heading":
      return `[H${block.level}] ${block.content.slice(0, 50)}`;
    case "code_block":
      return `[${block.language || "code"}] ${block.content.slice(0, 40)}`;
    case "list":
      return `[list] ${block.items[0]?.slice(0, 40) || ""}`;
    case "blockquote":
      return `[quote] ${block.content.slice(0, 50)}`;
  }
}

// ============================================================
// API Extraction (primary strategy)
// ============================================================
// Fetches the full conversation from claude.ai's internal API.
// This avoids DOM fragmentation issues and returns raw markdown.

/**
 * Fetch the full conversation from claude.ai's internal API.
 *
 * Steps:
 *   1. Extract conversation_id from window.location.pathname
 *   2. Fetch /api/organizations to get the first org uuid
 *   3. Fetch /api/organizations/{org}/chat_conversations/{id}
 *   4. Convert chat_messages[] to Message[]
 *
 * Returns null if any step fails (caller should fall back to DOM).
 */
export async function fetchConversationFromApi(): Promise<{
  messages: Message[];
  title: string;
  model: string;
} | null> {
  try {
    // Step 1: conversation_id from URL
    const convId = getConversationId();
    if (!convId) {
      console.warn("[MindArchive] Claude API: no conversation_id in URL");
      return null;
    }

    // Step 2: org_id
    const orgId = await fetchOrgId();
    if (!orgId) {
      console.warn("[MindArchive] Claude API: could not get org_id");
      return null;
    }

    // Step 3: fetch conversation
    const apiUrl = `/api/organizations/${orgId}/chat_conversations/${convId}`;
    console.log(`[MindArchive] Claude API: fetching ${apiUrl}`);

    const resp = await fetch(apiUrl, { credentials: "include" });
    if (!resp.ok) {
      console.warn(
        `[MindArchive] Claude API: HTTP ${resp.status} ${resp.statusText}`
      );
      return null;
    }

    const data: ClaudeApiResponse = await resp.json();

    // Step 4: convert
    const messages = convertApiMessages(data);
    const title = data.name || extractTitle();
    const model = data.model || "";

    console.log(
      `[MindArchive] Claude API: extracted ${messages.length} messages`
    );

    return { messages, title, model };
  } catch (err) {
    console.error("[MindArchive] Claude API: fetch failed", err);
    return null;
  }
}

// ─── API Helpers ────────────────────────────────────────────

/** Extract conversation_id from URL: claude.ai/chat/{uuid} */
function getConversationId(): string | null {
  const m = window.location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
  return m ? m[1] : null;
}

/** Fetch the first organization uuid */
async function fetchOrgId(): Promise<string | null> {
  try {
    const resp = await fetch("/api/organizations", { credentials: "include" });
    if (!resp.ok) return null;
    const orgs: { uuid: string }[] = await resp.json();
    return orgs[0]?.uuid || null;
  } catch {
    return null;
  }
}

/** Convert ClaudeApiResponse.chat_messages → Message[] */
function convertApiMessages(data: ClaudeApiResponse): Message[] {
  // Sort by index ascending (conversation order)
  const sorted = [...data.chat_messages].sort((a, b) => a.index - b.index);

  return sorted.map((msg) => ({
    role: msg.sender === "human" ? ("user" as const) : ("assistant" as const),
    content: msg.text, // raw markdown — do not parse
    timestamp: msg.created_at,
    uuid: msg.uuid,
    truncated: msg.truncated,
    attachments: msg.attachments,
  }));
}


