"use client";

import { useMemo, useState } from "react";

import TopicThread from "./TopicThread";
import useReviewVotes from "./useReviewVotes";
import useExperienceEdits from "./useExperienceEdits";
import { buildTopics } from "../../lib/topics";

// Compact Reddit-style wall used on the homepage. Reuses the same topic grouping
// and thread rendering as the Experience page, limited to the most active topics.
export default function ExperienceWall({ reviews = [], myVotes = {}, topicLimit = 5 }) {
  const { items, setItems, handleVote, voteOf, isPending, errorFor } = useReviewVotes(
    reviews,
    myVotes
  );
  const { editExperience, removeExperience, isEditBusy, editErrorFor } =
    useExperienceEdits(setItems);
  const [expanded, setExpanded] = useState(() => new Set());

  const topics = useMemo(() => {
    const all = buildTopics(items).sort(
      (a, b) => new Date(b.lastActivity) - new Date(a.lastActivity)
    );
    return topicLimit ? all.slice(0, topicLimit) : all;
  }, [items, topicLimit]);

  const toggleTopic = (slug) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div className="topic-feed">
      {topics.length === 0 ? (
        <div className="review-card empty-card">
          <div className="review-body">
            <div className="review-title">No experiences yet</div>
            <div className="review-text">
              Be the first to share your experience.
            </div>
          </div>
        </div>
      ) : (
        topics.map((topic) => (
          <TopicThread
            key={topic.slug}
            topic={topic}
            isOpen={expanded.has(topic.slug)}
            onToggle={toggleTopic}
            onVote={handleVote}
            voteOf={voteOf}
            isPending={isPending}
            errorFor={errorFor}
            onEdit={editExperience}
            onDelete={removeExperience}
            isEditBusy={isEditBusy}
            editErrorFor={editErrorFor}
          />
        ))
      )}
    </div>
  );
}
