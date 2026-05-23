// ============================================================
// MindArchive — ChatGPT Message Extractor
// ============================================================
// Responsible for reading ALL visible messages from the
// ChatGPT DOM and converting them to structured Message[].
//
// ## Strategy (in priority order)
//
// 1. [data-message-author-role] — the most stable semantic
//    attribute ChatGPT uses. Present on every message wrapper.
//    Values: "user" | "assistant"
//
// 2. Fallback: scan for <article> conversation turns
//    (older ChatGPT UI, kept for backward compatibility)
//
// 3. Last resort: heuristic scan of the main conversation area
//
// ## Why NOT hashed class names
//
// ChatGPT uses CSS Modules / styled-components which generate
// random class hashes like .flex-xxx, .group-yyy on every deploy.
// These are UNSTABLE. Semantic data attributes are stable.
// ============================================================

import type { Message } from "@/core/types";
import type { ExtractionResult } from "./types";

// ─── Primary Selector ───────────────────────────────────────
// [data-message-author-role] is the canonical semantic marker
// ChatGPT uses to distinguish user vs assistant messages.
// It has persisted across many ChatGPT UI rewrites.
// ============================================================

const ROLE_SELECTOR = '[data-message-author-role]';

// ─── UI Elements to Strip ───────────────────────────────────
// These are interactive controls inside message containers
// that we should NOT include in the extracted text.
// ============================================================

const UI_STRIP_SELECTORS = [
  "button",                // Copy, thumbs up/down, regenerate, etc.
  '[role="button"]',
  ".sr-only",             // Screen-reader-only text
  '[aria-hidden="true"]',
];

// ─── Public API ─────────────────────────────────────────────

/**
 * Count [data-message-author-role] elements currently in the DOM.
 * Used by observer and history loader to detect changes.
 */
export function countMessageElements(): number {
  return document.querySelectorAll(ROLE_SELECTOR).length;
}

/**
 * Extract all visible messages from the ChatGPT DOM.
 *
 * Returns messages in DOM order (top-to-bottom = chronological).
 * Skips empty messages and system/injected UI text.
 *
 * @param debug - If true, logs extraction details to console
 */
export function extractMessages(debug = true): Message[] {
  const result = doExtract();

  if (debug) {
    console.log("[MindArchive] ChatGPT extraction result:", {
      selector: ROLE_SELECTOR,
      roleElementsFound: result.totalRoleElements,
      messagesExtracted: result.extractedCount,
      previews: result.messages.map((m) =>
        `${m.role}: ${m.content.slice(0, 60)}...`
      ),
    });
  }

  return result.messages;
}

/**
 * Extract the conversation title from the ChatGPT page.
 */
export function extractTitle(): string {
  const candidates = [
    // Priority 1: page title (ChatGPT sets document.title to the chat title)
    () => {
      const raw = document.title || "";
      // Strip "ChatGPT" suffix: "My Chat - ChatGPT" → "My Chat"
      return raw.replace(/\s*[-–|]\s*ChatGPT.*$/i, "").trim();
    },
    // Priority 2: look for heading in the chat area
    () => {
      const h1 = document.querySelector("h1");
      return h1?.textContent?.trim() || "";
    },
  ];

  for (const fn of candidates) {
    const title = fn();
    if (title && title.length > 0 && title.length < 200) {
      return title;
    }
  }

  return "Untitled Conversation";
}

/**
 * Locate the actual scrollable conversation container in ChatGPT.
 *
 * ChatGPT does NOT use `window` or `document.body` for scrolling.
 * It uses an internal div — but sometimes the native scrollTop is
 * intercepted by a JS virtual scroller, making direct assignment
 * ineffective.
 *
 * ## Detection strategy:
 *
 * 1. Collect all elements with computed `overflow-y: auto|scroll`
 *    that contain [data-message-author-role]
 * 2. Sort by scrollable area size (largest first)
 * 3. Test each candidate: try setting scrollTop by 1px
 * 4. If direct assignment fails, try scrollTo()
 * 5. If both fail, walk UP the DOM tree
 * 6. Return the first element where scrollTop can actually change
 */
