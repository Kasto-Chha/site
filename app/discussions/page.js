import { auth } from "@clerk/nextjs/server";

import ExperienceClient from "./ExperienceClient";

import {
  getRecentQuestions,
  getReviews,
  getUserVotes
} from "../../lib/supabase/queries";
import { breadcrumbSchema, jsonLd } from "../../lib/seo/schema";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Every hub page used to inherit the root layout's title and description
// unchanged, so /, /trending, /battle and /discussions were byte-for-byte
// identical in search results — four pages competing as the same page.
export const metadata = {
  title: "Discussions - Real Nepali Experiences on Everything | KastoChha",
  description:
    "What Nepalis actually think. Ask a kasto chha, share your own experience, and read honest opinions on products, services and places across Nepal.",
  alternates: { canonical: "/discussions" }
};

export default async function DiscussionsPage() {
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
