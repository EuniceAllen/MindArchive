// ============================================================
// MindArchive — Popup UI Logic
// ============================================================
// The popup is the user's control panel.
// It communicates with the content script via the
// background service worker.
// ============================================================

import type { CaptureResult, ContentMessage, EventMessage } from "@/core/types";
import type { HistoryLoadProgress } from "@/platforms/chatgpt/historyLoader";
import { getAutoSave, setAutoSave, getAutoLoad, setAutoLoad } from "@/storage/export";

// ─── DOM References ───────────────────────────────────────────

const platformBadge = document.getElementById("platformBadge")!;
const statusText = document.getElementById("statusText")!;
const statusBar = document.getElementById("statusBar")!;
const actionsSection = document.getElementById("actions")!;
const loadHistoryBtn = document.getElementById("loadHistoryBtn")! as HTMLButtonElement;
const captureBtn = document.getElementById("captureBtn")! as HTMLButtonElement;
const exportBtn = document.getElementById("exportBtn")! as HTMLButtonElement;
const loadProgress = document.getElementById("loadProgress")!;
const progressFill = document.getElementById("progressFill")!;
const progressText = document.getElementById("progressText")!;
const previewSection = document.getElementById("preview")!;
const previewTitle = document.getElementById("previewTitle")!;
const previewCount = document.getElementById("previewCount")!;
const previewContent = document.getElementById("previewContent")!;
const autoLoadToggle = document.getElementById("autoLoadToggle")! as HTMLInputElement;
const autoSaveToggle = document.getElementById("autoSaveToggle")! as HTMLInputElement;
const settingsSection = document.getElementById("settingsSection")!;
const emptyState = document.getElementById("emptyState")!;

// ─── State ────────────────────────────────────────────────────

let lastCaptureResult: CaptureResult | null = null;

// ─── Initialization ───────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Load auto-save & auto-load preferences
  autoSaveToggle.checked = await getAutoSave();
  autoLoadToggle.checked = await getAutoLoad();

  // Detect platform on the active tab
  await detectPlatform();
});

// ─── Platform Detection ───────────────────────────────────────

async function detectPlatform() {
  updateStatus("正在检测平台…", "inactive");

  try {
    const response = await sendToActiveTab({ type: "DETECT_PLATFORM" });
    const result = response as { detected?: boolean; platform?: { id: string; name: string } };

    if (result.detected && result.platform) {
      platformBadge.textContent = result.platform.name;
      platformBadge.className = "badge badge--active";
      updateStatus(`已连接到 ${result.platform.name} — 可以捕获对话`);
      actionsSection.style.display = "flex";
      settingsSection.style.display = "flex";
      emptyState.style.display = "none";
    } else {
      platformBadge.textContent = "未检测到";
      platformBadge.className = "badge badge--inactive";
      updateStatus("未检测到支持的 AI 平台");
      actionsSection.style.display = "none";
      settingsSection.style.display = "none";
      emptyState.style.display = "block";
    }
  } catch (err) {
    platformBadge.textContent = "错误";
    platformBadge.className = "badge badge--inactive";
    updateStatus("无法连接到页面，请刷新后重试");
    actionsSection.style.display = "none";
    settingsSection.style.display = "none";
    emptyState.style.display = "block";
  }
}

// ─── Capture ──────────────────────────────────────────────────

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  captureBtn.textContent = "⏳ 捕获中…";

  // If auto-load is enabled, trigger full history loading first
  if (autoLoadToggle.checked) {
    updateStatus("设置要求先加载完整历史…");

    loadHistoryBtn.disabled = true;
    loadHistoryBtn.textContent = "⏳ 加载中…";
    loadHistoryBtn.classList.add("is-loading");
    loadProgress.style.display = "flex";
    progressFill.className = "progress-fill is-indeterminate";
    progressText.textContent = "正在加载历史消息…";
    progressText.className = "progress-text";
    setLoadingState(true);

    try {
      await sendToActiveTab({ type: "LOAD_FULL_HISTORY" });
      // Wait for HISTORY_LOAD_COMPLETE from content script
      await waitForHistoryLoadComplete();
    } catch {
      updateStatus("历史加载失败，继续尝试捕获当前可见消息…", "info");
    }

    // Reset load button state
    loadHistoryBtn.disabled = false;
    loadHistoryBtn.textContent = "⬆ 加载完整对话";
    loadHistoryBtn.classList.remove("is-loading");
    setLoadingState(false);
  }

  updateStatus("正在从页面提取对话…");

  try {
    const response = await sendToActiveTab({ type: "CAPTURE_CONVERSATION" });
    const cap = response as unknown as CaptureResult & { error?: string };

    if (cap.error) {
      updateStatus(`错误: ${cap.error}`, "error");
      captureBtn.disabled = false;
      captureBtn.textContent = "📥 捕获对话";
      return;
    }

    lastCaptureResult = cap as CaptureResult;
    showPreview(lastCaptureResult);

    updateStatus(
      `已捕获 ${lastCaptureResult.messageCount} 条消息`,
      "success"
    );

    exportBtn.disabled = false;
  } catch (err) {
    updateStatus("捕获失败，请刷新页面后重试", "error");
  }

  captureBtn.disabled = false;
  captureBtn.textContent = "📥 捕获对话";
});

// ─── Load Full History ───────────────────────────────────────

