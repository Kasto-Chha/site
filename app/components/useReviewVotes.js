"use client";

import { useCallback, useState } from "react";

import useRequireSignIn from "./useRequireSignIn";

// Shared voting state for review/experience items (the up/down arrows).
//
// `initialVotes` ({ reviewId: "up" | "down" }) is read on the server for the
// signed-in user, so the arrows come back highlighted after a reload. It used
// to be kept in localStorage, which was wrong twice over: it wasn't scoped to
// the signed-in user (the next person on the same browser inherited the locks)
// and it could disagree with the database, leaving arrows that looked live but
// only ever produced a rejected vote.
//
// Clicking the arrow you already used withdraws the vote; clicking the other
// one flips it. The server returns the updated row, which replaces the
// optimistic guess.
export default function useReviewVotes(initialItems, initialVotes = {}) {
  const [items, setItems] = useState(initialItems);
  const [votes, setVotes] = useState(() => ({ ...initialVotes }));
  const [pending, setPending] = useState(() => new Set());
  const [errors, setErrors] = useState({});
  const requireSignIn = useRequireSignIn();

  // Move upvotes/downvotes for a previous -> next transition, exactly as the
  // server's apply_review_vote does.
  const shiftCounts = useCallback((id, previous, next) => {
    const column = (direction) => (direction === "up" ? "upvotes" : "downvotes");
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item };
        if (previous) {
          const key = column(previous);
          updated[key] = Math.max(0, (updated[key] || 0) - 1);
        }
        if (next) {
          const key = column(next);
          updated[key] = (updated[key] || 0) + 1;
        }
        return updated;
      })
    );
  }, []);

  const setError = useCallback((id, message) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  const handleVote = useCallback(
    async (id, direction) => {
      if (pending.has(id)) return;

      const previous = votes[id] || "";
      const next = previous === direction ? "" : direction;

      setPending((prev) => new Set(prev).add(id));
      setError(id, "");
      shiftCounts(id, previous, next);
      setVotes((prev) => {
        const updated = { ...prev };
        if (next) updated[id] = next;
        else delete updated[id];
        return updated;
      });

      const rollback = () => {
        shiftCounts(id, next, previous);
        setVotes((prev) => {
          const updated = { ...prev };
          if (previous) updated[id] = previous;
          else delete updated[id];
          return updated;
        });
      };

      try {
        const response = await fetch("/api/votes/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id, direction })
        });

        if (response.status === 401) {
          // Not signed in. Undo the optimistic change, then open Clerk over the
          // page. Nothing unmounts, so the visitor keeps their scroll position
          // and the vote is re-sent for them once they're in.
          rollback();
          requireSignIn(() => handleVote(id, direction));
          return;
        }

        if (!response.ok) {
          rollback();
          const data = await response.json().catch(() => ({}));
          setError(id, data?.error || "Could not save your vote. Please try again.");
          return;
        }

        const data = await response.json();
        if (data?.review) {
          setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, ...data.review } : item))
          );
        }
        setVotes((prev) => {
          const updated = { ...prev };
          if (data?.vote) updated[id] = data.vote;
          else delete updated[id];
          return updated;
        });
      } catch {
        rollback();
        setError(id, "Network problem — your vote was not saved.");
      } finally {
        setPending((prev) => {
          const updated = new Set(prev);
          updated.delete(id);
          return updated;
        });
      }
    },
    [pending, votes, shiftCounts, setError]
  );

  const voteOf = useCallback((id) => votes[id] || null, [votes]);
  const isPending = useCallback((id) => pending.has(id), [pending]);
  const errorFor = useCallback((id) => errors[id] || "", [errors]);

  return { items, setItems, handleVote, voteOf, isPending, errorFor };
}