export function findConversationRoot(): HTMLElement | null {
  const allElements = document.querySelectorAll("*");

  // Step 1: collect candidates with overflow-y: auto|scroll
  const candidates: HTMLElement[] = [];

  for (const el of allElements) {
    const htmlEl = el as HTMLElement;
    const style = window.getComputedStyle(htmlEl);
    const overflowY = style.overflowY;

    if (overflowY === "auto" || overflowY === "scroll") {
      // Only consider elements that actually contain messages
      if (htmlEl.querySelector('[data-message-author-role]')) {
        candidates.push(htmlEl);
      }
    }
  }

  console.log(
    `[MindArchive] 🔍 Found ${candidates.length} overflow-y containers with messages`
  );

  // Step 2: sort by scrollable room (largest first)
  candidates.sort((a, b) => {
    const aRoom = a.scrollHeight - a.clientHeight;
    const bRoom = b.scrollHeight - b.clientHeight;
    return bRoom - aRoom;
  });

  // Step 3: test each candidate — the first one where scrollTop
  // can actually change is our winner
  for (const el of candidates) {
    if (el.scrollHeight <= el.clientHeight) continue; // no room to scroll

    // Try direct scrollTop assignment
    const prev = el.scrollTop;
    el.scrollTop = prev + 5;
    if (el.scrollTop !== prev) {
      el.scrollTop = prev; // restore
      logFound(el, "scrollTop direct");
      return el;
    }

    // Try scrollTo() — some JS virtual scrollers intercept this differently
    el.scrollTo({ top: prev + 5, behavior: "instant" as ScrollBehavior });
    if (el.scrollTop !== prev) {
      el.scrollTop = prev;
      logFound(el, "scrollTo()");
      return el;
    }

    // Walk up to parent — maybe the parent handles scrolling
    let parent = el.parentElement;
    for (let level = 0; level < 3 && parent; level++) {
      const pPrev = parent.scrollTop;
      parent.scrollTop = pPrev + 5;
      if (parent.scrollTop !== pPrev) {
        parent.scrollTop = pPrev;
        logFound(parent, `parent level ${level + 1}`);
        return parent;
      }
      parent.scrollTo({ top: pPrev + 5, behavior: "instant" as ScrollBehavior });
      if (parent.scrollTop !== pPrev) {
        parent.scrollTop = pPrev;
        logFound(parent, `parent level ${level + 1} via scrollTo()`);
        return parent;
      }
      parent = parent.parentElement;
    }
  }

  // Step 4: fallback — try <main>
  const main = document.querySelector("main");
  if (main) {
    const prev = main.scrollTop;
    main.scrollTop = prev + 5;
    if (main.scrollTop !== prev) {
      main.scrollTop = prev;
      console.log("[MindArchive] ⚠️ Fallback: using <main> as scroll container");
      return main;
    }
  }

  // Step 5: last resort — find ANY element on the page where scrollTop works
  console.warn("[MindArchive] ⚠️ No ideal container found. Searching for any scrollable element...");
  for (const el of allElements) {
    const htmlEl = el as HTMLElement;
    if (htmlEl.scrollHeight <= htmlEl.clientHeight) continue;
    const prev = htmlEl.scrollTop;
    htmlEl.scrollTop = prev + 5;
    if (htmlEl.scrollTop !== prev) {
      htmlEl.scrollTop = prev;
      console.log(`[MindArchive] ⚠️ Last resort: <${htmlEl.tagName.toLowerCase()}> (no message filter)`);
      return htmlEl;
    }
  }

  console.warn("[MindArchive] ❌ No scrollable container found anywhere on the page!");
  return null;
}

/** Log details about the found scroll container */
function logFound(el: HTMLElement, method: string): void {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = (typeof el.className === "string" && el.className)
    ? `.${el.className.split(" ").slice(0, 2).join(".")}`
    : "";
  console.log(
    `[MindArchive] ✅ Scroll container (${method}): <${tag}${id}${cls}>`,
    { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: el.scrollTop }
  );
}

// ─── Internal ───────────────────────────────────────────────