loadHistoryBtn.addEventListener("click", async () => {
  setLoadingState(true);
  updateStatus("正在加载历史消息…");

  loadHistoryBtn.disabled = true;
  loadHistoryBtn.textContent = "⏳ 加载中…";
  loadHistoryBtn.classList.add("is-loading");

  loadProgress.style.display = "flex";
  progressFill.className = "progress-fill is-indeterminate";
  progressText.textContent = "正在加载历史消息…";
  progressText.className = "progress-text";

  try {
    await sendToActiveTab({ type: "LOAD_FULL_HISTORY" });
    // Completion is handled by HISTORY_LOAD_COMPLETE message listener
  } catch (err) {
    setLoadingState(false);
    updateStatus("加载失败，请重试", "error");
  }
});

// ─── Export ───────────────────────────────────────────────────

exportBtn.addEventListener("click", async () => {
  if (!lastCaptureResult) return;

  exportBtn.disabled = true;
  exportBtn.textContent = "⏳ 导出中…";

  try {
    await sendToActiveTab({ type: "EXPORT_CONVERSATION" });
    updateStatus("已导出 Markdown 文件", "success");
  } catch (err) {
    updateStatus("导出失败，请重试", "error");
  }

  exportBtn.disabled = false;
  exportBtn.textContent = "💾 导出 Markdown";
});

// ─── Auto-save Toggle ─────────────────────────────────────────

autoSaveToggle.addEventListener("change", async () => {
  await setAutoSave(autoSaveToggle.checked);
  updateStatus(
    autoSaveToggle.checked ? "自动保存已开启" : "自动保存已关闭",
    "info"
  );
});

// ─── Auto-load Toggle ─────────────────────────────────────────

autoLoadToggle.addEventListener("change", async () => {
  await setAutoLoad(autoLoadToggle.checked);
  updateStatus(
    autoLoadToggle.checked
      ? "自动加载已开启 — 捕获前将自动加载完整历史"
      : "自动加载已关闭 — 仅捕获当前可见消息",
    "info"
  );
});

// ─── Listen for real-time updates from content script ─────────

chrome.runtime.onMessage.addListener((message: EventMessage, _sender: chrome.runtime.MessageSender) => {
  if (message.type === "NEW_MESSAGES" && message.payload) {
    updateStatus(
      `检测到 ${message.payload.count} 条新消息 (共 ${message.payload.total} 条)`,
      "info"
    );
  }

  if (message.type === "HISTORY_LOAD_PROGRESS" && message.payload) {
    handleLoadProgress(message.payload);
  }

  if (message.type === "HISTORY_LOAD_COMPLETE") {
    handleLoadComplete(message.messageCount ?? 0);
  }
});

// ─── Progress Handlers ────────────────────────────────────────

function setLoadingState(loading: boolean) {
  captureBtn.disabled = loading;
  exportBtn.disabled = loading;
}

function handleLoadProgress(progress: HistoryLoadProgress) {
  loadProgress.style.display = "flex";

  switch (progress.phase) {
    case "starting":
      progressFill.className = "progress-fill is-indeterminate";
      progressText.textContent = "正在加载历史消息…";
      progressText.className = "progress-text";
      break;

    case "loading":
      progressFill.className = "progress-fill is-indeterminate";
      progressText.textContent = `已加载 ${progress.currentCount} 条消息`;
      progressText.className = "progress-text";
      updateStatus(
        `滚动加载中… 当前 ${progress.currentCount} 条`,
        "info"
      );
      break;

    case "already_complete":
    case "complete":
      progressFill.className = "progress-fill";
      progressFill.style.width = "100%";
      progressText.textContent = progress.reachedTop
        ? "已到达对话顶部 — 完整对话加载完成 ✅"
        : "完整对话加载完成 ✅";
      progressText.className = "progress-text is-complete";
      loadHistoryBtn.disabled = false;
      loadHistoryBtn.textContent = "⬆ 加载完整对话";
      loadHistoryBtn.classList.remove("is-loading");
      setLoadingState(false);
      break;
  }
}

function handleLoadComplete(messageCount: number) {
  // Hide progress after a short delay so user sees completion
  setTimeout(() => {
    loadProgress.style.display = "none";
  }, 2000);

  updateStatus(
    `完整对话已加载 — 共 ${messageCount} 条消息，点击"捕获对话"开始提取`,
    "success"
  );
  setLoadingState(false);
  captureBtn.disabled = false;
  exportBtn.disabled = false;
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Returns a promise that resolves when HISTORY_LOAD_COMPLETE
 * is received from the content script (or rejects on timeout).
 */
function waitForHistoryLoadComplete(timeoutMs = 120_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);

    const handler = (msg: EventMessage, _sender: chrome.runtime.MessageSender) => {
    if (msg.type === "HISTORY_LOAD_COMPLETE") {
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(handler);
        resolve(msg.messageCount ?? 0);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
  });
}

async function sendToActiveTab(message: ContentMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: Record<string, unknown>) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

function updateStatus(
  text: string,
  type: "info" | "success" | "error" | "inactive" = "info"
) {
  statusText.textContent = text;

  // Reset classes
  statusBar.style.background = "";
  statusBar.style.color = "";

  switch (type) {
    case "success":
      statusBar.style.background = "#ecfdf5";
      statusBar.style.color = "#065f46";
      break;
    case "error":
      statusBar.style.background = "#fef2f2";
      statusBar.style.color = "#991b1b";
      break;
  }
}

function showPreview(result: CaptureResult) {
  previewSection.style.display = "block";
  previewTitle.textContent = result.conversation.title;
  previewCount.textContent = `${result.messageCount} 条消息`;
  previewCount.className = "badge badge--info";

  // Show first 500 chars of markdown as preview
  const preview = result.markdown.length > 500
    ? result.markdown.slice(0, 500) + "\n\n… (内容已截断)"
    : result.markdown;
  previewContent.textContent = preview;
}
