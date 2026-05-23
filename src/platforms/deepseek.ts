// ============================================================
// MindArchive — DeepSeek Platform Adapter
// ============================================================
import type { PlatformAdapter } from "./base";
import type { Conversation, Message } from "@/core/types";
import { extractMessages, extractTitle } from "./deepseek/extractor";
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
    const messages = this.extractMessages();
    console.log(`[MindArchive] DeepSeek captured: ${messages.length} messages`);

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
