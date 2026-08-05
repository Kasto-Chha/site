import { getBlogPostsForSitemap } from "../../lib/supabase/queries";

export const dynamic = "force-dynamic";

const STATIC_PATHS = [
  "",
  "/trending",
  "/featured",
  "/battle",
  "/experience",
  "/chat",
  "/about",
  "/contact",
  "/guidelines"
];

function entry(loc, lastmod) {
  const lastmodTag = lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : "";
  return `<url><loc>${loc}</loc>${lastmodTag}</url>`;
}

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const posts = await getBlogPostsForSitemap();

  const urls = [
    ...STATIC_PATHS.map((path) => entry(`${siteUrl}${path}`)),
    ...posts.map((post) =>
      entry(`${siteUrl}/blog/${post.slug}`, post.updated_at || post.published_at)
    )
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" }
  });
}
