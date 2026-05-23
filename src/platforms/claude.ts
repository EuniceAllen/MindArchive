// ============================================================
// MindArchive — Claude Platform Adapter
// ============================================================
//
// Claude.ai DOM structure (inferred for 2025–2026 versions):
//
//   claude.ai renders conversations in a single-column chat layout.
//   The page uses React with dynamically hashed CSS class names
//   (Tailwind + CSS Modules), making class-based selectors fragile.
//
//   Observed stable markers (priority order):
//   1. data-testid attributes — if present, these are the most
//      reliable.  Typical values seen in earlier builds:
//        [data-testid="user-message"]     — user message block
//        [data-testid="assistant-message"] — Claude's reply
//      These may not exist in all deployments, so we fall back.
//
//   2. data-message-author-role / data-role — semantic attributes
//      that some Claude builds inject (similar to ChatGPT).  We
//      check these before resorting to class-name heuristics.
//
//   3. Structural heuristic: the main conversation area is a
//      scrollable <div> whose direct children (or grandchildren
//      grouped in <div> wrappers) alternate between user turns
//      and assistant turns.  User messages often contain a
//      substring "Human" or "user" in an ancestor, while the rest
//      belong to Claude.
//
//   4. Content extraction: Claude renders assistant responses
//      inside a markdown/prose container (often a <div> with
//      class containing "prose" or inside the message wrapper).
//      We strip interactive chrome (buttons, copy icons, etc.)
//      and use textContent with innerText fallback when empty.
//
// Strategy for this adapter:
//   - Try data-testid first
//   - Fall back to structural sibling-grouping
//   - detectRole() checks data attributes then class hints,
//     walking up to 3 ancestor levels
//   - extractTextContent() tries textContent, falls back to
//     innerText for elements that hide text via CSS
// ============================================================

import type { PlatformAdapter } from "./base";
import type { Conversation, Message } from "@/core/types";

export class ClaudeAdapter implements PlatformAdapter {
  readonly id = "claude";
  readonly name = "Claude";

  detect(): boolean {
    return window.location.hostname === "claude.ai";
  }

  extractMessages(): Message[] {
    const messages: Message[] = [];
    const blocks = this.findMessageBlocks();

    for (const block of blocks) {
      const role = this.detectRole(block);
      const content = this.extractTextContent(block);
      if (!content) continue;

      messages.push({
        role,
        content,
        timestamp: this.extractTimestamp(block),
      });
    }

    return messages;
  }

  extractTitle(): string {
    // Claude page title — remove trailing " - Claude" suffix
    const raw = document.title || "";
    const cleaned = raw.replace(/\s*[-–|]\s*Claude.*$/i, "").trim();
    if (cleaned && cleaned.length < 200) return cleaned;

    // Fallbacks
    const selectors = [
      '[data-testid="chat-title"]',
      'nav [class*="title"]',
      'h1[class*="conversation"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text && text.length < 200) return text;
    }

    return "Untitled Conversation";
  }

  observeNewMessages(onNewMessage: (messages: Message[]) => void): () => void {
    let seenCount = this.findMessageBlocks().length;

    const observer = new MutationObserver(() => {
      const currentBlocks = this.findMessageBlocks();
      if (currentBlocks.length > seenCount) {
        const newBlocks = currentBlocks.slice(seenCount);
        const newMessages: Message[] = [];

        for (const block of newBlocks) {
          const role = this.detectRole(block);
          const content = this.extractTextContent(block);
          if (!content) continue;

          newMessages.push({
            role,
            content,
            timestamp: this.extractTimestamp(block),
          });
        }

        seenCount = currentBlocks.length;
        if (newMessages.length > 0) {
          onNewMessage(newMessages);
        }
      }
    });

    const root = this.findConversationRoot() || document.body;
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }

  async captureConversation(): Promise<Conversation> {
    const messages = this.extractMessages();
    return {
      id: this.generateId(),
      platform: this.id,
      title: this.extractTitle(),
      url: window.location.href,
      messages,
      capturedAt: new Date().toISOString(),
    };
  }

  // ─── Private helpers ───────────────────────────────────────

  /**
   * Find all message block elements in DOM order.
   *
   * Priority:
   *   1. data-testid selectors (most stable)
   *   2. data-message-author-role attribute
   *   3. Structural: direct children of conversation root
   *      (alternating user / assistant)
   *   4. Last-resort class-name heuristics
   */
  private findMessageBlocks(): Element[] {
    // Strategy 1: data-testid attributes
    const viaTestid = document.querySelectorAll(
      '[data-testid="user-message"], [data-testid="assistant-message"], ' +
      '[data-testid="user-message-content"], [data-testid="assistant-message-content"]'
    );
    if (viaTestid.length > 0) {
      return this.sortByDOMOrder(Array.from(viaTestid));
    }

    // Strategy 2: semantic data-message-author-role
    const viaRoleAttr = document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    );
    if (viaRoleAttr.length > 0) {
      return Array.from(viaRoleAttr);
    }

