// ============================================================
// MindArchive — ChatGPT Message Extractor
// ============================================================
// Two extraction strategies (API preferred, DOM fallback):
//
// ## API extraction (primary)
//   Reads window.__mindarchive_chatgpt_cache__ populated by
//   the MAIN-world interceptor (interceptor.js) which hooks
//   the page's own fetch() to capture /backend-api/conversation/.
//   Zero manual network requests — passively intercepts the
//   page's own API call.
//
// ## DOM extraction (fallback)
//   1. [data-message-author-role] — the most stable semantic
//      attribute ChatGPT uses. Present on every message wrapper.
//      Values: "user" | "assistant"
//   2. Fallback: scan for <article> conversation turns
//      (older ChatGPT UI, kept for backward compatibility)
//
// ## Why NOT hashed class names
//
// ChatGPT uses CSS Modules / styled-components which generate
// random class hashes like .flex-xxx, .group-yyy on every deploy.
// These are UNSTABLE. Semantic data attributes are stable.
// ============================================================

import type { Message } from "@/core/types";
import type { ExtractionResult, ChatGPTApiResponse, ChatGPTApiMessageNode, ChatGPTApiMessageMetadata } from "./types";

// ─── Cross-World Cache Bridge ───────────────────────────────
// The MAIN-world interceptor sets data on its own window, which
// the isolated world CANNOT read directly. We bridge via postMessage:
// interceptor → postMessage → this listener → isolated world's window.

const CACHE_KEY = "__mindarchive_chatgpt_cache__";
const CACHE_EVENT = "__mindarchive_chatgpt_cache_update__";

// Register early — cache may arrive before fetchConversationFromApi() is called
window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.data?.type === CACHE_EVENT && event.data?.payload) {
    (window as unknown as Record<string, unknown>)[CACHE_KEY] = event.data.payload;
  }
  if (event.data?.type === "__mindarchive_chatgpt_cache_clear__") {
    (window as unknown as Record<string, unknown>)[CACHE_KEY] = null;
  }
});

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

  // Preserve images as Markdown placeholders before text extraction
  preserveImages(clone);

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

/**
 * Replace all <img> elements with Markdown ![alt](src) text nodes
 * so they survive textContent extraction as readable placeholders.
 */
function preserveImages(root: HTMLElement): void {
  const imgs = Array.from(root.querySelectorAll("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
    const alt = img.getAttribute("alt") || img.getAttribute("title") || "Image";

    // Build a Markdown image placeholder
    let placeholder: string;
    if (src && (src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:"))) {
      placeholder = `![${alt}](${src})`;
    } else if (src) {
      placeholder = `![${alt}]({{${src}}})`; // relative path — user can replace
    } else {
      placeholder = `[🖼 ${alt}]`;
    }

    const span = document.createElement("span");
    span.textContent = placeholder;
    img.parentNode?.replaceChild(span, img);
  }

  // Also handle <figure> wrappers that contain only an <img>
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
// API Extraction (primary strategy)
// ============================================================
// Reads conversation data from window.__mindarchive_chatgpt_cache__
// which is bridged here from the MAIN-world interceptor via postMessage.

function getCachedData(): ChatGPTApiResponse | null {
  return (window as unknown as Record<string, unknown>)[CACHE_KEY] as ChatGPTApiResponse | null;
}

/**
 * Try to get the conversation from the intercepted API cache.
 *
 * Three-tier flow:
 *   1. Immediate cache check — data may have arrived before we were called
 *   2. Wait for postMessage from interceptor (page may still be loading)
 *   3. Timeout → return null (caller falls back to DOM)
 */
export async function fetchConversationFromApi(): Promise<{
  messages: Message[];
  title: string;
  model: string;
} | null> {
  // 1. Immediate cache check
  const immediate = getCachedData();
  if (immediate?.mapping) {
    console.log("[MindArchive] ChatGPT: cache found immediately, returning");
    return convertCacheToResult(immediate);
  }

  // 2. Wait for interceptor to populate cache (page may still be loading)
  console.log("[MindArchive] ChatGPT: cache empty, waiting for interceptor...");
  const data = await waitForCache(5000);

  if (data?.mapping) {
    console.log("[MindArchive] ChatGPT: cache received via postMessage");
    return convertCacheToResult(data);
  }

  console.warn("[MindArchive] ChatGPT: cache timed out — API unavailable");
  return null;
}

// ─── Cache Wait ─────────────────────────────────────────────

function waitForCache(timeoutMs: number): Promise<ChatGPTApiResponse | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, timeoutMs);

    function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type === CACHE_EVENT) {
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        const payload = event.data.payload as ChatGPTApiResponse | null;
        resolve(payload?.mapping ? payload : null);
      }
    }

    window.addEventListener("message", handler);
  });
}

