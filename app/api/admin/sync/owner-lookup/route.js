import { NextResponse } from "next/server";

import { requireRole, ROLE } from "../../../../../lib/auth/roles";
import { describeClerkUser, findClerkUsersByEmail } from "../../../../../lib/auth/clerk";
import { BODY_LIMITS, readJsonBody } from "../../../../../lib/requestBody";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Step one of linking an owner: find the account by email, and show the team who it is, so they can be sure
// before anything is changed. Nothing is written here. Admin only.
export async function POST(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const raw = parsed.data?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter the owner's email address." }, { status: 400 });

  let users;
  try {
    users = await findClerkUsersByEmail(email);
  } catch (error) {
    console.error("owner lookup failed:", error?.message || error);
    return NextResponse.json({ error: "Could not reach the sign-in service. Try again in a moment." }, { status: 502 });
  }
  if (users.length === 0) return NextResponse.json({ error: "No KastoChha account uses that email. Ask the owner to sign up with it first." }, { status: 404 });
  if (users.length > 1) return NextResponse.json({ error: "More than one account matches that email. Link by hand." }, { status: 409 });
  return NextResponse.json({ user: describeClerkUser(users[0]) });
}
