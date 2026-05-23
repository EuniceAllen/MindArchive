// ============================================================
// MindArchive — ChatGPT MutationObserver
// ============================================================
// Watches the ChatGPT DOM for new messages appearing in
// real time (streaming assistant responses, new user sends).
//
// ## Design
//
// Rather than observing every DOM mutation (expensive),
// we count the number of [data-message-author-role] elements
// and fire a callback whenever the count increases.
//
// We observe the main conversation container with
// childList + subtree so we catch new message wrappers
// being inserted at any depth.
//
// ## Duplicate Prevention
//
// We track the count of known messages. When new ones
// appear, we only extract and report the new ones.
// ============================================================

import type { Message } from "@/core/types";
import { extractMessages, findConversationRoot, countMessageElements } from "./extractor";

/**
 * Start observing the ChatGPT DOM for new messages.
 *
 * @param onNewMessages - Called with only the NEW messages
 *   that appeared since the last observation
 * @returns A cleanup function — call to stop observing
 */
export function observeMessages(
  onNewMessages: (messages: Message[]) => void
): () => void {
  // Capture the current message count as baseline
  let knownCount = countMessageElements();

  console.log(
    `[MindArchive] Observer started. Initial message count: ${knownCount}`
  );

  const observer = new MutationObserver(() => {
    const currentCount = countMessageElements();

    if (currentCount > knownCount) {
      console.log(
        `[MindArchive] New messages detected: ${knownCount} → ${currentCount}`
      );

      // Extract ALL current messages, then slice off the new ones
      const allMessages = extractMessages(false); // silent mode
      const newMessages = allMessages.slice(knownCount);

      if (newMessages.length > 0) {
        console.log(
          `[MindArchive] Reporting ${newMessages.length} new message(s):`,
          newMessages.map((m) => `${m.role}: ${m.content.slice(0, 50)}...`)
        );
        onNewMessages(newMessages);
      }

      knownCount = currentCount;
    }
  });

  // Observe the conversation root, or fall back to body
  const root = findConversationRoot();
  const target = root || document.body;

  console.log(
    `[MindArchive] Observing: ${root ? "conversation root" : "document.body"}`
  );

  observer.observe(target, {
    childList: true,
    subtree: true,
    // We don't need characterData or attributes —
    // new messages always arrive as new DOM nodes
  });

  // Return cleanup
  return () => {
    console.log(
      `[MindArchive] Observer disconnected. Final count: ${knownCount}`
    );
    observer.disconnect();
  };
}
