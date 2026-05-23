// ============================================================
// MindArchive — Platform Registry
// ============================================================
// Central registry for all platform adapters.
// Add new adapters here as the project grows.
// ============================================================

import type { PlatformAdapter } from "./base";
import { ChatGPTAdapter } from "./chatgpt";
import { ClaudeAdapter } from "./claude";

/** All registered platform adapters, in priority order */
const adapters: PlatformAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
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

/**
 * Get an adapter by its ID string.
 */
export function getAdapterById(id: string): PlatformAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

/**
 * List all available platform adapters (for the popup UI).
 */
export function listAllPlatforms(): { id: string; name: string }[] {
  return adapters.map((a) => ({ id: a.id, name: a.name }));
}
export function getAvailablePlatforms(): Array<{ id: string; name: string }> {
  return adapters.map((a) => ({ id: a.id, name: a.name }));
}