// ─── Cache → Result Conversion ─────────────────────────────

function convertCacheToResult(data: ChatGPTApiResponse): {
  messages: Message[];
  title: string;
  model: string;
} {
  const messages = convertApiMessages(data);
  const title = data.title || extractTitle();
  const model = data.default_model_slug || "";

  console.log(
    `[MindArchive] ChatGPT API: extracted ${messages.length} messages`
  );

  return { messages, title, model };
}

// ─── Tree Walk ──────────────────────────────────────────────

/**
 * Convert ChatGPT API response → Message[] in chronological order.
 *
 * ChatGPT stores messages in a mapping tree. We walk from the root
 * (node with parent==null) forward following children to collect
 * all visible user/assistant messages in order.
 *
 * For branched conversations, we follow children[0] (the original
 * path). If current_node is present, we walk parent→root then reverse.
 */
function convertApiMessages(data: ChatGPTApiResponse): Message[] {
  const mapping = data.mapping!;
  const currentNode = data.current_node;

  // Strategy A: walk from current_node back to root via parent pointers
  if (currentNode && mapping[currentNode]) {
    const path = walkToRoot(mapping, currentNode);
    return pathToMessages(path);
  }

  // Strategy B: walk from root forward following children[0]
  return walkFromRoot(mapping);
}

function walkToRoot(
  mapping: Record<string, ChatGPTApiMessageNode>,
  startId: string
): ChatGPTApiMessageNode[] {
  const path: ChatGPTApiMessageNode[] = [];
  const visited = new Set<string>();
  let nodeId: string | undefined = startId;

  while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
    visited.add(nodeId);
    const node: ChatGPTApiMessageNode = mapping[nodeId];
    path.push(node);
    nodeId = node.parent ?? undefined;
  }

  path.reverse(); // root → current
  return path;
}

function walkFromRoot(
  mapping: Record<string, ChatGPTApiMessageNode>
): Message[] {
  // Find the root node (parent == null)
  const root = Object.values(mapping).find((n) => n.parent === null);
  if (!root || root.children.length === 0) return [];

  // Walk forward following children[0] (the "main" branch)
  const path: ChatGPTApiMessageNode[] = [];
  const visited = new Set<string>();
  let current: ChatGPTApiMessageNode | undefined = mapping[root.children[0]];

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push(current);
    current = current.children.length > 0
      ? mapping[current.children[0]]
      : undefined;
  }

  return pathToMessages(path);
}

function pathToMessages(path: ChatGPTApiMessageNode[]): Message[] {
  const messages: Message[] = [];
  for (const node of path) {
    const msg = nodeToMessage(node);
    if (msg) messages.push(msg);
  }
  return messages;
}

// ─── Node → Message Conversion ─────────────────────────────

/**
 * Convert a single mapping node → Message.
 * Returns null for:
 *   - Nodes without a message (root placeholders)
 *   - System/tool messages
 *   - Visually hidden messages (internal)
 *   - model_editable_context messages (internal)
 *   - Empty content
 */
function nodeToMessage(node: ChatGPTApiMessageNode): Message | null {
  const msg = node.message;
  if (!msg) return null;

  const role = msg.author.role;
  if (role === "system" || role === "tool") return null;

  // Skip visually hidden messages (internal scaffolding)
  if (msg.metadata?.is_visually_hidden_from_conversation) return null;

  // Skip internal context messages (no visible parts)
  if (msg.content?.content_type === "model_editable_context") return null;

  // Extract text from parts[] (with image placeholders)
  let content = extractContentFromParts(msg.content?.parts);

  // Append images from metadata.image_results (web search gallery / DALL-E)
  const metaImages = extractImagesFromMetadata(msg.metadata);
  if (metaImages) {
    content = content ? content + "\n\n" + metaImages : metaImages;
  }

  if (!content) return null;

  const timestamp = msg.create_time
    ? new Date(msg.create_time * 1000).toISOString()
    : undefined;

  return {
    role: role === "user" ? "user" : "assistant",
    content,
    timestamp,
    uuid: msg.id,
  };
}

