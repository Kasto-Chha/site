import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { clientIp } from "../../../../lib/clientIp";
import { checkRateLimit, retryAfterSeconds } from "../../../../lib/ratelimit";
import { BODY_LIMITS, readJsonBody } from "../../../../lib/requestBody";
import { CONTACT_MAX, DAILY_CAP_PER_BUSINESS, NOTE_MAX, cleanContact, cleanNote, createFeedback, notesInLastDay } from "../../../../lib/sync/feedback";
import { getMerchantBySlug } from "../../../../lib/sync/merchants";

// A private note, sent from a business's hub. Public, because a customer has no account, so it is guarded the
// way an open door has to be: limited per visitor address, capped per business per day, and it takes nothing
// but words. It records no address, no browser and no account: a note is its words, an optional way to
// reach the person, and which business it is for. The words are never put in a log.
const GENERIC_FAILURE = "Could not send your note. Please try again.";

export async function POST(request) {
  const limit = await checkRateLimit("note", clientIp(request));
  if (!limit.ok) {
    return NextResponse.json({ error: "You have sent several notes just now. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.reset)) } });
  }

  const parsed = await readJsonBody(request, BODY_LIMITS.small);
  if (parsed.response) return parsed.response;
  const { slug, note, contact, website } = parsed.data || {};

  // A field no person can see. A program that fills in every field fills in this one. It is told the note was
  // sent, and nothing is stored, so it learns nothing.
  if (typeof website === "string" && website.trim() !== "") return NextResponse.json({ ok: true }, { status: 201 });

  const merchant = await getMerchantBySlug(slug);
  if (!merchant) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  const message = cleanNote(note);
  if (!message) return NextResponse.json({ error: "Write your note first." }, { status: 400 });
  if (message.length > NOTE_MAX) return NextResponse.json({ error: `Your note can be at most ${NOTE_MAX.toLocaleString("en-US")} characters.` }, { status: 400 });
  const how = cleanContact(contact);
  if (how.length > CONTACT_MAX) return NextResponse.json({ error: `The way to reach you can be at most ${CONTACT_MAX} characters.` }, { status: 400 });

  const supabase = createServerSupabase();
  try {
    if ((await notesInLastDay(supabase, merchant.id)) >= DAILY_CAP_PER_BUSINESS) {
      return NextResponse.json({ error: "This business has had a lot of notes today. Please try again tomorrow." }, { status: 429 });
    }
    await createFeedback(supabase, { merchantId: merchant.id, message, contact: how });
  } catch (error) {
    // The code only, never the message: a database error can quote the row, and the row is a private note.
    console.error("Private note not saved, error code:", error?.code || "unknown");
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
