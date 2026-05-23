// ============================================================
// MindArchive — Core Types
// ============================================================

/** The role of a message participant */
export type MessageRole = "user" | "assistant";

/** A single message in a conversation */
export interface Message {
  /** Who sent the message */
  role: MessageRole;
  /** The text content of the message */
  content: string;
  /** ISO 8601 timestamp, if available from the platform */
  timestamp?: string;
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
}

/** Status of the capture process */
export type CaptureStatus = "idle" | "scanning" | "capturing" | "done" | "error";

/** Payload sent from content script to popup/background */
export interface CaptureResult {
  conversation: Conversation;
  markdown: string;
  messageCount: number;
}
