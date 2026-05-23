// ============================================================
// MindArchive — Claude Platform Adapter
// ============================================================
// Extracts conversation data from claude.ai DOM.
//
// Claude.ai DOM structure (as of 2025):
//   - Messages are in a scrollable container
//   - User messages use [data-test-render-count] or similar
//   - Assistant messages are identified by distinct styling
//   - Font classes like "font-user-message" or "font-claude-message"
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

    // Claude uses a different DOM structure than ChatGPT.
    // Messages are typically within a scrollable container,
    // with user messages and assistant messages in separate blocks.

    // Strategy: Find all message blocks by looking for
    // font-claude-message and font-user-message class patterns
    const messageBlocks = this.findMessageBlocks();

    for (const block of messageBlocks) {
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
    // Claude shows the chat title in the page or sidebar
    const selectors = [
      'title',
      '[data-testid="chat-title"]',
      '.chat-title',
      'nav [class*="title"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || "").trim();
        // Claude page titles often include "Claude" suffix
        const cleaned = text.replace(/\s*[-–|]\s*Claude.*$/i, "").trim();
        if (cleaned && cleaned.length < 200) return cleaned;
      }
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
   * Claude message blocks: look for elements with
   * font-user-message or font-claude-message classes,
   * or fall back to sibling groups in the chat container.
   */
  private findMessageBlocks(): Element[] {
    // Primary strategy: font-class-based detection
    const userBlocks = document.querySelectorAll('[class*="font-user-message"]');
    const claudeBlocks = document.querySelectorAll('[class*="font-claude-message"]');

    if (userBlocks.length > 0 || claudeBlocks.length > 0) {
      // Combine and sort by DOM order
      const all = new Set<Element>([...userBlocks, ...claudeBlocks]);
      // Find the common ancestor and order children
      return this.sortByDOMOrder(Array.from(all));
    }

    // Fallback: look for message containers in the chat area
    const chatContainer = this.findConversationRoot();
    if (chatContainer) {
      // Messages are direct children or grouped in divs
      const candidates = chatContainer.querySelectorAll('[class*="message"], [class*="Message"]');
      return Array.from(candidates);
    }

    return [];
  }

  /** Determine if a message block is from the user or Claude */
  private detectRole(block: Element): Message["role"] {
    const className = block.className || "";
    const parentClass = block.parentElement?.className || "";

    if (className.includes("user") || parentClass.includes("user")) {
      return "user";
    }

    // Check for human/user indicators in attributes
    if (
      block.getAttribute("data-role") === "user" ||
      block.getAttribute("data-sender") === "user" ||
      block.getAttribute("data-message-author-role") === "user"
    ) {
      return "user";
    }

    // Default to assistant (Claude's messages)
    return "assistant";
  }

  private extractTextContent(block: Element): string {
    // Remove buttons and UI chrome
    const clone = block.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('button, [role="button"], .sr-only, .hidden, [aria-hidden="true"]')
      .forEach((el) => el.remove());

    return (clone.textContent || "").trim();
  }

  private extractTimestamp(block: Element): string | undefined {
    const timeEl = block.querySelector("time");
    return timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim() || undefined;
  }

  private findConversationRoot(): Element | null {
    const selectors = [
      '[class*="chat-container"]',
      '[class*="conversation"]',
      'main',
      '[role="main"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /** Sort elements by their position in the DOM tree */
  private sortByDOMOrder(elements: Element[]): Element[] {
    return elements.sort((a, b) => {
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
