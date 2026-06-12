import BattleClient from "./BattleClient";

import { getBattles } from "../../lib/supabase/queries";

export default async function BattlePage() {
  const battles = await getBattles();
  return <BattleClient battles={battles} />;
}
