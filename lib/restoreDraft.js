// What the thread's reply box should do when a draft saved before sign-in arrives after the box is already on the
// page. The saved text comes back a moment after the box first appears (the page reloads, then the draft is read
// from the browser's temporary storage), and a box that only reads it when it first appears stays empty: the
// words typed before signing in were lost on any thread that already had posts (found in testing, check E15).

// Returns the words to put in the box, or null when nothing should change. It never overwrites words a person has
// already started typing, and never acts on an empty draft.
export function draftToApply(currentText, draft) {
  const summary = typeof draft?.summary === "string" ? draft.summary : "";
  if (!summary.trim()) return null;
  if (typeof currentText === "string" && currentText.trim()) return null;
  return { summary, verdict: typeof draft.verdict === "string" ? draft.verdict : "" };
}

// True when the box already holds exactly the draft (it was there on the first render), so the box can still say
// "We kept what you wrote" and take focus without rewriting anything.
export function boxAlreadyHoldsDraft(currentText, draft) {
  return typeof currentText === "string" && Boolean(currentText.trim()) && currentText === draft?.summary;
}