    // Strategy 3: Structural — conversation root direct children
    const root = this.findConversationRoot();
    if (root) {
      // Claude tends to group each turn in a wrapper <div> that
      // is a direct child (or grandchild) of the scroll container.
      // Look for elements that contain prose text and are siblings.
      const children = Array.from(root.children);
      const candidates = children.filter((child) => {
        const text = child.textContent?.trim() || "";
        // A message block has meaningful text content
        return text.length > 20;
      });

      if (candidates.length >= 2) {
        return candidates;
      }

      // Deeper scan: children of children
      const deepCandidates: Element[] = [];
      for (const child of children) {
        const subs = child.querySelectorAll('[class*="prose"], [class*="message"], [class*="Message"]');
        if (subs.length === 0) {
          // If the child itself has text, treat it as a message
          if ((child.textContent?.trim() || "").length > 20) {
            deepCandidates.push(child);
          }
        } else {
          deepCandidates.push(...Array.from(subs));
        }
      }

      if (deepCandidates.length >= 2) {
        return this.sortByDOMOrder(deepCandidates);
      }
    }

    // Strategy 4: last-resort class-name heuristics
    const allMsg = document.querySelectorAll(
      '[class*="font-user-message"], [class*="font-claude-message"], ' +
      '[class*="Human"], [class*="user-message"], [class*="assistant-message"]'
    );
    return this.sortByDOMOrder(Array.from(allMsg));
  }

  /**
   * Determine if a message block is from the user or Claude.
   * Checks data attributes first, then walks up to 3 ancestor
   * levels examining class names.
   */
  private detectRole(block: Element): Message["role"] {
    // Check the element itself for semantic attributes
    if (
      block.getAttribute("data-message-author-role") === "user" ||
      block.getAttribute("data-role") === "user" ||
      block.getAttribute("data-sender") === "user" ||
      block.getAttribute("data-testid")?.includes("user")
    ) {
      return "user";
    }

    if (
      block.getAttribute("data-message-author-role") === "assistant" ||
      block.getAttribute("data-role") === "assistant" ||
      block.getAttribute("data-testid")?.includes("assistant")
    ) {
      return "assistant";
    }

    // Walk up ancestors (self + 3 levels) checking class names
    let current: Element | null = block;
    for (let i = 0; i < 4 && current; i++) {
      const cls = (current.className || "").toString().toLowerCase();

      if (
        cls.includes("user") ||
        cls.includes("human")
      ) {
        return "user";
      }

      if (
        cls.includes("assistant") ||
        cls.includes("claude") ||
        cls.includes("bot")
      ) {
        return "assistant";
      }

      current = current.parentElement;
    }

    // Default: most blocks without a clear "user" marker are
    // Claude's responses (assistant messages dominate the DOM)
    return "assistant";
  }

  /**
   * Extract clean text from a message block.
   * Strips UI chrome (buttons, copy icons, feedback row, etc.)
   * and uses innerText as fallback when textContent is empty
   * (some React rendering hides text from textContent).
   */
  private extractTextContent(block: Element): string {
    const clone = block.cloneNode(true) as HTMLElement;

    // Remove interactive and visually-hidden elements
    clone.querySelectorAll(
      'button, [role="button"], [aria-hidden="true"], ' +
      '.sr-only, .hidden, ' +
      // Claude-specific UI chrome
      '[class*="copy"], [class*="Copy"], ' +
      '[class*="feedback"], [class*="Feedback"], ' +
      '[class*="action"], [class*="Action"], ' +
      '[class*="retry"], [class*="Retry"], ' +
      '[class*="toolbar"], [class*="Toolbar"]'
    ).forEach((el) => el.remove());

    // Try textContent first
    const text = (clone.textContent || "").trim();
    if (text) return text;

    // Fall back to innerText for elements that hide text via CSS
    // (some React markdown renderers use CSS to hide/show content)
    const inner = clone.innerText?.trim();
    return inner || "";
  }

  private extractTimestamp(block: Element): string | undefined {
    const timeEl = block.querySelector("time");
    return timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim() || undefined;
  }

  private findConversationRoot(): Element | null {
    const selectors = [
      '[data-testid="conversation"]',
      '[data-testid="chat"]',
      '[role="main"]',
      'main',
      '[class*="conversation"]',
      '[class*="chat-container"]',
      '[class*="Chat"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Heuristic: find the largest scrollable div with text content
    const scrollables = Array.from(
      document.querySelectorAll('div[class*="overflow"]')
    ).filter((el) => {
      return el.scrollHeight > el.clientHeight &&
             (el.textContent?.length || 0) > 200;
    });
    if (scrollables.length > 0) {
      // Return the one with most text (likely the conversation area)
      return scrollables.reduce((a, b) =>
        (a.textContent?.length || 0) > (b.textContent?.length || 0) ? a : b
      );
    }

    return null;
  }

  /** Sort elements by their position in the DOM tree */
  private sortByDOMOrder(elements: Element[]): Element[] {
    // Deduplicate then sort by document position
    const unique = Array.from(new Set(elements));
    return unique.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${this.id}_${ts}_${rand}`;
  }
}
