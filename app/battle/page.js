import { auth } from "@clerk/nextjs/server";

import BattleClient from "./BattleClient";

import { getBattles, getUserVotes } from "../../lib/supabase/queries";
// Same split as /trending: this index page is indexable, individual battles
// are not. A battle is short-lived and vote-driven; the evergreen version of
// one ("Yango vs InDrive") belongs in Featured as a researched article, which
// is the format those queries actually reward.
export const metadata = {
  title: "KastoChha Battle - Nepal Votes, Head to Head | KastoChha",
  description:
    "Two options, one winner, decided by Nepal. Vote on the match-ups everyone is arguing about this week.",
  alternates: { canonical: "/battle" }
};

export default async function BattlePage() {
  const { userId } = await auth();
  const [battles, myVotes] = await Promise.all([
    getBattles(),
    getUserVotes(userId, "battle")
  ]);
  return <BattleClient battles={battles} myVotes={myVotes} />;
}
