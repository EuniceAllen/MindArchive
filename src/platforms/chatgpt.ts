// ============================================================
// MindArchive — ChatGPT Platform Adapter
// ============================================================
// Thin adapter that implements PlatformAdapter by delegating
// to the specialized extractor and observer modules.
//
// Extraction strategy (in priority order):
//   1. API  — Intercepted from page's own fetch()
//            /backend-api/conversation/{id} → window cache
//   2. DOM  — [data-message-author-role] selectors
//            Fallback when API is unavailable.
//
// ChatGPT DOM structure (2025–2026):
//   - Messages are wrapped in [data-message-author-role]
//     with values "user" or "assistant"
//   - This is the most stable semantic marker — it persists
//     across ChatGPT UI rewrites
//   - The conversation title is in document.title
//
// ## Module layout
//
//   chatgpt.ts          — this file, the adapter glue
//   chatgpt/extractor.ts — API extraction + DOM extraction & text cleaning
//   chatgpt/observer.ts  — MutationObserver for real-time capture
//   chatgpt/types.ts     — lightweight local types
// ============================================================

import type { PlatformAdapter } from "./base";
import type { Conversation, Message } from "@/core/types";
import { extractMessages, extractTitle, fetchConversationFromApi } from "./chatgpt/extractor";
import { observeMessages } from "./chatgpt/observer";

export class ChatGPTAdapter implements PlatformAdapter {
  readonly id = "chatgpt";
  readonly name = "ChatGPT";

  // ─── PlatformAdapter Implementation ─────────────────────

  detect(): boolean {
    return (
      window.location.hostname === "chatgpt.com" ||
      window.location.hostname === "chat.openai.com"
    );
  }

  extractMessages(): Message[] {
    return extractMessages(true); // debug mode on for console logs
  }

  extractTitle(): string {
    return extractTitle();
  }

  observeNewMessages(
    onNewMessage: (messages: Message[]) => void
  ): () => void {
    return observeMessages(onNewMessage);
  }

  async captureConversation(): Promise<Conversation> {
    // Strategy 1: API (returns full conversation, avoids DOM fragmentation)
    const apiResult = await fetchConversationFromApi();

    if (apiResult) {
      console.log(
        `[MindArchive] ChatGPT captured via API: ${apiResult.messages.length} messages`
      );

      return {
        id: this.generateId(),
        platform: this.id,
        title: apiResult.title,
        url: window.location.href,
        messages: apiResult.messages,
        capturedAt: new Date().toISOString(),
      };
    }

    // Strategy 2: DOM fallback
    console.log("[MindArchive] ChatGPT API unavailable, falling back to DOM");
    const messages = this.extractMessages();
    console.log(`[MindArchive] ChatGPT captured via DOM: ${messages.length} messages`);

    return {
      id: this.generateId(),
      platform: this.id,
      title: this.extractTitle(),
      url: window.location.href,
      messages,
      capturedAt: new Date().toISOString(),
    };
  }

  // ─── Private ────────────────────────────────────────────

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${this.id}_${ts}_${rand}`;
  }
}
