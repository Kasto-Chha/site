"use client";

import { useCallback, useEffect, useRef } from "react";
import { useClerk, useUser } from "@clerk/nextjs";

// ---------------------------------------------------------------------------
// What this is for
//
// Posting, replying and voting all require an account, so the API answers 401
// when a logged-out visitor tries. We used to handle that with:
//
//     window.location.href = "/sign-in";
//
// That is a full page load. Everything the visitor had on screen is gone:
// the experience they just typed, which thread they had open, where they had
// scrolled to. After signing up they land on a fresh page and have to find
// their way back and start again. Most people simply don't.
//
// This hook removes the navigation entirely. Clerk opens *on top of* the
// current page as a modal, so nothing is unmounted and nothing is lost. Once
// the visitor is signed in we re-run whatever they were trying to do, and it
// just goes through.
//
// ---------------------------------------------------------------------------
// How to use it
//
// 1. Call the hook inside a client component or another hook:
//
//        const requireSignIn = useRequireSignIn();
//
// 2. Replace the redirect in your 401 branch with a call to it, passing a
//    function that repeats the action:
//
//        if (response.status === 401) {
//          requireSignIn(() => submitReview());   // runs after they sign in
//          return;
//        }
//
// The retry function is optional. If you leave it out the modal still opens,
// it just won't repeat anything afterwards.
//
// ---------------------------------------------------------------------------

export default function useRequireSignIn() {
  const { openSignIn } = useClerk();
  const { isSignedIn } = useUser();

  // Held in a ref rather than state on purpose: storing it in state would
  // re-render every component using this hook each time an action is queued,
  // and nothing on screen depends on the queued function.
  const pendingAction = useRef(null);

  // `isSignedIn` flips to true the moment Clerk finishes signing the visitor
  // in, which is our cue that the original action can now succeed.
  useEffect(() => {
    if (!isSignedIn) return;

    const action = pendingAction.current;
    if (!action) return;

    // Clear before running. If the retry somehow 401s again (an expired
    // session, say) we want a clean slate rather than an infinite loop of
    // the same action re-queuing itself.
    pendingAction.current = null;

    Promise.resolve()
      .then(action)
      .catch(() => {
        // The action reports its own errors to the user; swallowing here just
        // stops an unhandled rejection appearing in the console.
      });
  }, [isSignedIn]);

  return useCallback(
    (retry) => {
      pendingAction.current = typeof retry === "function" ? retry : null;
      openSignIn({});
    },
    [openSignIn]
  );
}
