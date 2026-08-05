import { auth } from "@clerk/nextjs/server";

import ExperienceClient from "./ExperienceClient";

import { getReviews, getUserVotes } from "../../lib/supabase/queries";

export default async function ExperiencePage() {
  const { userId } = await auth();
  const [reviews, myVotes] = await Promise.all([
    getReviews(),
    getUserVotes(userId, "review")
  ]);
  return <ExperienceClient reviews={reviews} myVotes={myVotes} />;
}
