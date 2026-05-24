// ============================================================
// MindArchive — Claude MutationObserver
// ============================================================
// Watches the Claude DOM for new messages appearing in
// real time (streaming assistant responses, new user sends).
//
// Uses selectors from extractor.ts:
//   User:   div[class*="font-user-message"]
//   Claude: div.font-claude-response
//
// Extraction uses depth-first traversal producing blocks:
//   text | heading | code_block | list | blockquote
// ============================================================

import type { Message } from "@/core/types";
import { extractMessages, countMessageElements } from "./extractor";

/**
 * Start observing the DOM for new messages.
 *
 * Strategy: track the count of known message containers.
 * When a mutation adds a new container, extract all messages
 * and fire the callback with only the new ones.
 *
 * Note: during streaming, Claude may update message content
 * inside an existing container (no new container added).
 * This observer primarily catches new message turns.
 *
 * @returns A cleanup function that disconnects the observer.
 */
export function observeMessages(
  onNewMessages: (messages: Message[]) => void
): () => void {
  let knownCount = countMessageElements();

  console.log(
    `[MindArchive] Claude observer started. Initial count: ${knownCount}`
  );

  const observer = new MutationObserver(() => {
    const currentCount = countMessageElements();

    if (currentCount > knownCount) {
      const allMessages = extractMessages(false);
      // Only report messages that are new since last check
      const newMessages = allMessages.slice(knownCount);

      if (newMessages.length > 0) {
        console.log(
          `[MindArchive] Claude observer: ${newMessages.length} new message(s)`
        );
        onNewMessages(newMessages);
      }

      knownCount = currentCount;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
