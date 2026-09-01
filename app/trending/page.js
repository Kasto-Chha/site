import { auth } from "@clerk/nextjs/server";

import TrendingClient from "./TrendingClient";

import { getTrendingTopics, getUserVotes } from "../../lib/supabase/queries";
// The section index is indexable; the individual topics are not (see
// trending/[id]/page.js). A topic lives two or three days and is a rotating
// vote widget — nothing a crawler should spend budget on. This page is
// different: it is a stable landing page for the section, and someone
// searching "kastochha trending" should be able to find it.
//
// The topics it links to keep "follow", so link equity still flows through
// to the discussions underneath them.
export const metadata = {
  title: "KastoChha Trending - What Nepal is Talking About Right Now",
  description:
    "Vote on hot topics, debates, and questions Nepal is talking about, and see where Nepalis stand, updated live as more people vote.",
  alternates: { canonical: "/trending" }
};

export default async function TrendingPage() {
  const { userId } = await auth();
  const [topics, myVotes] = await Promise.all([
    getTrendingTopics(),
    getUserVotes(userId, "trending")
  ]);
  return <TrendingClient topics={topics} myVotes={myVotes} />;
}
