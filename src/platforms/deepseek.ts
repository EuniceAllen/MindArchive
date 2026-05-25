// ============================================================
// MindArchive — DeepSeek Platform Adapter
// ============================================================
// Thin adapter — delegates to deepseek/extractor and deepseek/observer.
//
// Extraction strategy (in priority order):
//   1. API  — GET /api/v0/chat/history_messages?chat_session_id={id}
//            Returns raw markdown per message fragment.
//   2. DOM  — Query .ds-message elements with role detection
//            Fallback when API is unavailable.
// ============================================================

import type { PlatformAdapter } from "./base";
import type { Conversation, Message } from "@/core/types";
import { extractMessages, extractTitle, fetchConversationFromApi } from "./deepseek/extractor";
import { observeMessages } from "./deepseek/observer";

export class DeepSeekAdapter implements PlatformAdapter {
  readonly id = "deepseek";
  readonly name = "DeepSeek";

  detect(): boolean {
    return window.location.hostname === "chat.deepseek.com";
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

    if (apiResult && !apiResult.needsRefresh) {
      console.log(
        `[MindArchive] DeepSeek captured via API: ${apiResult.messages.length} messages`
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

    // Cache empty — tell user to refresh instead of DOM fallback
    if (apiResult?.needsRefresh) {
      console.warn("[MindArchive] DeepSeek: cache empty, asking user to refresh");
      return {
        id: "",
        platform: this.id,
        title: "",
        url: window.location.href,
        messages: [],
        capturedAt: new Date().toISOString(),
        error: "NEEDS_REFRESH",
      };
    }

    // Strategy 2: DOM fallback (only when API completely unavailable)
    console.log("[MindArchive] DeepSeek API unavailable, falling back to DOM");
    const messages = this.extractMessages();
    console.log(`[MindArchive] DeepSeek captured via DOM: ${messages.length} messages`);

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
