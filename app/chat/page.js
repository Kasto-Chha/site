import { auth } from "@clerk/nextjs/server";

import ChatClient from "./ChatClient";
import {
  getPopularTopics,
  getRecentChatQueries,
  getTrendingTopics,
  getUserChatQueries
} from "../../lib/supabase/queries";

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export default async function ChatPage() {
  const { userId } = await auth();

  const [trending, popular, recentQueries, historyQueries] = await Promise.all([
    getTrendingTopics(),
    getPopularTopics(),
    getRecentChatQueries(8),
    getUserChatQueries(userId, 8)
  ]);

  const recent = uniqueStrings(recentQueries.map((item) => item.query));
  const history = uniqueStrings(historyQueries.map((item) => item.query));
  const prompts = uniqueStrings([
    ...trending.map((topic) => topic.title),
    ...popular.map((topic) => topic.title)
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
  if (popular[0]) {
    fallbackCards.push({
      title: "All-time favorite",
      value: popular[0].title,
      sub: `${(popular[0].comments || 0).toLocaleString("en-US")} comments`
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
    />
  );
}
