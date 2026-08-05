"use client";

import { useCallback, useState } from "react";

// Edit / delete for your own experiences, shared by the Experience page, the
// discussion permalink, and the homepage wall so all three behave the same.
//
// Takes the setItems from useReviewVotes, since that hook owns the list the
// threads are built from. The server re-checks ownership on every call; the
// UI flags only decide what gets offered.
export default function useExperienceEdits(setItems) {
  const [busyId, setBusyId] = useState(null);
  const [errors, setErrors] = useState({});

  const setError = useCallback((id, message) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  const editExperience = useCallback(
    async (id, { summary, verdict }) => {
      const body = (summary || "").trim();
      if (!body) {
        setError(id, "Experience cannot be empty.");
        return { ok: false };
      }

      setBusyId(id);
      setError(id, "");
      try {
        const response = await fetch(`/api/reviews/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ summary: body, verdict: verdict || "" })
        });

        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          window.location.href = "/sign-in";
          return { ok: false };
        }
        if (!response.ok) {
          setError(id, data?.error || "Could not save your edit.");
          return { ok: false };
        }

        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, ...(data.review || { summary: body }) } : item
          )
        );
        return { ok: true };
      } catch {
        setError(id, "Network problem — your edit was not saved.");
        return { ok: false };
      } finally {
        setBusyId(null);
      }
    },
    [setItems, setError]
  );

  const removeExperience = useCallback(
    async (id) => {
      setBusyId(id);
      setError(id, "");
      try {
        const response = await fetch(`/api/reviews/${id}`, {
          method: "DELETE",
          credentials: "include"
        });

        if (response.status === 401) {
          window.location.href = "/sign-in";
          return { ok: false };
        }
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError(id, data?.error || "Could not delete the experience.");
          return { ok: false };
        }

        setItems((prev) => prev.filter((item) => item.id !== id));
        return { ok: true };
      } catch {
        setError(id, "Network problem — the experience was not deleted.");
        return { ok: false };
      } finally {
        setBusyId(null);
      }
    },
    [setItems, setError]
  );

  return {
    editExperience,
    removeExperience,
    isEditBusy: useCallback((id) => busyId === id, [busyId]),
    editErrorFor: useCallback((id) => errors[id] || "", [errors])
  };
}
