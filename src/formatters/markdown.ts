// ============================================================
// MindArchive — Markdown Formatter
// ============================================================
// Converts a Conversation object into a clean, readable
// Markdown string suitable for long-term archival.
//
// Design principles:
//   - Human-readable above all else
//   - Preserves original message formatting
//   - Includes metadata as YAML frontmatter
//   - Easy to parse by future tools (semantic search, etc.)
// ============================================================

import type { Conversation } from "@/core/types";

/**
 * Convert a Conversation into a Markdown string with
 * YAML frontmatter for metadata.
 */
export function formatConversation(conversation: Conversation): string {
  const lines: string[] = [];

  // ── YAML Frontmatter ──────────────────────────────────────
  lines.push("---");
  lines.push(`platform: ${conversation.platform}`);
  lines.push(`title: "${escapeYaml(conversation.title)}"`);
  lines.push(`url: ${conversation.url}`);
  lines.push(`captured_at: ${conversation.capturedAt}`);
  lines.push(`message_count: ${conversation.messages.length}`);
  lines.push(`mindarchive_id: ${conversation.id}`);
  lines.push("---");
  lines.push("");

  // ── Title ─────────────────────────────────────────────────
  lines.push(`# ${conversation.title}`);
  lines.push("");

  // ── Metadata section ──────────────────────────────────────
  lines.push(`> **Platform:** ${conversation.platform}  `);
  lines.push(`> **Captured:** ${formatDate(conversation.capturedAt)}  `);
  lines.push(`> **Source:** [Open in ${conversation.platform}](${conversation.url})  `);
  lines.push("");

  lines.push("---");
  lines.push("");

  // ── Messages ──────────────────────────────────────────────
  for (let i = 0; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i];
    const roleLabel = msg.role === "user" ? "🧑 You" : "🤖 Assistant";
    const timestamp = msg.timestamp ? ` *(${formatDate(msg.timestamp)})*` : "";

    lines.push(`### ${roleLabel}${timestamp}`);
    lines.push("");

    // Preserve the message content as-is (may contain markdown)
    lines.push(msg.content);
    lines.push("");

    // Add a separator between messages (not after the last one)
    if (i < conversation.messages.length - 1) {
      lines.push("---");
      lines.push("");
    }
  }

  // ── Footer ────────────────────────────────────────────────
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    `*Archived with [MindArchive](https://github.com/mindarchive) — your second brain for AI conversations.*`
  );

  return lines.join("\n");
}

/**
 * Generate a safe filename from a conversation.
 * Format: YYYY-MM-DD_Title_Slug.md
 */
export function generateFilename(conversation: Conversation): string {
  const date = conversation.capturedAt.slice(0, 10); // YYYY-MM-DD
  const slug = slugify(conversation.title);

  // Truncate slug to keep filenames manageable
  const maxSlug = 60;
  const truncated = slug.length > maxSlug ? slug.slice(0, maxSlug) : slug;

  return `${date}_${truncated}.md`;
}

// ─── Helpers ──────────────────────────────────────────────────

function escapeYaml(value: string): string {
  // Escape double quotes and backslashes for YAML
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-") // Keep CJK characters
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "conversation";
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}
