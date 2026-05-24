// ============================================================
// MindArchive — Claude Platform Adapter
// ============================================================
// Thin adapter — delegates to claude/extractor and claude/observer.
//
// Extraction strategy (in priority order):
//   1. API  — GET /api/organizations/{org}/chat_conversations/{id}
//            Returns raw markdown, avoids DOM fragmentation.
//   2. DOM  — Depth-first traversal of div.font-claude-response
//            Fallback when API is unavailable.
//
// ## Module layout
//
//   claude.ts            — this file, the adapter glue
//   claude/extractor.ts  — API extraction + DOM fallback
//   claude/observer.ts   — MutationObserver for real-time capture
// ============================================================

import type { PlatformAdapter } from "./base";
import type { Conversation, Message } from "@/core/types";
import { extractMessages, extractTitle, fetchConversationFromApi } from "./claude/extractor";
import { observeMessages } from "./claude/observer";

export class ClaudeAdapter implements PlatformAdapter {
  readonly id = "claude";
  readonly name = "Claude";

  detect(): boolean {
    return window.location.hostname === "claude.ai";
  }

  extractMessages(): Message[] {
    return extractMessages(true);
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
    // Strategy 1: API (returns raw markdown, no DOM fragmentation)
    const apiResult = await fetchConversationFromApi();

    if (apiResult) {
      console.log(
        `[MindArchive] Claude captured via API: ${apiResult.messages.length} messages`
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
    console.log("[MindArchive] Claude API unavailable, falling back to DOM");
    const messages = this.extractMessages();
    console.log(`[MindArchive] Claude captured via DOM: ${messages.length} messages`);

    return {
      id: this.generateId(),
      platform: this.id,
      title: this.extractTitle(),
      url: window.location.href,
      messages,
      capturedAt: new Date().toISOString(),
    };
  }

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${this.id}_${ts}_${rand}`;
  }
}

