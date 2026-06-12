import TrendingClient from "./TrendingClient";

import { getTrendingTopics } from "../../lib/supabase/queries";

export default async function TrendingPage() {
  const topics = await getTrendingTopics();
  return <TrendingClient topics={topics} />;
}
