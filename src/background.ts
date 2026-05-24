// ============================================================
// MindArchive — Background Service Worker
// ============================================================
// Manages extension-level state and coordinates between
// content scripts and the popup.
//
// In Manifest V3, the service worker is ephemeral — we keep
// state minimal and rely on chrome.storage for persistence.
// ============================================================

import type { ContentMessage, EventMessage } from "@/core/types";

// ─── Installation ────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
  if (details.reason === "install") {
    console.log("[MindArchive] Extension installed — welcome to your second brain.");
    // Initialize default settings
    chrome.storage.local.set({
      mindarchive_autosave: false,
      mindarchive_version: chrome.runtime.getManifest().version,
    });
  }

  if (details.reason === "update") {
    console.log(`[MindArchive] Updated to version ${chrome.runtime.getManifest().version}`);
  }
});

// ─── Message Relay ───────────────────────────────────────────
// The popup can't directly access content script functions
// in MV3, so we relay messages through the background worker.

chrome.runtime.onMessage.addListener((message: ContentMessage | EventMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  // Messages from content script — forward to popup if needed
  if (message.type === "NEW_MESSAGES") {
    if (message.payload) {
      chrome.storage.local.set({
        mindarchive_latest_activity: {
          ...message.payload,
          timestamp: Date.now(),
        },
      });
    }
  }

  // Progress updates from content script — forward to popup
  if (
    message.type === "HISTORY_LOAD_PROGRESS" ||
    message.type === "HISTORY_LOAD_COMPLETE"
  ) {
    // These go directly to the popup via chrome.runtime.onMessage,
    // which is shared between background and popup. The popup
    // listens for these types on its own chrome.runtime.onMessage.
    // We just need to ensure they get through — no relay needed
    // since the content script sends to runtime, and both bg and
    // popup receivers get it.
    sendResponse({ received: true });
    return true;
  }

  // Messages that need to reach the active tab's content script
  if (
    message.type === "CAPTURE_CONVERSATION" ||
    message.type === "EXPORT_CONVERSATION" ||
    message.type === "DETECT_PLATFORM" ||
    message.type === "START_OBSERVING" ||
    message.type === "STOP_OBSERVING" ||
    message.type === "GET_STATUS" ||
    message.type === "LOAD_FULL_HISTORY"
  ) {
    relayToActiveTab(message).then(sendResponse);
    return true; // Keep channel open
  }

  sendResponse({ received: true });
  return true;
});

// ─── Tab Query Helper ────────────────────────────────────────

async function relayToActiveTab(message: ContentMessage | EventMessage): Promise<Record<string, unknown>> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      return { error: "No active tab found." };
    }

    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    return {
      error: `Failed to reach page: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Context Menu (future: right-click to capture) ───────────
// Disabled for MVP — uncomment when ready.

// chrome.contextMenus.create({
//   id: "capture-conversation",
//   title: "Archive this conversation with MindArchive",
//   contexts: ["page"],
//   documentUrlPatterns: ["https://chatgpt.com/*", "https://claude.ai/*"],
// });

console.log("[MindArchive] Background service worker started.");
