// ============================================================
// MindArchive — Markdown Formatter
// ============================================================
// Converts a Conversation object into a clean, readable
// Markdown string suitable for long-term archival.
//
// Design principles:
//   - Human-readable above all else
//   - Preserves original message formatting (blocks or flat)
//   - Includes metadata as YAML frontmatter
//   - Compatible with Obsidian, Notion, GitHub, RAG pipelines
//
// Content rendering strategy:
//   - Message.blocks (structured) → typed block renderer
//   - Message.content (flat)     → auto-detect + passthrough
//   - Both paths handle code fences, truncation, attachments
// ============================================================

import type { Conversation, Message, ContentBlock } from "@/core/types";

// ─── Platform-aware role labels ─────────────────────────────

const PLATFORM_LABELS: Record<string, { user: string; assistant: string }> = {
  chatgpt:  { user: "🧑 You",       assistant: "🤖 ChatGPT" },
  claude:   { user: "🧑 You",       assistant: "🤖 Claude" },
  deepseek: { user: "🧑 You",       assistant: "🤖 DeepSeek" },
};

const DEFAULT_LABELS = { user: "🧑 You", assistant: "🤖 Assistant" };

// ─── Public API ─────────────────────────────────────────────

/**
 * Convert a Conversation into a Markdown string with
 * YAML frontmatter for metadata.
 */
export function formatConversation(conversation: Conversation): string {
  const lines: string[] = [];
  const labels = PLATFORM_LABELS[conversation.platform] || DEFAULT_LABELS;

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

  // ── Metadata blockquote ───────────────────────────────────
  lines.push(`> **Platform:** ${conversation.platform}  `);
  lines.push(`> **Captured:** ${formatDate(conversation.capturedAt)}  `);
  lines.push(`> **Source:** [Open in ${conversation.platform}](${conversation.url})  `);
  lines.push("");

  lines.push("---");
  lines.push("");

  // ── Messages ──────────────────────────────────────────────
  for (let i = 0; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i];
    const roleLabel = msg.role === "user" ? labels.user : labels.assistant;
    const timestamp = msg.timestamp ? ` *(${formatDate(msg.timestamp)})*` : "";

    lines.push(`### ${roleLabel}${timestamp}`);
    lines.push("");

    // Render message body: blocks (structured) or content (flat)
    if (msg.blocks && msg.blocks.length > 0) {
      renderBlocks(msg.blocks, lines);
    } else {
      renderFlatContent(msg.content, lines);
    }

    // Truncated warning
    if (msg.truncated) {
      lines.push("");
      lines.push("> ⚠️ *Content was truncated by the platform API*");
    }

    // Attachments
    if (msg.attachments && msg.attachments.length > 0) {
      lines.push("");
      renderAttachments(msg.attachments, lines);
    }

    lines.push("");

    // Separator: use `---` only between role changes (lighter for same-role)
    const next = conversation.messages[i + 1];
    if (next) {
      if (next.role !== msg.role) {
        lines.push("---");
      } else {
        lines.push("—");
      }
      lines.push("");
    }
  }

  // ── Footer ────────────────────────────────────────────────
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    `*Archived with [MindArchive](https://github.com/EuniceAllen/mindarchive) — your second brain for AI conversations.*`
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

// ─── Structured Block Rendering ─────────────────────────────

/**
 * Render structured ContentBlock[] into markdown lines.
 * This is the primary rendering path when platform extractors
 * populate Message.blocks (Claude does this; ChatGPT/DeepSeek
 * currently use flat content but may adopt blocks later).
 */
function renderBlocks(blocks: ContentBlock[], lines: string[]): void {
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        lines.push(block.content);
        break;

      case "heading":
        // Offset by +1: conversation title is h1, so message
        // headings start at h2 (##).  Clamp to h2–h5.
        const level = Math.min(block.level + 1, 5);
        lines.push(`${"#".repeat(level)} ${block.content}`);
        break;

      case "code_block":
        safeCodeFence(block.content, block.language, lines);
        break;

      case "list":
        for (let i = 0; i < block.items.length; i++) {
          const marker = block.ordered ? `${i + 1}.` : "-";
          lines.push(`${marker} ${block.items[i]}`);
        }
        break;

      case "blockquote":
        // Multi-line blockquote: prefix each line
        for (const qLine of block.content.split("\n")) {
          lines.push(`> ${qLine}`);
        }
        break;
    }
    // Blank line between blocks for readability
    lines.push("");
  }
}

