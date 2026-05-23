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

/** Debug info emitted to console during extraction */
export interface ExtractionDebug {
  selector: string;
  matchesFound: number;
  containersFound: number;
  messagesExtracted: number;
  /** First few chars of each message for verification */
  previews: string[];
}
