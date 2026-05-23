// ============================================================
// MindArchive — Platform Adapter Interface
// ============================================================
// Each AI platform (ChatGPT, Claude, etc.) implements this
// interface so the rest of the system doesn't care about
// platform-specific DOM differences.
// ============================================================

import type { Message, Conversation } from "@/core/types";

/**
 * Every platform adapter must implement this interface.
 *
 * To add a new platform:
 * 1. Create a file in src/platforms/
 * 2. Implement PlatformAdapter
 * 3. Register it in registry.ts
 */
export interface PlatformAdapter {
  /** Unique identifier, e.g. "chatgpt", "claude" */
  readonly id: string;
  /** Human-readable name, e.g. "ChatGPT", "Claude" */
  readonly name: string;

  /**
   * Test whether the current page belongs to this platform.
   * Called by the content script to decide which adapter to activate.
   */
  detect(): boolean;

  /**
   * Extract all currently visible messages from the DOM.
   * Returns messages in chronological order (oldest first).
   */
  extractMessages(): Message[];

  /**
   * Try to extract a conversation title from the page.
   * Returns a fallback string if no title is found.
   */
  extractTitle(): string;

  /**
   * Set up a MutationObserver callback to watch for new messages.
   * Returns a cleanup function (call to disconnect the observer).
   *
   * @param onNewMessage - Called whenever new messages appear in the DOM
   */
  observeNewMessages(onNewMessage: (messages: Message[]) => void): () => void;

  /**
   * Build a fully populated Conversation object from the current page.
   * May trigger lazy-loading of older messages before extraction.
   */
  captureConversation(): Promise<Conversation>;
}
