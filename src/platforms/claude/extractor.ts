// ============================================================
// MindArchive — Claude Message Extractor
// ============================================================
// Based on ChatGPT extractor pattern. Uses CONFIRMED selectors
// from claude.ai page source analysis (2025-05).
//
// ## Confirmed selectors
//
// User:   [data-testid="user-message"]
// Claude: .font-claude-response
//
// Both are semantic (data-testid) or stable class names that
// have persisted across Claude UI versions.
// ============================================================

import type { Message } from "@/core/types";

// ─── Primary Selectors ──────────────────────────────────────

const USER_SELECTOR = '[data-testid="user-message"]';
const CLAUDE_SELECTOR = '.font-claude-response';

// ─── UI Elements to Strip ───────────────────────────────────

const UI_STRIP = [
  "style", "script", "noscript",
  "button", '[role="button"]',
  ".sr-only", '[aria-hidden="true"]', ".hidden",
];

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
      previews: messages.map((m) =>
        `${m.role}: ${m.content.slice(0, 80)}...`
      ),
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

// ─── Internal ───────────────────────────────────────────────

function doExtract(): Message[] {
  const messages: Message[] = [];

  // Collect all message elements
  const userEls = document.querySelectorAll(USER_SELECTOR);
  const claudeEls = document.querySelectorAll(CLAUDE_SELECTOR);

  // Build ordered list by DOM position
  const all = sortByDOM([
    ...Array.from(userEls).map((el) => ({ el, role: "user" as const })),
    ...Array.from(claudeEls).map((el) => ({ el, role: "assistant" as const })),
  ]);

  for (const { el, role } of all) {
    const content = extractCleanText(el);
    if (!content) continue;

    messages.push({
      role,
      content,
      timestamp: extractTimestamp(el),
    });
  }

  return messages;
}

// ─── Helpers ────────────────────────────────────────────────

function extractCleanText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;

  // Strip UI elements
  for (const sel of UI_STRIP) {
    clone.querySelectorAll(sel).forEach((c) => c.remove());
  }

  // Fence code blocks before getting textContent
  fenceCodeBlocks(clone);

  const text = (clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 5) return "";
  return text;
}

/** Wrap <pre>, <code>, .full-prompt blocks in ``` fences */
function fenceCodeBlocks(root: HTMLElement): void {
  const selectors = "pre, code, .full-prompt, [data-language]";
  const els = Array.from(root.querySelectorAll(selectors)).reverse();

  for (const el of els) {
    if (!el.parentNode) continue;
    if (el.tagName === "CODE" && el.closest("pre")) continue;

    const code = (el.textContent || "").trim();
    if (code.length < 5) continue;

    const lang = el.getAttribute("data-language") || "";
    const span = document.createElement("span");
    span.textContent = `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    el.parentNode.replaceChild(span, el);
  }
}

function extractTimestamp(el: Element): string | undefined {
  const timeEl = el.querySelector("time");
  return timeEl?.getAttribute("datetime")
    || timeEl?.textContent?.trim()
    || undefined;
}

function sortByDOM<T extends { el: Element }>(items: T[]): T[] {
  return items.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}
