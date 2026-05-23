// ============================================================
// MindArchive — ChatGPT History Loader
// ============================================================
// ChatGPT lazy-loads conversation history in asynchronous
// batches. Each time the user scrolls near the top, a batch
// of older messages is fetched and inserted into the DOM.
// This increases scrollHeight, pushing the viewport down —
// which means scrollTop is no longer zero even though more
// history may still exist.
//
// ## The core challenge
//
//   scrollTop === 0  does NOT mean "fully loaded".
//
// After a batch inserts:
//   - scrollHeight grows (new messages added above)
//   - scrollTop jumps up (viewport is pushed down)
//   - the loader must KEEP scrolling to trigger the next batch
//
// ## Algorithm
//
//   for each iteration (up to MAX):
//     1. if not at top → scroll up by ~1200px
//     2. dispatch scroll event (triggers React handlers)
//     3. waitForDOMStabilization() — debounced MutationObserver
//     4. getConversationMetrics()
//     5. compare ALL metrics (messages, scrollHeight, scrollTop)
//     6. if anything changed → reset stability counter
//     7. if ALL stable for N iterations → truly done
//
// ## Why debounced stabilization (not "first new message")
//
// ChatGPT fetches a batch asynchronously, then React renders
// multiple DOM mutations. Waiting for "first mutation" isn't
// enough — we must let the full batch render before measuring.
// ============================================================

import { findConversationRoot, countMessageElements } from "./extractor";

// ─── Types ──────────────────────────────────────────────────

export type LoadPhase = "starting" | "loading" | "complete" | "already_complete";

export interface HistoryLoadProgress {
  phase: LoadPhase;
  currentCount: number;
  scrollIteration: number;
  reachedTop: boolean;
  finalCount?: number;
}

/** Snapshot of scroll + message state at a point in time */
interface ConversationMetrics {
  messageCount: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

// ─── Constants ──────────────────────────────────────────────

/** Safety cap — prevent infinite loops on extremely long chats */
const MAX_ITERATIONS = 200;

/** Pixels to scroll up per step */
const SCROLL_STEP_PX = 1200;

/** Consecutive fully-stable iterations to declare "done" */
const STABLE_THRESHOLD = 3;

/** Ms of no DOM mutations before we consider the DOM "stable" */
const DOM_STABLE_MS = 600;

/** Hard timeout per iteration (safety net if DOM never stabilizes) */
const ITERATION_TIMEOUT_MS = 4000;

// ─── Public API ─────────────────────────────────────────────

export async function loadEntireConversationHistory(
  onProgress?: (progress: HistoryLoadProgress) => void
): Promise<number> {
  const root = findConversationRoot();

  if (!root) {
    console.warn("[MindArchive] ❌ No scrollable container found.");
    return countMessageElements();
  }

  const initialMetrics = getConversationMetrics(root);
  console.log(
    `[MindArchive] 📜 History loader started.`,
    `\n  Container: <${root.tagName.toLowerCase()}>`,
    `\n  scrollHeight: ${initialMetrics.scrollHeight}`,
    `\n  clientHeight: ${initialMetrics.clientHeight}`,
    `\n  scrollTop: ${initialMetrics.scrollTop}`,
    `\n  messages: ${initialMetrics.messageCount}`
  );

  onProgress?.({
    phase: "starting",
    currentCount: initialMetrics.messageCount,
    scrollIteration: 0,
    reachedTop: initialMetrics.scrollTop <= 1,
  });

  // Trivially fully visible
  if (root.scrollHeight <= root.clientHeight) {
    console.log("[MindArchive] ✅ All content fits in viewport.");
    onProgress?.({
      phase: "already_complete",
      currentCount: initialMetrics.messageCount,
      scrollIteration: 0,
      reachedTop: true,
      finalCount: initialMetrics.messageCount,
    });
    return initialMetrics.messageCount;
  }

  const originalScrollTop = root.scrollTop;
  let prev = initialMetrics;
  let stableCount = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // ── Scroll up if we have room ──────────────────────────
    const atTop = root.scrollTop <= 1;

    if (!atTop) {
      const prevScrollTop = root.scrollTop;
      const target = Math.max(0, prevScrollTop - SCROLL_STEP_PX);

      console.log(
        `[MindArchive] 🔼 Scroll ${i + 1}: scrollTop ${prevScrollTop} → ${target}`
      );

      // Use scrollTo() — more compatible with JS virtual scrollers
      root.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
      root.dispatchEvent(new Event("scroll", { bubbles: true }));

      // If scrollTo() didn't work, fall back to direct assignment
      if (root.scrollTop === prevScrollTop && target !== prevScrollTop) {
        root.scrollTop = target;
        root.dispatchEvent(new Event("scroll", { bubbles: true }));
      }

      console.log(
        `[MindArchive]    Actual scrollTop after set: ${root.scrollTop}`
      );
    } else {
      console.log(
        `[MindArchive] · Iteration ${i + 1}: already at top (scrollTop=${root.scrollTop}), watching for batch insert...`
      );
    }

    // ── Wait for DOM to settle ─────────────────────────────
    await waitForDOMStabilization(root);

    // ── Measure ────────────────────────────────────────────
    const curr = getConversationMetrics(root);

    const msgChanged = curr.messageCount !== prev.messageCount;
    const heightChanged = curr.scrollHeight !== prev.scrollHeight;
    const scrollChanged = Math.abs(curr.scrollTop - prev.scrollTop) > 5;

    console.log(
      `[MindArchive]    Metrics:`,
      `msgs ${prev.messageCount}→${curr.messageCount}${msgChanged ? " 🔄" : ""}`,
      `| scrollH ${prev.scrollHeight}→${curr.scrollHeight}${heightChanged ? " 🔄" : ""}`,
      `| scrollTop ${prev.scrollTop}→${curr.scrollTop}${scrollChanged ? " 🔄" : ""}`
    );

    if (msgChanged || heightChanged || scrollChanged) {
      // Something changed — history may still be loading
      if (msgChanged) {
        console.log(`[MindArchive]    📨 Message count changed (+${curr.messageCount - prev.messageCount})`);
      }
      if (heightChanged) {
        console.log(`[MindArchive]    📏 scrollHeight changed — older batch inserted!`);
      }
      stableCount = 0;

      onProgress?.({
        phase: "loading",
        currentCount: curr.messageCount,
        scrollIteration: i + 1,
        reachedTop: root.scrollTop <= 1,
      });
    } else {
      stableCount++;
      console.log(
        `[MindArchive]    ✋ No changes — stable ${stableCount}/${STABLE_THRESHOLD}`
      );

      if (stableCount >= STABLE_THRESHOLD) {
        console.log(`[MindArchive] 🏁 All metrics stable for ${STABLE_THRESHOLD} iterations — history fully exhausted.`);
        break;
      }
    }

    prev = curr;

    // If we hit MAX_ITERATIONS, warn but don't crash
    if (i === MAX_ITERATIONS - 1) {
      console.warn(`[MindArchive] ⚠️ Reached MAX_ITERATIONS (${MAX_ITERATIONS}) — stopping for safety.`);
    }
  }

