"use client";

import { useMemo, useState } from "react";

import BusinessQuestions from "./BusinessQuestions";
import GoogleCopyCard from "./GoogleCopyCard";
import { revealWhenPresent } from "../../../lib/revealNew";
import { newPostByOpener } from "../../../lib/publicPosts";
import TopicThread from "../../components/TopicThread";
import useReviewVotes from "../../components/useReviewVotes";
import useExperienceEdits from "../../components/useExperienceEdits";
import useRequireSignIn from "../../components/useRequireSignIn";
import { buildTopics } from "../../../lib/topics";

// Dedicated thread view for one discussion: the experience list starts
// expanded, voting works like on the Experience page, and the composer posts
// into the same reviews pool so replies join this thread's topic slug.
//
// A business thread shows the business's name and category (displayTitle, displayCategory)
// in place of the first post's. That is for the eye only: a reply is always sent under the
// thread's own title (the first post's), because that is what makes the thread's address.
export default function ThreadClient({ reviews = [], threadSlug, myVotes = {}, displayTitle = "", displayCategory = "", googleUrl = "", businessSlug = "", ownerReplies = {}, ownerName = "", canReplyAsOwner = false, canModerate = false }) {
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
  // On a business's page with a Google link: the words just posted, so "copy my text and open Google" can be offered.
  const [lastPost, setLastPost] = useState("");
  // On a business's page: the business's replies by the post they answer, and the calls that change them.
  const [replies, setReplies] = useState(ownerReplies);
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
        // It comes back without any account id and marked as the viewer's own; whether it is the opener's follows from the thread.
        setItems((prev) => [{ ...data.review, by_op: newPostByOpener(prev) }, ...prev]);
      }
      // The Google card, when there is one, repeats the words just posted and holds the next step, so it is what to bring
      // into view; otherwise the new post itself.
      if (googleUrl && summary) {
        setLastPost(summary);
        revealWhenPresent("google-copy-card");
      } else if (data?.review?.id) {
        revealWhenPresent(`exp-${data.review.id}`);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not post your reply. Try again." };
    }
  };

  async function ownerCall(url, method, body) {
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: data?.error || "That did not work. Try again." };
      return { ok: true, data };
    } catch {
      return { ok: false, error: "That did not work. Try again." };
    }
  }

  const ownerThread = ownerName
    ? {
        name: ownerName,
        canReply: canReplyAsOwner,
        canModerate,
        replies,
        save: async (reviewId, body) => {
          const result = await ownerCall("/api/sync/owner-replies", "POST", { reviewId, body });
          if (result.ok) {
            setReplies((prev) => ({ ...prev, [reviewId]: result.data.reply }));
            revealWhenPresent(`reply-${result.data.reply.id}`);
          }
          return result;
        },
        edit: async (replyId, body) => {
          const result = await ownerCall(`/api/sync/owner-replies/${replyId}`, "PUT", { body });
          if (result.ok) {
            setReplies((prev) => ({ ...prev, [result.data.reply.review_id]: result.data.reply }));
            revealWhenPresent(`reply-${result.data.reply.id}`);
          }
          return result;
        },
        remove: async (replyId) => {
          const result = await ownerCall(`/api/sync/owner-replies/${replyId}`, "DELETE");
          if (result.ok) setReplies((prev) => Object.fromEntries(Object.entries(prev).filter(([, reply]) => reply.id !== replyId)));
          return result;
        }
      }
    : null;

  if (!topic) return null;

  const showsBusiness = Boolean(displayTitle || displayCategory);
  const shownTopic = showsBusiness
    ? { ...topic, title: displayTitle || topic.title, category: displayCategory || topic.category }
    : topic;

  const thread = (
    <TopicThread
      topic={shownTopic}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      onVote={handleVote}
      voteOf={voteOf}
      isPending={isPending}
      errorFor={errorFor}
      onReply={showsBusiness ? (_shown, payload) => submitReply(topic, payload) : submitReply}
      onEdit={editExperience}
      onDelete={removeExperience}
      isEditBusy={isEditBusy}
      editErrorFor={editErrorFor}
      restoredReply={restoredReply}
      showPermalink={false}
      ownerThread={ownerThread}
    />
  );

  // On a business's page the questions asked about it are shown above the thread (the card itself never draws
  // a question as a row). An ordinary thread has none of this and renders exactly as it did.
  const withQuestions = ownerName ? (
    <>
      <BusinessQuestions
        questions={items.filter((item) => item.kind === "question")}
        businessName={ownerName}
        ownerThread={ownerThread}
        onDelete={removeExperience}
        isBusy={isEditBusy}
        errorFor={editErrorFor}
      />
      {thread}
    </>
  ) : (
    thread
  );

  // No Google offer showing: nothing more to add.
  if (!googleUrl || !lastPost) return withQuestions;
  return (
    <>
      <GoogleCopyCard text={lastPost} googleUrl={googleUrl} businessSlug={businessSlug} onClose={() => setLastPost("")} />
      {withQuestions}
    </>
  );
}