function doExtract(): ExtractionResult {
  // Step 1: Find ALL elements with data-message-author-role
  const roleElements = document.querySelectorAll(ROLE_SELECTOR);
  const totalRoleElements = roleElements.length;

  if (totalRoleElements === 0) {
    console.warn(
      "[MindArchive] No [data-message-author-role] elements found. " +
        "The ChatGPT DOM may have changed. Trying fallback selectors..."
    );
    return fallbackExtract();
  }

  // Step 2: For each role element, extract the message
  // We use a Set to avoid processing the same message container twice
  // (a single message container might have nested role elements)
  const seenContainers = new Set<Element>();
  const messages: Message[] = [];

  for (const roleEl of roleElements) {
    // Find the outermost message container for this role element
    const container = findMessageContainer(roleEl);
    if (!container || seenContainers.has(container)) continue;
    seenContainers.add(container);

    // Determine role from the data attribute value
    const roleValue = roleEl.getAttribute("data-message-author-role");
    const role: Message["role"] =
      roleValue === "user" ? "user" : "assistant";

    // Extract clean text content
    const content = extractCleanText(container);
    if (!content) continue; // Skip empty messages

    const timestamp = extractTimestamp(container);

    messages.push({ role, content, timestamp });
  }

  return {
    messages,
    totalRoleElements,
    extractedCount: messages.length,
  };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Given a [data-message-author-role] element, walk up the DOM
 * to find the complete message container (the wrapper that
 * includes the full message bubble + optional UI chrome).
 *
 * We go up at most 5 levels to avoid escaping into the global
 * conversation container.
 */
function findMessageContainer(roleEl: Element): Element | null {
  let current: Element | null = roleEl;
  const maxLevels = 5;

  for (let i = 0; i < maxLevels && current; i++) {
    // Check if this level looks like a complete message wrapper
    // A message wrapper typically has sibling message containers
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    // If the parent contains multiple [data-message-author-role]
    // siblings, we've gone too far — return current level
    const siblings = parent.querySelectorAll(ROLE_SELECTOR);
    if (siblings.length > 1) {
      return current;
    }

    current = parent;
  }

  return roleEl;
}

/**
 * Extract clean, human-readable text from a message container.
 * Strips out button labels, action text, and UI chrome.
 */
function extractCleanText(container: Element): string {
  // Clone the container so we can safely mutate it
  const clone = container.cloneNode(true) as HTMLElement;

  // Strip UI elements
  for (const sel of UI_STRIP_SELECTORS) {
    clone.querySelectorAll(sel).forEach((el) => {
      // Don't remove elements that contain actual message content
      const text = (el.textContent || "").trim();
      if (text.length < 100) {
        el.remove();
      }
    });
  }

  // Get remaining text
  const text = (clone.textContent || "").trim();

  // Normalize whitespace:
  // - Collapse multiple blank lines into max 2
  // - Remove leading/trailing whitespace from each line
  const normalized = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return normalized;
}

/**
 * Attempt to extract a timestamp from a message container.
 * ChatGPT sometimes includes <time> elements with datetime.
 */
function extractTimestamp(container: Element): string | undefined {
  const timeEl = container.querySelector("time");
  if (timeEl) {
    return timeEl.getAttribute("datetime") || timeEl.textContent?.trim();
  }
  return undefined;
}

// ─── Fallback ───────────────────────────────────────────────
// If [data-message-author-role] doesn't match anything,
// try older ChatGPT DOM patterns.

function fallbackExtract(): ExtractionResult {
  const messages: Message[] = [];

  // Try <article> with data-testid
  const articles = document.querySelectorAll(
    'article[data-testid^="conversation-turn-"]'
  );

  for (const article of articles) {
    const userEl = article.querySelector(
      '[data-message-author-role="user"]'
    );
    const role: Message["role"] = userEl ? "user" : "assistant";
    const content = extractCleanText(article);
    if (!content) continue;

    messages.push({ role, content });
  }

  return {
    messages,
    totalRoleElements: articles.length,
    extractedCount: messages.length,
  };
}
