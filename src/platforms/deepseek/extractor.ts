// ============================================================
// MindArchive — DeepSeek Message Extractor
// ============================================================
// CONFIRMED DOM (from DevTools diagnostic, 2025-05):
//
//   All messages:  .ds-message  (both user & assistant)
//   AI content:    .ds-assistant-message-main-content
//   Markdown:      .ds-markdown > .ds-markdown-paragraph
//   Code blocks:   .md-code-block
//
//   Role: contains .ds-assistant-message-main-content → assistant
//         otherwise → user
// ============================================================

import type { Message } from "@/core/types";

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

