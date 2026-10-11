export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // The share images are served from /api/og. Link-preview bots (Reddit, X, LinkedIn...)
  // may obey robots.txt, so that one path must stay open while the rest of /api is
  // closed. Allow comes first and is the longer match, so every parser reads it right.
  const body = `User-agent: *
Allow: /
Allow: /api/og
Disallow: /admin
Disallow: /api
Sitemap: ${siteUrl}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain"
    }
  });
}

// To Do function to generate sitemap.xml for better SEO and indexing by search engines.