// ─── Flat Content Rendering ─────────────────────────────────

/**
 * Render flat `msg.content` string.
 * Auto-detects inline fenced code blocks to apply safety handling.
 * Otherwise passes through as-is (content may already contain
 * markdown from the platform).
 */
function renderFlatContent(content: string, lines: string[]): void {
  if (!content) {
    lines.push("*（空消息）*");
    return;
  }

  // Auto-detect and protect nested code fences in flat content.
  // Some extractors (DeepSeek's fenceCode) inject ``` markers
  // into textContent. We scan for the max backtick run and
  // upgrade the outer fence if needed.
  const safeContent = autoUpgradeFences(content);
  lines.push(safeContent);
}

/**
 * Scan content for ``` fences and ensure they won't break
 * the Markdown structure. If the content contains a ``` fence,
 * and the surrounding markdown may also use fences, we need
 * to be careful. Since flat content is rendered as-is, the
 * main risk is the content having more backticks than the
 * reader expects — but since we're not wrapping flat content
 * in fences, this is a no-op for safety. The content passes
 * through and its own fences self-delimit.
 *
 * The real protection: if content STARTS or ENDS with ```
 * (which could merge with surrounding Markdown), we add
 * a blank-line guard.
 */
function autoUpgradeFences(content: string): string {
  let result = content;

  // Guard: ensure code fences don't touch message boundaries
  if (result.startsWith("```")) {
    result = "\n" + result;
  }
  if (result.endsWith("```")) {
    result = result + "\n";
  }

  return result;
}

// ─── Code Block Safety ──────────────────────────────────────

/**
 * Emit a fenced code block, automatically upgrading the fence
 * length to avoid conflicts with nested backtick sequences.
 *
 * Rules:
 *   - Count the longest run of consecutive backticks inside content
 *   - Use at least that + 1 backticks for the fence (min 3)
 *   - Always include a language tag (default "text")
 */
function safeCodeFence(
  content: string,
  language: string,
  lines: string[]
): void {
  const lang = language || "text";

  // Find the longest run of consecutive backticks in content
  let maxRun = 0;
  let currentRun = 0;
  for (const ch of content) {
    if (ch === "`") {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 0;
    }
  }

  // Fence must be at least 3, and longer than any internal run
  const fenceLen = Math.max(3, maxRun + 1);
  const fence = "`".repeat(fenceLen);

  lines.push(`${fence}${lang}`);

  // Preserve leading/trailing whitespace
  lines.push(content);

  lines.push(fence);
}

// ─── Attachment Rendering ───────────────────────────────────

/**
 * Render file attachments as a bullet list of links.
 * Handles various attachment shapes from different platforms.
 */
function renderAttachments(attachments: unknown[], lines: string[]): void {
  lines.push("**📎 Attachments:**");
  lines.push("");

  for (const att of attachments) {
    if (!att || typeof att !== "object") continue;
    const a = att as Record<string, unknown>;

    // Common attachment shapes across platforms
    const name = stringOr(a, "file_name", "name", "title", "filename");
    const url = stringOr(a, "url", "href", "link");
    const mimeType = stringOr(a, "mime_type", "type", "content_type");
    const size = a.file_size ?? a.size;

    if (name && url) {
      lines.push(`- 📎 [${name}](${url})${mimeType ? ` (${mimeType})` : ""}`);
    } else if (name) {
      lines.push(`- 📎 ${name}${mimeType ? ` (${mimeType})` : ""}${size ? ` — ${formatSize(size as number)}` : ""}`);
    } else if (url) {
      lines.push(`- 📎 [${url}](${url})`);
    } else {
      // Fallback: JSON dump for unknown shapes
      try {
        lines.push(`- 📎 ${JSON.stringify(a).slice(0, 120)}`);
      } catch {
        lines.push("- 📎 *(unknown attachment)*");
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────

/** Pick the first non-empty string value from a set of keys */
function stringOr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Format file size in human-readable form */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeYaml(value: string): string {
  // Escape double quotes and backslashes for YAML.
  // Also handle control characters that break YAML parsing.
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
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