/** Flatten content.parts[] into a single text string, preserving image placeholders */
function extractContentFromParts(parts: string[] | undefined): string {
  if (!parts || parts.length === 0) return "";

  return parts
    .map((part) => {
      if (typeof part === "string") {
        // Strip special citation/entity markers (\ue000–\ue0ff)
        return part.replace(/[\uE000-\uE0FF]/g, "").trim();
      }

      // Handle object parts
      if (typeof part === "object" && part !== null) {
        const obj = part as Record<string, unknown>;
        const contentType = String(obj.content_type ?? "");

        // ── Image parts (DALL-E generated, multimodal uploads, etc.) ──
        if (contentType.startsWith("image") || obj.asset_pointer) {
          return imagePartToPlaceholder(obj);
        }

        // ── Text parts ──────────────────────────────────────
        if (typeof obj.text === "string") {
          return (obj.text as string).replace(/[\uE000-\uE0FF]/g, "").trim();
        }

        // ── Other known non-text types: skip silently ───────
        if (contentType === "model_editable_context" || contentType === "execution_output") {
          return "";
        }
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Convert an image part object from the ChatGPT API into a
 * Markdown image placeholder.
 *
 * Expected shapes:
 *   { content_type: "image_asset_pointer", asset_pointer: "file-service://file-xxx", ... }
 *   { content_type: "image", asset_pointer: "file-service://file-xxx", metadata: { dalle: {...} } }
 */
function imagePartToPlaceholder(obj: Record<string, unknown>): string {
  const assetPointer = String(obj.asset_pointer ?? "");

  // Convert file-service://file-xxx → https://files.oaiusercontent.com/file-xxx
  let url = "";
  if (assetPointer.startsWith("file-service://")) {
    url = "https://files.oaiusercontent.com/" + assetPointer.slice("file-service://".length);
  }

  // Try to get a meaningful alt text
  const dalleMeta = (obj.metadata as Record<string, unknown> | undefined)?.dalle as Record<string, unknown> | undefined;
  const prompt = typeof dalleMeta?.prompt === "string" ? dalleMeta.prompt : "";
  const alt = prompt
    ? prompt.slice(0, 80) + (prompt.length > 80 ? "…" : "")
    : "AI Generated Image";

  if (url) {
    return `![${alt}](${url})`;
  }
  return `[🖼 ${alt}]`;
}

/**
 * Extract image placeholders from message metadata.
 *
 * ChatGPT stores image search results and DALL-E generations in:
 *   - metadata.image_results[]  — web image search gallery
 *   - metadata.content_references[] — may contain image media
 */
function extractImagesFromMetadata(
  metadata: ChatGPTApiMessageMetadata | undefined
): string {
  if (!metadata) return "";

  const lines: string[] = [];

  // image_results: web search image gallery
  const imageResults = metadata.image_results;
  if (Array.isArray(imageResults) && imageResults.length > 0) {
    for (const img of imageResults) {
      if (!img || typeof img !== "object") continue;
      const obj = img as Record<string, unknown>;
      const src = stringOr(obj, "image_url", "url", "src", "original_url");
      const alt = stringOr(obj, "title", "alt", "caption", "name") || "Search Result Image";
      if (src) {
        lines.push(`![${alt}](${src})`);
      } else {
        lines.push(`[🖼 ${alt}]`);
      }
    }
  }

  // content_references: may contain image/video media
  const contentRefs = metadata.content_references;
  if (Array.isArray(contentRefs) && contentRefs.length > 0) {
    for (const ref of contentRefs) {
      if (!ref || typeof ref !== "object") continue;
      const obj = ref as Record<string, unknown>;
      const type = String(obj.type ?? obj.media_type ?? "");
      if (!type || type === "image" || type === "photo") {
        const src = stringOr(obj, "url", "image_url", "src");
        const alt = stringOr(obj, "title", "alt", "name") || "Attached Image";
        if (src) {
          lines.push(`![${alt}](${src})`);
        }
      }
    }
  }

  return lines.join("\n");
}

// ─── Fallback ───────────────────────────────────────────────
// If [data-message-author-role] doesn't match anything,
// try older ChatGPT DOM patterns.

/** Pick the first non-empty string from a set of keys on an object */
function stringOr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

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
