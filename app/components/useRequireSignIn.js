"use client";

import { useCallback, useEffect, useRef } from "react";
import { useClerk, useUser } from "@clerk/nextjs";

// ---------------------------------------------------------------------------
// Posting, replying and voting all need an account, so the API answers 401 when
// a logged-out visitor tries. This handles that without losing what they were
// doing.
//
// Two things have to survive, and they need different mechanisms:
//
//   THE PAGE  Clerk opens as a modal on top of the current page rather than
//             navigating to /sign-in. Nothing unmounts, so the form, the open
//             thread and the scroll position are all still there behind it.
//
//   A RELOAD  Signing in has to reach the server too — the session cookie is
//             what makes the next request authenticated — and Clerk refreshes
//             to make that happen. A refresh destroys React state, so anything
//             typed is stashed in sessionStorage first and put back on the way
//             in.
//
// An earlier version of this did only the first. It looked cleaner and failed
// in practice, because the refresh is the thing that actually happens.
//
// sessionStorage rather than localStorage: a draft should not outlive the tab.
// A half-written opinion resurfacing next week, under a topic they have
// forgotten, is confusing rather than helpful.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "kastochha:pending";

// Safe on the server and in private-mode browsers, where storage can throw.
function store() {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readPending() {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // An hour is well past any real sign-up and stops a stale draft appearing
    // if the tab was left open overnight.
    if (!parsed?.key || Date.now() - (parsed.at || 0) > 60 * 60 * 1000) {
      s.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearPending() {
  const s = store();
  try {
    s?.removeItem(STORAGE_KEY);
  } catch {
    // A stale entry expires on its own.
  }
}

/**
 * @param {object}   [options]
 * @param {string}   [options.draftKey]  identifies whose draft this is, so a
 *                                       reply composer doesn't rehydrate into
 *                                       the share form
 * @param {function} [options.onRestore] called with the saved draft after a
 *                                       reload, to put it back on screen
 */
export default function useRequireSignIn({ draftKey, onRestore } = {}) {
  // NOT destructured. useClerk() returns the Clerk singleton, and pulling a
  // method off it can leave the call unbound — which fails silently, exactly
  // the way this did.
  const clerk = useClerk();
  const { isSignedIn } = useUser();

  // Refs rather than state: nothing on screen depends on these, and storing
  // them in state would re-render every component using this hook.
  const pendingAction = useRef(null);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  // --- after a reload: put the draft back ----------------------------------
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !draftKey) return;

    const pending = readPending();
    if (!pending || pending.key !== draftKey) return;

    restored.current = true;
    clearPending();
    restoreRef.current?.(pending.draft);
  }, [draftKey]);

  // --- still mounted: run the queued action once signed in -----------------
  useEffect(() => {
    if (!isSignedIn) return;

    const action = pendingAction.current;
    if (!action) return;

    // Clear before running: if the retry 401s again — an expired session, say —
    // a clean slate beats an action that re-queues itself forever.
    pendingAction.current = null;
    clearPending();

    Promise.resolve()
      .then(action)
      .catch(() => {
        // The action surfaces its own errors; this only stops an unhandled
        // rejection reaching the console.
      });
  }, [isSignedIn]);

  return useCallback(
    (retry, draft) => {
      pendingAction.current = typeof retry === "function" ? retry : null;

      // Stash before opening Clerk, not after: if the refresh happens quickly
      // there may be no "after".
      if (draftKey && draft) {
        const s = store();
        try {
          s?.setItem(
            STORAGE_KEY,
            JSON.stringify({ key: draftKey, draft, at: Date.now() })
          );
        } catch {
          // Quota or private mode. The modal still opens; only the reload
          // fallback is lost.
        }
      }

      try {
        clerk.openSignIn({});
      } catch {
        // If the modal cannot open for any reason, fall back to the sign-in
        // page. The draft is already saved, so it survives the navigation —
        // but only if they come back to the page that saved it. Without the
        // return url they land on the homepage, where nothing matches the
        // draft key and their words sit in storage unread until they expire.
        const back = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent(back)}`;
      }
    },
    [clerk, draftKey]
  );
}
