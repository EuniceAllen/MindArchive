// ============================================================
// MindArchive — Core Types
// ============================================================

/** The role of a message participant */
export type MessageRole = "user" | "assistant";

// ─── Content Block Types ────────────────────────────────────
// Structured representation of message content, preserving
// rich formatting (code blocks, lists, inline code, etc.)

/** Discriminated union tag for content blocks */
export type ContentBlockType = "text" | "heading" | "code_block" | "list" | "blockquote";

/** Plain paragraph text (inline code merged into content) */
export interface TextBlock {
  type: "text";
  content: string;
}

/** Heading with level (1-4) */
export interface HeadingBlock {
  type: "heading";
  level: number;
  content: string;
}

/** Fenced code block with optional language tag */
export interface CodeBlockBlock {
  type: "code_block";
  language: string;
  content: string;
}

/** Ordered or unordered list */
export interface ListBlock {
  type: "list";
  ordered: boolean;
  items: string[];
}

/** Blockquote */
export interface BlockquoteBlock {
  type: "blockquote";
  content: string;
}

/** Any content block in a message */
export type ContentBlock = TextBlock | HeadingBlock | CodeBlockBlock | ListBlock | BlockquoteBlock;

// ─── Message ────────────────────────────────────────────────

/** A single message in a conversation */
export interface Message {
  /** Who sent the message */
  role: MessageRole;
  /** The text content of the message (flattened representation) */
  content: string;
  /** Structured content blocks for rich extraction (DOM-based) */
  blocks?: ContentBlock[];
  /** ISO 8601 timestamp, if available from the platform */
  timestamp?: string;
  /** Unique message UUID (from API, e.g. Claude) */
  uuid?: string;
  /** Whether the text content was truncated by the API */
  truncated?: boolean;
  /** File attachments (from API) */
  attachments?: unknown[];
}

// ─── Claude API Types ───────────────────────────────────────

/** Raw message from claude.ai internal API */
export interface ClaudeApiMessage {
  uuid: string;
  index: number;
  sender: "human" | "assistant";
  text: string;
  created_at: string;
  truncated: boolean;
  attachments: unknown[];
  parent_message_uuid?: string;
}

/** Raw response from GET /api/organizations/{org}/chat_conversations/{id} */
export interface ClaudeApiResponse {
  uuid: string;
  name?: string;
  model?: string;
  created_at: string;
  updated_at?: string;
  chat_messages: ClaudeApiMessage[];
}

// ─── DeepSeek API Types ─────────────────────────────────────

/** Raw message from chat.deepseek.com internal API */
export interface DeepSeekApiMessage {
  message_id: number;
  parent_message_id?: number;
  role: "USER" | "ASSISTANT";
  content?: string;
  fragments?: DeepSeekApiFragment[];
  created_at?: number;
  model_name?: string;
  files?: unknown[];
  thinking?: unknown;
  search_results?: unknown[];
}

/** Fragment inside a DeepSeek message */
export interface DeepSeekApiFragment {
  type: "REQUEST" | "RESPONSE" | "THINK" | "SEARCH";
  content?: string;
}

/** Raw response from GET /api/v0/chat/history_messages */
export interface DeepSeekApiResponse {
  code: number;
  msg: string;
  data: {
    biz_data: {
      chat_session: {
        id: string;
        title?: string;
        model?: string;
        current_message_id?: number;
      };
      chat_messages: DeepSeekApiMessage[];
      cache_control?: string;
      // Pagination fields (exact names vary by API version)
      seq_id?: number;
      next_seq_id?: number;
      min_seq_id?: number;
      max_seq_id?: number;
      cursor?: string;
      offset?: number;
      has_more?: boolean;
    };
  } | null;
}

/** A complete captured conversation */
export interface Conversation {
  /** Unique ID for this capture (generated locally) */
  id: string;
  /** Which AI platform this conversation is from */
  platform: string;
  /** Auto-detected or user-provided title */
  title: string;
  /** The URL where this conversation was captured */
  url: string;
  /** All messages in chronological order */
  messages: Message[];
  /** ISO 8601 timestamp of when the capture was made */
  capturedAt: string;
  /** Non-empty when capture requires user action (e.g. refresh) */
  error?: string;
}

/** Status of the capture process */
export type CaptureStatus = "idle" | "scanning" | "capturing" | "done" | "error";

/** Payload sent from content script to popup/background */
export interface CaptureResult {
  conversation: Conversation;
  markdown: string;
  messageCount: number;
}

// ─── Inter-component Message Types ─────────────────────────

/** Messages from popup/background → content script */
export type ContentMessage =
  | { type: "DETECT_PLATFORM" }
  | { type: "CAPTURE_CONVERSATION" }
  | { type: "EXPORT_CONVERSATION" }
  | { type: "START_OBSERVING" }
  | { type: "STOP_OBSERVING" }
  | { type: "GET_STATUS" }
  | { type: "LOAD_FULL_HISTORY" };

/** Response from content script — opaque payload, narrowed at call site */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContentResponse = Record<string, unknown>;

/** Event messages (content script → popup via runtime.sendMessage) */
export type EventMessage =
  | { type: "NEW_MESSAGES"; payload: { count: number; total: number; latest: Message } }
  | { type: "HISTORY_LOAD_PROGRESS"; payload: import("@/platforms/chatgpt/historyLoader").HistoryLoadProgress }
  | { type: "HISTORY_LOAD_COMPLETE"; messageCount: number };

/** All possible messages received by popup/background */
export type IncomingMessage = ContentMessage | EventMessage;
