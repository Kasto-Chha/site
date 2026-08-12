import { auth } from "@clerk/nextjs/server";

import ChatClient from "./ChatClient";
import { TRIAL_LIMIT, trialRemaining } from "../../lib/chatTrial";
import {
  getRecentChatTopics,
  getReviews,
  getTrendingTopics,
  getUserChatTopics
} from "../../lib/supabase/queries";

export const dynamic = "force-dynamic";

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export default async function ChatPage() {
  const { userId } = await auth();

  const [trending, reviews, recentTopics, userTopics] = await Promise.all([
    getTrendingTopics(),
    getReviews(8),
    getRecentChatTopics(8),
    getUserChatTopics(userId, 40)
  ]);

  const recent = uniqueStrings(recentTopics.map((item) => item.title));
  // The user's own conversations, newest activity first. Full rows so the
  // sidebar can group them by date, reopen, rename and delete them.
  const topics = userTopics
    .filter((item) => item?.id && item?.title)
    .map((item) => ({
      id: item.id,
      title: item.title,
      message_count: item.message_count || 0,
      last_message_at: item.last_message_at || item.created_at
    }));
  const prompts = uniqueStrings([
    ...trending.map((topic) => topic.title),
    ...reviews.map((review) => review.topic || review.title)
  ]).slice(0, 4);

  const fallbackCards = [];
  if (trending[0]) {
    const totalVotes = (trending[0].votes_yes || 0) + (trending[0].votes_no || 0);
    fallbackCards.push({
      title: "Top trending",
      value: trending[0].title,
      sub: totalVotes
        ? `${totalVotes.toLocaleString("en-US")} total votes`
        : `${(trending[0].likes || 0).toLocaleString("en-US")} likes`
    });
  }
  if (reviews[0]) {
    const score = (reviews[0].upvotes || 0) - (reviews[0].downvotes || 0);
    fallbackCards.push({
      title: "Latest experience",
      value: reviews[0].topic || reviews[0].title,
      sub: `net ${score >= 0 ? "+" : ""}${score} community score`
    });
  }
  if (recent[0]) {
    fallbackCards.push({
      title: "Recent question",
      value: recent[0],
      sub: "Latest community query"
    });
  }

  const assistantFallback = {
    summary: fallbackCards.length
      ? "Community snapshot based on recent questions and signals."
      : "No community signals yet. Ask a question to get started.",
    cards: fallbackCards,
    footer: fallbackCards.length
      ? "Ask a follow up and be specific."
      : "Ask a question and the community will respond."
  };

  return (
    <ChatClient
      topics={topics}
      recent={recent}
      prompts={prompts}
      assistantFallback={assistantFallback}
      trialLimit={TRIAL_LIMIT}
      // Rendered on the server so the counter is right on first paint instead
      // of only after the first answer comes back.
      initialTrialLeft={userId ? null : trialRemaining()}
    />
  );
}
