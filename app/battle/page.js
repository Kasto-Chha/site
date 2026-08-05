import { auth } from "@clerk/nextjs/server";

import BattleClient from "./BattleClient";

import { getBattles, getUserVotes } from "../../lib/supabase/queries";

export default async function BattlePage() {
  const { userId } = await auth();
  const [battles, myVotes] = await Promise.all([
    getBattles(),
    getUserVotes(userId, "battle")
  ]);
  return <BattleClient battles={battles} myVotes={myVotes} />;
}
