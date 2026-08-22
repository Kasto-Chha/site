"use client";

import { useCallback, useState } from "react";

import useRequireSignIn from "./useRequireSignIn";

// Shared voting state for the card-style polls (trending topics and battles).
//
// The counts live in React state rather than being poked into the DOM by id, so
// a re-render can't wipe them and the server's authoritative row is what ends
// up on screen. `initialVotes` is the signed-in user's existing votes, read on
// the server, so the page already knows what they picked before they click.
//
// Clicking the option you already picked withdraws the vote; clicking a
// different one moves it. Every click therefore changes the number — which is
// what the old "increment only, then 409 forever" flow could not do.
export default function useCardVotes(initialRows, initialVotes, config) {
  const { endpoint, resultKey, columns } = config;

  // Seeded once from the server render; from then on this state is the source
  // of truth for what is on screen.
  const [rows, setRows] = useState(initialRows);
  const [votes, setVotes] = useState(() => ({ ...initialVotes }));
  const [pending, setPending] = useState(() => new Set());
  const [errors, setErrors] = useState({});
  const requireSignIn = useRequireSignIn();

  const patchRow = useCallback((id, patch) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  // Move the counters for a previous -> next transition, exactly as the
  // server's apply_* function will.
  const shiftCounts = useCallback(
    (id, previous, next) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const updated = { ...row };
          if (previous && columns[previous]) {
            const column = columns[previous];
            updated[column] = Math.max(0, (updated[column] || 0) - 1);
          }
          if (next && columns[next]) {
            const column = columns[next];
            updated[column] = (updated[column] || 0) + 1;
          }
          return updated;
        })
      );
    },
    [columns]
  );

  const setError = useCallback((id, message) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  const cast = useCallback(
    async (id, choice) => {
      if (pending.has(id)) return;

      const previous = votes[id] || "";
      const next = previous === choice ? "" : choice;

      setPending((prev) => new Set(prev).add(id));
      setError(id, "");
      // Optimistic: show the result immediately, reconcile with the server row
      // when it answers, roll back if it refuses.
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
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id, side: choice })
        });

        if (response.status === 401) {
          // Same as the experience votes: undo, open Clerk in a modal, and let
          // the vote land by itself afterwards.
          rollback();
          requireSignIn(() => handleVote(id, choice));
          return;
        }

        if (!response.ok) {
          rollback();
          const data = await response.json().catch(() => ({}));
          setError(id, data?.error || "Could not save your vote. Please try again.");
          return;
        }

        const data = await response.json();
        // Trust the server row over the optimistic guess — it also folds in any
        // votes other people cast between page load and this click.
        if (data?.[resultKey]) patchRow(id, data[resultKey]);
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
    [endpoint, resultKey, pending, votes, shiftCounts, patchRow, setError]
  );

  return {
    rows,
    cast,
    voteOf: (id) => votes[id] || null,
    isPending: (id) => pending.has(id),
    errorFor: (id) => errors[id] || ""
  };
}
