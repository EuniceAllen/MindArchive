// ============================================================
// MindArchive — Claude MutationObserver
// ============================================================
// Watches the Claude DOM for new messages appearing in
// real time (streaming assistant responses, new user sends).
// ============================================================

import type { Message } from "@/core/types";
import { extractMessages, countMessageElements } from "./extractor";

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
      const newMessages = allMessages.slice(knownCount);

      if (newMessages.length > 0) {
        onNewMessages(newMessages);
      }

      knownCount = currentCount;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
