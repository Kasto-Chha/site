import { auth } from "@clerk/nextjs/server";

import HomeClient from "./HomeClient";

import { getHomeData } from "../lib/supabase/queries";

export default async function Page() {
  // The user's existing votes ship with the page so the poll and battle cards
  // render in their already-voted state instead of resetting on every reload.
  const { userId } = await auth();
  const data = await getHomeData(userId);
  return <HomeClient {...data} />;
}
