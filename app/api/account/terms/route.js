import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getClerkClient, getClerkUser } from "../../../../lib/auth/clerk";
import { TERMS_VERSION, hasAcceptedTerms } from "../../../../lib/terms";
import { checkRateLimit, retryAfterSeconds } from "../../../../lib/ratelimit";

// Records that the signed-in user accepted the current terms. The acceptance
// lives in Clerk publicMetadata so it travels with the account and is readable
// from both the server and the client gate.
export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("write", userId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.reset)) } }
    );
  }

  // The box has to actually be ticked. Consent is never inferred from the
  // request simply having been sent.
  const payload = await request.json().catch(() => ({}));
  if (payload.accepted !== true) {
    return NextResponse.json(
      { error: "Please tick the box to continue." },
      { status: 400 }
    );
  }

  try {
    const user = await getClerkUser(userId);
    const existing = user?.publicMetadata || {};

    // Already on the current version — nothing to write.
    if (hasAcceptedTerms(existing)) {
      return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION });
    }

    const client = await getClerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        // Spread first: publicMetadata also carries `role`, which the admin
        // gate reads. Dropping it would lock admins out of /admin.
        ...existing,
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: TERMS_VERSION
      }
    });

    return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION });
  } catch (error) {
    console.error("terms acceptance failed:", error?.message || error);
    return NextResponse.json(
      { error: "Could not save your acceptance. Please try again." },
      { status: 500 }
    );
  }
}
