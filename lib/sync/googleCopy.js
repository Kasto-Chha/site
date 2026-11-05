// "Copy my text and open Google", the step after someone has posted on a business's page. The
// business's Google review box cannot be filled in for them (Google does not allow it, and KastoChha
// does not post on anyone's behalf), so the most that can be done is to put their own words on the
// clipboard and open the box, so they can paste. Plain, with its dependencies handed in, so it can
// be tested without a browser. Client-safe: it imports nothing.
//
// The ORDER matters, and a real browser taught it: the copy is made first and waited for (briefly),
// and only then is Google opened. Asking for both at the same instant fails, because a browser
// refuses to write the clipboard once a new tab has taken focus. The wait is short (a second, at
// most) so the page is still opened while the click is fresh enough for a pop-up blocker to allow it,
// and the page that shows this always offers a plain link too, for a browser that blocks the tab
// anyway. If the copy is refused or takes too long, Google still opens and the answer says so.
export const COPY_WAIT_MS = 1000;

export async function copyAndOpenGoogle({ text, url, slug, clipboard, open, track, waitMs = COPY_WAIT_MS }) {
  let copied = false;
  let timer;
  try {
    if (clipboard && typeof clipboard.writeText === "function") {
      const write = Promise.resolve(clipboard.writeText(String(text))).then(() => true, () => false);
      const patience = new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), waitMs);
      });
      copied = await Promise.race([write, patience]);
    }
  } catch {
    copied = false;
  } finally {
    clearTimeout(timer);
  }
  try {
    open(url, "_blank", "noopener,noreferrer");
  } catch {
    // The visitor still has the link on the page.
  }
  try {
    track({ slug, type: "google_copy" });
  } catch {
    // Counting is an aid, never a gate.
  }
  return copied;
}
