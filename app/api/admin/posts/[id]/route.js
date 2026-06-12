import { NextResponse } from "next/server";
import slugify from "slugify";

import { createServerSupabase } from "../../../../../lib/supabase/server";
import { requireRole, ROLE } from "../../../../../lib/auth/roles";

function makeSlug(value) {
  return slugify(value, { lower: true, strict: true, trim: true });
}

async function upsertTags(supabase, names = []) {
  const tags = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const slug = makeSlug(trimmed);
    const { data } = await supabase
      .from("blog_tags")
      .upsert({ name: trimmed, slug }, { onConflict: "slug" })
      .select()
      .single();
    if (data) tags.push(data);
  }
  return tags;
}

async function upsertCategories(supabase, names = []) {
  const categories = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const slug = makeSlug(trimmed);
    const { data } = await supabase
      .from("blog_categories")
      .upsert({ name: trimmed, slug }, { onConflict: "slug" })
      .select()
      .single();
    if (data) categories.push(data);
  }
  return categories;
}

async function setPostRelations(supabase, postId, tags, categories) {
  await supabase.from("blog_post_tags").delete().eq("post_id", postId);
  await supabase.from("blog_post_categories").delete().eq("post_id", postId);

  if (tags.length > 0) {
    await supabase.from("blog_post_tags").insert(
      tags.map((tag) => ({ post_id: postId, tag_id: tag.id }))
    );
  }

  if (categories.length > 0) {
    await supabase.from("blog_post_categories").insert(
      categories.map((category) => ({ post_id: postId, category_id: category.id }))
    );
  }
}

export async function PATCH(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }

  const payload = await request.json().catch(() => ({}));
  const title = (payload.title || "").toString().trim();
  const excerpt = (payload.excerpt || "").toString().trim();
  const content = (payload.content || "").toString().trim();
  const status = (payload.status || "draft").toString();
  const coverImageUrl = (payload.coverImageUrl || "").toString().trim();
  const seoTitle = (payload.seoTitle || "").toString().trim();
  const seoDescription = (payload.seoDescription || "").toString().trim();
  const seoImageUrl = (payload.seoImageUrl || "").toString().trim();
  const readingTime = Number(payload.readingTime || 0) || null;
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  const categories = Array.isArray(payload.categories) ? payload.categories : [];

  const supabase = createServerSupabase();
  const slug = payload.slug ? makeSlug(payload.slug) : undefined;

  const { data, error } = await supabase
    .from("blog_posts")
    .update({
      title: title || undefined,
      excerpt: excerpt || null,
      content: content || undefined,
      status,
      slug: slug || undefined,
      cover_image_url: coverImageUrl || null,
      seo_title: seoTitle || null,
      seo_description: seoDescription || null,
      seo_image_url: seoImageUrl || null,
      reading_time: readingTime,
      published_at: status === "published" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tagRows = await upsertTags(supabase, tags);
  const categoryRows = await upsertCategories(supabase, categories);
  await setPostRelations(supabase, data.id, tagRows, categoryRows);

  return NextResponse.json({ post: data });
}

export async function DELETE(request, { params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authResult.status });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("blog_posts").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
