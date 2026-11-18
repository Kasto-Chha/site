import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabase } from "./../supabase/server";
import { checkRateLimit, retryAfterSeconds } from "./../ratelimit";
import { getOwnedBusiness } from "./owner";
import { readStage } from "./stageStore";
import { stageInfo } from "./stage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FREE = "Your business is on the Free plan, so nothing is waiting for you here.";

// The door for every owner action: someone is signed in, they are not going too fast, the business is theirs (a business that is not
// theirs looks like one that does not exist), and it is not on the Free plan. A stage that cannot be read never blocks.
export async function ownerGate(params) {
  const { userId } = await auth();
  if (!userId) return { response: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const limit = await checkRateLimit("write", userId);
  if (!limit.ok) return { response: NextResponse.json({ error: "You are going too fast. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) } }) };
  if (!UUID_RE.test(params?.id || "")) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  const supabase = createServerSupabase();
  let merchant;
  try {
    merchant = await getOwnedBusiness(supabase, userId, params.id);
  } catch (error) {
    console.error("Owner gate failed:", error?.message || error);
    return { response: NextResponse.json({ error: "Could not load your business." }, { status: 500 }) };
  }
  if (!merchant) return { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  try {
    const info = stageInfo(await readStage(supabase, merchant.id));
    if (info.known && info.stage === "free") return { response: NextResponse.json({ error: FREE }, { status: 409 }) };
  } catch {
    // Not blocked by a failed read.
  }
  return { userId, supabase, merchant };
}
