// After someone posts, edits or replies, the new item can be off screen, and the page stays where it was. This finds the
// item by its address (an element id) as soon as it exists on the page, brings it into view, gives it a short highlight,
// and moves keyboard focus to it so a screen reader announces it. It waits, because the item often arrives a moment
// after the request finishes (the page refreshes its data, then draws it); if it never appears, nothing happens and
// nothing breaks. People who ask for reduced motion get a jump, not a smooth scroll.
//
// Returns a function that cancels the wait.
export function revealWhenPresent(id, { timeoutMs = 6000, root = typeof document !== "undefined" ? document : null, highlightMs = 2600 } = {}) {
  if (!root || !id) return () => {};
  let finished = false;
  let observer = null;
  let timer = null;

  const stop = () => {
    finished = true;
    if (observer) observer.disconnect();
    clearTimeout(timer);
  };

  const reveal = (element) => {
    const win = root.defaultView || (typeof window !== "undefined" ? window : null);
    const reduced = Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    if (typeof element.scrollIntoView === "function") element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
    if (typeof element.focus === "function") element.focus({ preventScroll: true });
    element.classList.add("just-posted");
    setTimeout(() => element.classList.remove("just-posted"), highlightMs);
  };

  const check = () => {
    if (finished) return;
    const element = root.getElementById(id);
    if (!element) return;
    stop();
    reveal(element);
  };

  timer = setTimeout(stop, timeoutMs);
  const Observer = (root.defaultView || (typeof window !== "undefined" ? window : {})).MutationObserver || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
  if (Observer) {
    observer = new Observer(check);
    observer.observe(root.body || root.documentElement, { childList: true, subtree: true });
  }
  check();
  return stop;
}
