import { auth } from "@clerk/nextjs/server";

import TrendingClient from "./TrendingClient";

import { getTrendingTopics, getUserVotes } from "../../lib/supabase/queries";

export default async function TrendingPage() {
  const { userId } = await auth();
  const [topics, myVotes] = await Promise.all([
    getTrendingTopics(),
    getUserVotes(userId, "trending")
  ]);
  return <TrendingClient topics={topics} myVotes={myVotes} />;
}
