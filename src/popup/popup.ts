// ============================================================
// MindArchive — Popup UI Logic
// ============================================================
// The popup is the user's control panel.
// It communicates with the content script via the
// background service worker.
// ============================================================

import type { CaptureResult } from "@/core/types";
import type { HistoryLoadProgress } from "@/platforms/chatgpt/historyLoader";
import { getAutoSave, setAutoSave } from "@/storage/export";

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
const autoSaveToggle = document.getElementById("autoSaveToggle")! as HTMLInputElement;
const emptyState = document.getElementById("emptyState")!;

// ─── State ────────────────────────────────────────────────────

let lastCaptureResult: CaptureResult | null = null;

// ─── Initialization ───────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Load auto-save preference
  autoSaveToggle.checked = await getAutoSave();

  // Detect platform on the active tab
  await detectPlatform();
});

// ─── Platform Detection ───────────────────────────────────────

async function detectPlatform() {
  updateStatus("正在检测平台…", "inactive");

  try {
    const response = await sendToActiveTab({ type: "DETECT_PLATFORM" });

    if (response?.detected && response.platform) {
      platformBadge.textContent = response.platform.name;
      platformBadge.className = "badge badge--active";
      updateStatus(`已连接到 ${response.platform.name} — 可以捕获对话`);
      actionsSection.style.display = "flex";
      emptyState.style.display = "none";
    } else {
      platformBadge.textContent = "未检测到";
      platformBadge.className = "badge badge--inactive";
      updateStatus("未检测到支持的 AI 平台");
      actionsSection.style.display = "none";
      emptyState.style.display = "block";
    }
  } catch (err) {
    platformBadge.textContent = "错误";
    platformBadge.className = "badge badge--inactive";
    updateStatus("无法连接到页面，请刷新后重试");
    actionsSection.style.display = "none";
    emptyState.style.display = "block";
  }
}

// ─── Capture ──────────────────────────────────────────────────

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  captureBtn.textContent = "⏳ 捕获中…";
  updateStatus("正在从页面提取对话…");

  try {
    const response = await sendToActiveTab({ type: "CAPTURE_CONVERSATION" });

    if (response?.error) {
      updateStatus(`错误: ${response.error}`, "error");
      captureBtn.disabled = false;
      captureBtn.textContent = "📥 捕获对话";
      return;
    }

    lastCaptureResult = response as CaptureResult;
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

// ─── Listen for real-time updates from content script ─────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "NEW_MESSAGES" && message.payload) {
    updateStatus(
      `检测到 ${message.payload.count} 条新消息 (共 ${message.payload.total} 条)`,
      "info"
    );
  }

  if (message.type === "HISTORY_LOAD_PROGRESS" && message.payload) {
    handleLoadProgress(message.payload as HistoryLoadProgress);
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

async function sendToActiveTab(message: any): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
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
