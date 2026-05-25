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

// ─── ChatGPT API Types (actual response from /backend-api/conversation/{id}) ──

/** Raw response from GET /backend-api/conversation/{id} */
export interface ChatGPTApiResponse {
  title?: string;
  create_time?: number;
  update_time?: number;
  conversation_id?: string;
  current_node?: string;
  mapping?: Record<string, ChatGPTApiMessageNode>;
  default_model_slug?: string;
  is_archived?: boolean;
}

/** A single node in the conversation mapping tree */
export interface ChatGPTApiMessageNode {
  id: string;
  message: ChatGPTApiMessage | null;
  parent: string | null;
  children: string[];
}

/** The actual message inside a mapping node */
export interface ChatGPTApiMessage {
  id: string;
  author: {
    role: "system" | "user" | "assistant" | "tool";
    name?: string | null;
    metadata?: Record<string, unknown>;
  };
  create_time?: number | null;
  update_time?: number | null;
  content: ChatGPTApiContent;
  status?: string;
  end_turn?: boolean | null;
  weight?: number;
  metadata?: ChatGPTApiMessageMetadata;
  recipient?: string;
  channel?: unknown;
}

export interface ChatGPTApiContent {
  content_type?: string;
  /** For content_type="text": the actual message text */
  parts?: string[];
  /** For content_type="model_editable_context" (internal, skip) */
  model_set_context?: string;
  repository?: unknown;
  repo_summary?: unknown;
  structured_context?: unknown;
}

export interface ChatGPTApiMessageMetadata {
  is_visually_hidden_from_conversation?: boolean;
  message_type?: string;
  model_slug?: string;
  resolved_model_slug?: string;
  default_model_slug?: string;
  parent_id?: string;
  request_id?: string;
  turn_exchange_id?: string;
  message_source?: string | null;
  content_references?: unknown[];
  search_result_groups?: unknown[];
  search_queries?: unknown[];
  image_results?: unknown[];
  can_save?: boolean;
  [key: string]: unknown;
}
