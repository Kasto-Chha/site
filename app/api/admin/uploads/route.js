import { NextResponse } from "next/server";

import { createServerSupabase } from "../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../lib/auth/roles";

export async function POST(request) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  const bucket = "blog-covers";
  const fileName = `${Date.now()}-${file.name}`;
  const supabase = createServerSupabase();

  const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
    upsert: true,
    contentType: file.type
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return NextResponse.json({ url: data.publicUrl });
}
