// ============================================================
// MindArchive — Storage & Export Layer
// ============================================================
// Handles saving conversations to local storage and
// exporting them as downloadable .md files.
// ============================================================

import type { Conversation, CaptureResult } from "@/core/types";
import { formatConversation, generateFilename } from "@/formatters/markdown";

/** Storage key for Chrome's local storage */
const STORAGE_KEY = "mindarchive_conversations";

/** Key for auto-save preference */
const AUTOSAVE_KEY = "mindarchive_autosave";

// ─── Chrome Storage ──────────────────────────────────────────

/**
 * Save a conversation to Chrome's local storage.
 */
export async function saveToStorage(conversation: Conversation): Promise<void> {
  const existing = await loadAllFromStorage();
  // Avoid duplicates by ID
  const filtered = existing.filter((c) => c.id !== conversation.id);
  filtered.push(conversation);

  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

/**
 * Load all saved conversations from Chrome's local storage.
 */
export async function loadAllFromStorage(): Promise<Conversation[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

/**
 * Delete a conversation from storage by ID.
 */
export async function deleteFromStorage(id: string): Promise<void> {
  const existing = await loadAllFromStorage();
  const filtered = existing.filter((c) => c.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

// ─── Auto-save Preference ────────────────────────────────────

export async function getAutoSave(): Promise<boolean> {
  const result = await chrome.storage.local.get(AUTOSAVE_KEY);
  return result[AUTOSAVE_KEY] ?? false;
}

export async function setAutoSave(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [AUTOSAVE_KEY]: enabled });
}

// ─── File Export ─────────────────────────────────────────────

/**
 * Trigger a file download of the conversation as Markdown.
 * Uses different strategies depending on the context:
 *   - In content script: use Blob + <a> download
 *   - In popup: use chrome.downloads API
 */
export function downloadConversation(conversation: Conversation): void {
  const markdown = formatConversation(conversation);
  const filename = generateFilename(conversation);

  // Try chrome.downloads API (works in extension contexts)
  if (typeof chrome !== "undefined" && chrome.downloads) {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true,
      });
    };
    reader.readAsDataURL(blob);
    return;
  }

  // Fallback: use Blob URL + anchor click (works in content scripts)
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a full CaptureResult from a conversation.
 * This bundles the conversation data with its Markdown
 * representation for use in the popup preview.
 */
export function createCaptureResult(conversation: Conversation): CaptureResult {
  const markdown = formatConversation(conversation);
  return {
    conversation,
    markdown,
    messageCount: conversation.messages.length,
  };
}
