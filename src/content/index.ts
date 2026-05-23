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

  // Check auto-save setting (awaited properly)
  const autoSave = await getAutoSave();
  if (autoSave) {
    await saveToStorage(conversation);
  }

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

  // ChatGPT has a specialized loader (virtualized list, lazy batches)
  if (activeAdapter.id === "chatgpt") {
    try {
      const { loadEntireConversationHistory } = await import(
        "@/platforms/chatgpt/historyLoader"
      );
      const finalCount = await loadEntireConversationHistory((progress) => {
        chrome.runtime.sendMessage({
          type: "HISTORY_LOAD_PROGRESS", payload: progress,
        }).catch(() => {});
      });

      chrome.runtime.sendMessage({
        type: "HISTORY_LOAD_COMPLETE", messageCount: finalCount,
      }).catch(() => {});

      return { success: true, messageCount: finalCount };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // Other platforms: find scrollable container, scroll up progressively
  try {
    chrome.runtime.sendMessage({
      type: "HISTORY_LOAD_PROGRESS",
      payload: { phase: "starting", currentCount: 0, scrollIteration: 0, reachedTop: false },
    }).catch(() => {});

    const finalCount = await scrollToTop(activeAdapter);
    return { success: true, messageCount: finalCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/** Find the real scrollable container and progressively scroll to top */
async function scrollToTop(
  adapter: import("@/platforms/base").PlatformAdapter
): Promise<number> {
  // Find the scrollable container: look for overflow-y elements,
  // pick the one with most text content (likely the conversation area)
  const candidates = Array.from(
    document.querySelectorAll("*")
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 100 &&
      (el.textContent?.length || 0) > 200
    );
  }) as HTMLElement[];

  // Pick the one with the most text (conversation area)
  const container = candidates.length > 0
    ? candidates.reduce((a, b) =>
        (a.textContent?.length || 0) > (b.textContent?.length || 0) ? a : b
      )
    : null;

  console.log("[MindArchive] Scroll container:", container?.tagName, container?.className?.slice(0, 60));

  let prevCount = adapter.extractMessages().length;
  let stuck = 0;

  for (let i = 1; i <= 40; i++) {
    if (container) {
      const prev = container.scrollTop;
      container.scrollTop = Math.max(0, prev - 600);
      container.dispatchEvent(new Event("scroll", { bubbles: true }));
      // Some platforms also need window scroll
      window.scrollBy({ top: -600, behavior: "instant" });
    } else {
      window.scrollBy({ top: -600, behavior: "instant" });
    }

    await sleep(400);

    const currentCount = adapter.extractMessages().length;

    chrome.runtime.sendMessage({
      type: "HISTORY_LOAD_PROGRESS",
      payload: {
        phase: "loading" as const,
        currentCount,
        scrollIteration: i,
        reachedTop: container ? container.scrollTop <= 0 : window.scrollY <= 0,
      },
    }).catch(() => {});

    if (currentCount === prevCount) {
      stuck++;
      if (stuck >= 4) break;
    } else {
      stuck = 0;
    }

    prevCount = currentCount;
  }

  const finalCount = adapter.extractMessages().length;

  chrome.runtime.sendMessage({
    type: "HISTORY_LOAD_PROGRESS",
    payload: {
      phase: "complete" as const,
      currentCount: finalCount,
      scrollIteration: 1,
      reachedTop: true,
      finalCount,
    },
  }).catch(() => {});

  return finalCount;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Auto-init ───────────────────────────────────────────────

// Detect platform as soon as the content script loads
detectAndInit();
console.log(`[MindArchive] Content script loaded on ${window.location.hostname}`);
