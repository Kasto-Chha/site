import { auth } from "@clerk/nextjs/server";

import ChatClient from "./ChatClient";
import { TRIAL_LIMIT, trialRemaining } from "../../lib/chatTrial";
import { QUOTA_WARN_AT, checkChatQuota } from "../../lib/chatQuota";
import { createServerSupabase } from "../../lib/supabase/server";
import { getUserRole, hasRole, ROLE } from "../../lib/auth/roles";
import {
  getRecentChatTopics,
  getRecentQuestions,
  getReviews,
  getTrendingTopics,
  getUserChatTopics
} from "../../lib/supabase/queries";

export const dynamic = "force-dynamic";

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

// Questions left today, so someone returning to a spent quota is told before
// they type rather than after they send. The role lookup costs a Clerk call, so
// it only runs when the number is low enough to be shown — admins are exempt
// from the quota and should never see the warning.
async function chatQuotaLeft(userId) {
  if (!userId) return null;

  const quota = await checkChatQuota(createServerSupabase(), userId);
  if (quota.remaining === null || quota.remaining > QUOTA_WARN_AT) return null;

  const isAdmin = hasRole(await getUserRole(userId), ROLE.ADMIN);
  return isAdmin ? null : quota.remaining;
}

export default async function ChatPage() {
  const { userId } = await auth();

  const [trending, reviews, recentTopics, questions, userTopics, dailyLeft] =
    await Promise.all([
      getTrendingTopics(),
      getReviews(8),
      getRecentChatTopics(8),
      getRecentQuestions(6),
      getUserChatTopics(userId, 40),
      chatQuotaLeft(userId)
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
  // Questions people actually posted lead the rail — the whole point of "Ask a
  // KastoChha" is that someone else sees the question — with trending polls and
  // recent experiences filling the rest out.
  const prompts = uniqueStrings([
    ...questions.map((item) => item.question),
    ...trending.map((topic) => topic.title),
    ...reviews.map((review) => review.topic || review.title)
  ]).slice(0, 6);

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
      // auth() has already run here, so the first paint can show the signed-in
      // sidebar instead of waiting for Clerk to hydrate on the client.
      initialSignedIn={Boolean(userId)}
      trialLimit={TRIAL_LIMIT}
      // Rendered on the server so the counters are right on first paint instead
      // of only after the first answer comes back.
      initialTrialLeft={userId ? null : trialRemaining()}
      initialDailyLeft={dailyLeft}
      quotaWarnAt={QUOTA_WARN_AT}
    />
  );
}
