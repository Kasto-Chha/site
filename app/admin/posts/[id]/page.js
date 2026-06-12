import { notFound } from "next/navigation";

import AdminPostEditor from "../AdminPostEditor";
import { requireRole, ROLE } from "../../../../lib/auth/roles";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const metadata = {
  title: "Edit Post - KastoChha"
};

async function getPostWithRelations(postId) {
  const supabase = createServerSupabase();

  const { data: post } = await supabase.from("blog_posts").select("*").eq("id", postId).single();
  if (!post) return null;

  const { data: tagLinks } = await supabase
    .from("blog_post_tags")
    .select("blog_tags(name)")
    .eq("post_id", postId);

  const { data: categoryLinks } = await supabase
    .from("blog_post_categories")
    .select("blog_categories(name)")
    .eq("post_id", postId);

  const tags = (tagLinks || [])
    .map((row) => row.blog_tags?.name)
    .filter(Boolean);
  const categories = (categoryLinks || [])
    .map((row) => row.blog_categories?.name)
    .filter(Boolean);

  return { ...post, tags, categories };
}

export default async function AdminPostEditPage({ params }) {
  const authResult = await requireRole(ROLE.ADMIN);
  if (!authResult.ok) {
    return (
      <div className="admin-page">
        <h1>Admin access required</h1>
        <p>You need admin access to view this page.</p>
        <a className="btn-outline" href="/sign-in">Sign in</a>
      </div>
    );
  }

  const post = await getPostWithRelations(params.id);
  if (!post) notFound();

  return <AdminPostEditor mode="edit" initialPost={post} />;
}