  const finalCount = countMessageElements();
  console.log(
    `[MindArchive] ✅ History loading complete.`,
    `\n  Final messages: ${finalCount}`,
    `\n  Started with: ${initialMetrics.messageCount}`,
    `\n  Restoring scrollTop: ${originalScrollTop}`
  );

  root.scrollTo({ top: originalScrollTop, behavior: "instant" as ScrollBehavior });
  root.dispatchEvent(new Event("scroll", { bubbles: true }));

  onProgress?.({
    phase: "complete",
    currentCount: finalCount,
    scrollIteration: -1,
    reachedTop: true,
    finalCount,
  });

  return finalCount;
}

// ─── Metrics Helper ─────────────────────────────────────────

function getConversationMetrics(root: HTMLElement): ConversationMetrics {
  return {
    messageCount: countMessageElements(),
    scrollTop: root.scrollTop,
    scrollHeight: root.scrollHeight,
    clientHeight: root.clientHeight,
  };
}

// ─── DOM Stabilization ──────────────────────────────────────
//
// ChatGPT loads history asynchronously: fetch → React render →
// multiple DOM mutations. We must wait for the ENTIRE batch
// to finish rendering, not just the first mutation.
//
// We use a debounced MutationObserver: every mutation resets
// the timer. Only when no mutations occur for DOM_STABLE_MS
// do we consider the DOM "settled".

function waitForDOMStabilization(container: Element): Promise<void> {
  return new Promise((resolve) => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    let resolved = false;

    const done = () => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      clearTimeout(hardTimeout);
      resolve();
    };

    const resetDebounce = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(done, DOM_STABLE_MS);
    };

    const observer = new MutationObserver(() => {
      resetDebounce();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-message-author-role", "style"],
    });

    // Start the debounce — if no mutations happen at all,
    // resolve after DOM_STABLE_MS
    resetDebounce();

    // Hard timeout safety net
    const hardTimeout = setTimeout(done, ITERATION_TIMEOUT_MS);
  });
}
