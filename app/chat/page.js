import { auth } from "@clerk/nextjs/server";

import ChatClient from "./ChatClient";
import { TRIAL_LIMIT, trialRemaining } from "../../lib/chatTrial";
import {
  getRecentChatQueries,
  getReviews,
  getTrendingTopics,
  getUserChatQueries
} from "../../lib/supabase/queries";

export const dynamic = "force-dynamic";

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export default async function ChatPage() {
  const { userId } = await auth();

  const [trending, reviews, recentQueries, historyQueries] = await Promise.all([
    getTrendingTopics(),
    getReviews(8),
    getRecentChatQueries(8),
    getUserChatQueries(userId, 30)
  ]);

  const recent = uniqueStrings(recentQueries.map((item) => item.query));
  // Full rows (id + query + created_at) so the client can delete/organize them.
  const history = historyQueries
    .filter((item) => item?.id && item?.query)
    .map((item) => ({ id: item.id, query: item.query, created_at: item.created_at }));
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
      history={history}
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
