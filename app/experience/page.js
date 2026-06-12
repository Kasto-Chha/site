import ExperienceClient from "./ExperienceClient";

import { getReviews } from "../../lib/supabase/queries";

export default async function ExperiencePage() {
  const reviews = await getReviews();
  return <ExperienceClient reviews={reviews} />;
}
