import { auth } from "@clerk/nextjs/server";

import ExperienceClient from "./ExperienceClient";

import {
  getRecentQuestions,
  getReviews,
  getUserVotes
} from "../../lib/supabase/queries";

export default async function ExperiencePage() {
  const { userId } = await auth();
  const [reviews, myVotes, questions] = await Promise.all([
    getReviews(),
    getUserVotes(userId, "review"),
    getRecentQuestions(6)
  ]);
  return (
    <ExperienceClient reviews={reviews} myVotes={myVotes} questions={questions} />
  );
}
