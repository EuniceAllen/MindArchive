// ============================================================
// MindArchive — ChatGPT Local Types
// ============================================================
// Lightweight types used internally by the ChatGPT adapter.
// All public types are in @/core/types.
// ============================================================

import type { Message } from "@/core/types";

/** Result of a message extraction pass */
export interface ExtractionResult {
  messages: Message[];
  /** Total number of [data-message-author-role] elements found */
  totalRoleElements: number;
  /** Number of messages successfully extracted */
  extractedCount: number;
}
