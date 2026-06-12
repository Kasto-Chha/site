import HomeClient from "./HomeClient";

import { getHomeData } from "../lib/supabase/queries";

export default async function Page() {
  const data = await getHomeData();
  return <HomeClient {...data} />;
}
