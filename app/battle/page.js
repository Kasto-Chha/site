import { auth } from "@clerk/nextjs/server";

import BattleClient from "./BattleClient";

import { getBattles, getUserVotes } from "../../lib/supabase/queries";
// Same split as /trending: this index page is indexable, individual battles
// are not. A battle is short-lived and vote-driven; the evergreen version of
// one ("Yango vs InDrive") belongs in Featured as a researched article, which
// is the format those queries actually reward.
export const metadata = {
  title: "KastoChha Battle - Vote Nepal's Biggest Debates",
  description:
    "Cast your vote, see what Nepalis think, and join head-to-head battles on products, brands, and more. Two sides, one winner, decided by real votes.",
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
