// ============================================================
// MindArchive — Platform Registry
// ============================================================
// Central registry for all platform adapters.
// Add new adapters here as the project grows.
// ============================================================

import type { PlatformAdapter } from "./base";
import { ChatGPTAdapter } from "./chatgpt";
import { ClaudeAdapter } from "./claude";
import { DeepSeekAdapter } from "./deepseek";

/** All registered platform adapters, in priority order */
const adapters: PlatformAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
  new DeepSeekAdapter(),
];

/**
 * Auto-detect which platform the current page belongs to.
 * Returns the first adapter whose detect() returns true.
 */
export function detectPlatform(): PlatformAdapter | null {
  for (const adapter of adapters) {
    if (adapter.detect()) {
      return adapter;
    }
  }
  return null;
}
