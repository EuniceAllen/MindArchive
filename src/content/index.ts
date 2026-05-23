// ============================================================
// MindArchive — Content Script
// ============================================================
// Injected into supported AI chat pages.
// Responsibilities:
//   1. Detect which platform we're on
//   2. Activate the correct adapter
//   3. Listen for messages from the popup
//   4. Observe and capture new messages
// ============================================================

import { detectPlatform } from "@/platforms/registry";
import { downloadConversation, createCaptureResult, saveToStorage, getAutoSave } from "@/storage/export";
import type { PlatformAdapter } from "@/platforms/base";
import type { CaptureResult } from "@/core/types";
import type { HistoryLoadProgress } from "@/platforms/chatgpt/historyLoader";

// ─── State ───────────────────────────────────────────────────

let activeAdapter: PlatformAdapter | null = null;
let disconnectObserver: (() => void) | null = null;
let capturedMessages = 0;

// ─── Message Handlers ────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message: any): Promise<any> {
  switch (message.type) {
    case "DETECT_PLATFORM":
      return detectAndInit();

    case "CAPTURE_CONVERSATION":
      return captureCurrent();

    case "EXPORT_CONVERSATION":
      return exportCurrent();

    case "START_OBSERVING":
      return startObserving();

    case "STOP_OBSERVING":
      return stopObserving();

    case "GET_STATUS":
      return getStatus();

    case "LOAD_FULL_HISTORY":
      return loadFullHistory();

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ─── Initialization ──────────────────────────────────────────

function detectAndInit() {
  const adapter = detectPlatform();
  if (adapter) {
    activeAdapter = adapter;
    return {
      platform: { id: adapter.id, name: adapter.name },
      detected: true,
    };
  }
  return { detected: false };
}

// ─── Capture ─────────────────────────────────────────────────

async function captureCurrent(): Promise<CaptureResult | { error: string }> {
  if (!activeAdapter) {
    return { error: "No platform detected. Are you on a supported AI chat page?" };
  }

  const conversation = await activeAdapter.captureConversation();
  capturedMessages = conversation.messages.length;

  // Check auto-save setting
  getAutoSave().then((autoSave) => {
    if (autoSave) {
      saveToStorage(conversation);
    }
  });

  return createCaptureResult(conversation);
}

async function exportCurrent(): Promise<{ success: boolean; filename?: string; error?: string }> {
  if (!activeAdapter) {
    return { success: false, error: "No platform detected." };
  }

  const conversation = await activeAdapter.captureConversation();
  downloadConversation(conversation);

  return { success: true };
}

// ─── Live Observation ────────────────────────────────────────

function startObserving(): { observing: boolean; error?: string } {
  if (!activeAdapter) {
    return { observing: false, error: "No platform detected." };
  }

  // Clean up any existing observer
  if (disconnectObserver) {
    disconnectObserver();
  }

  disconnectObserver = activeAdapter.observeNewMessages((newMessages) => {
    capturedMessages += newMessages.length;

    // Notify the popup about new messages
    chrome.runtime.sendMessage({
      type: "NEW_MESSAGES",
      payload: {
        count: newMessages.length,
        total: capturedMessages,
        latest: newMessages[newMessages.length - 1],
      },
    }).catch(() => {
      // Popup might not be open — that's fine
    });
  });

  return { observing: true };
}

function stopObserving(): { observing: boolean } {
  if (disconnectObserver) {
    disconnectObserver();
    disconnectObserver = null;
  }
  return { observing: false };
}

function getStatus() {
  return {
    platform: activeAdapter ? { id: activeAdapter.id, name: activeAdapter.name } : null,
    observing: disconnectObserver !== null,
    capturedMessages,
  };
}

// ─── Full History Loading ────────────────────────────────────

async function loadFullHistory(): Promise<{ success: boolean; messageCount?: number; error?: string }> {
  if (!activeAdapter) {
    return { success: false, error: "No platform detected." };
  }

  // Only ChatGPT supports history loading (lazy-loaded DOM)
  if (activeAdapter.id !== "chatgpt") {
    return { success: false, error: "History loading is only supported on ChatGPT." };
  }

  try {
    // Dynamic import to keep the history loader chatgpt-specific
    const { loadEntireConversationHistory } = await import(
      "@/platforms/chatgpt/historyLoader"
    );

    const finalCount = await loadEntireConversationHistory((progress) => {
      // Relay progress to the popup
      chrome.runtime.sendMessage({
        type: "HISTORY_LOAD_PROGRESS",
        payload: progress,
      }).catch(() => {});
    });

    // Notify popup that loading is done
    chrome.runtime.sendMessage({
      type: "HISTORY_LOAD_COMPLETE",
      messageCount: finalCount,
    }).catch(() => {});

    return { success: true, messageCount: finalCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[MindArchive] History loading failed:", msg);
    return { success: false, error: msg };
  }
}

// ─── Auto-init ───────────────────────────────────────────────

// Detect platform as soon as the content script loads
detectAndInit();
console.log(`[MindArchive] Content script loaded on ${window.location.hostname}`);
