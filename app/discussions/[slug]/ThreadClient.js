"use client";

import { useMemo, useState } from "react";

import TopicThread from "../../components/TopicThread";
import useReviewVotes from "../../components/useReviewVotes";
import useExperienceEdits from "../../components/useExperienceEdits";
import useRequireSignIn from "../../components/useRequireSignIn";
import { buildTopics } from "../../../lib/topics";

// Dedicated thread view for one discussion: the experience list starts
// expanded, voting works like on the Experience page, and the composer posts
// into the same reviews pool so replies join this thread's topic slug.
export default function ThreadClient({ reviews = [], threadSlug, myVotes = {} }) {
  const { items, setItems, handleVote, voteOf, isPending, errorFor } = useReviewVotes(
    reviews,
    myVotes
  );
  const { editExperience, removeExperience, isEditBusy, editErrorFor } =
    useExperienceEdits(setItems);
  const [isOpen, setIsOpen] = useState(true);
  // A reply typed on a thread page. Keyed by slug so it can only rehydrate
  // into the thread it was written for.
  const [restoredReply, setRestoredReply] = useState(null);
  const requireSignIn = useRequireSignIn({
    draftKey: `thread:${threadSlug}`,
    onRestore: (draft) => {
      setRestoredReply(draft);
      setIsOpen(true);
    }
  });

  const topic = useMemo(() => {
    const topics = buildTopics(items);
    return topics.find((t) => t.slug === threadSlug) || topics[0] || null;
  }, [items, threadSlug]);

  const submitReply = async (topicItem, { summary, verdict }) => {
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: topicItem.title,
          category: topicItem.category,
          verdict: verdict || "",
          summary
        })
      });

      // Not signed in. Open Clerk over this page and post the same reply once
      // they're through, so the thread they were reading stays put.
      if (response.status === 401) {
        requireSignIn(() => submitReply(topicItem, { summary, verdict }), {
          summary,
          verdict
        });
        return { ok: false };
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { ok: false, error: data?.error || "Could not post your reply. Try again." };
      }

      const data = await response.json();
      if (data?.review) {
        setItems((prev) => [data.review, ...prev]);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not post your reply. Try again." };
    }
  };

  if (!topic) return null;

  return (
    <TopicThread
      topic={topic}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      onVote={handleVote}
      voteOf={voteOf}
      isPending={isPending}
      errorFor={errorFor}
      onReply={submitReply}
      onEdit={editExperience}
      onDelete={removeExperience}
      isEditBusy={isEditBusy}
      editErrorFor={editErrorFor}
      restoredReply={restoredReply}
      showPermalink={false}
    />
  );
}
