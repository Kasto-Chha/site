import { auth } from "@clerk/nextjs/server";

import ExperienceClient from "./ExperienceClient";

import {
  getRecentQuestions,
  getThreadPage,
  getUserVotes
} from "../../lib/supabase/queries";
import { breadcrumbSchema, jsonLd } from "../../lib/seo/schema";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Matches the API route, so the offsets line up.
const PAGE_SIZE = 30;

function pageNumber(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  // Bounded so a crafted ?page= cannot ask for an unreasonable offset.
  return Math.min(parsed, 200);
}

// ---------------------------------------------------------------------------
// Paging is a real URL, not just a button.
//
// The button alone was enough for people but not for crawlers: Googlebot
// renders JavaScript and does not click things, so threads past the first page
// were reachable only through the sitemap. That works — until the sitemap
// isn't read, which on this domain has happened for months at a time.
//
// So ?page=2 is a genuine page: server-rendered, its own canonical, and linked
// with a real <a>. Crawlers follow the link; people still get the button, which
// loads the next batch in place without a reload. Neither depends on the other.
// ---------------------------------------------------------------------------

export async function generateMetadata({ searchParams }) {
  const page = pageNumber(searchParams?.page);
  const suffix = page > 1 ? ` — page ${page}` : "";

  return {
    title: `Discussions${suffix} - Real Nepali Experiences on Everything | KastoChha`,
    description:
      "What Nepalis actually think. Ask a kasto chha, share your own experience, and read honest opinions on products, services and places across Nepal.",
    // Each page canonicals to itself. Pointing page 2 at page 1 would tell
    // Google the threads on it are duplicates of threads it has never seen.
    alternates: { canonical: page > 1 ? `/discussions?page=${page}` : "/discussions" },
    // Page 2 onward exists to be crawled through, not to rank: the threads are
    // the destination, and a numbered slice of a list is thin by itself.
    robots: page > 1 ? { index: false, follow: true } : undefined
  };
}

export default async function DiscussionsPage({ searchParams }) {
  const page = pageNumber(searchParams?.page);
  const offset = (page - 1) * PAGE_SIZE;

  const { userId } = await auth();
  const [threadPage, myVotes, questions] = await Promise.all([
    // Whole threads, so counts are never understated by a row window. Rendered
    // on the server: the list needs to be in the HTML for crawlers and for
    // anyone whose JavaScript does not run.
    getThreadPage({ offset, limit: PAGE_SIZE }),
    getUserVotes(userId, "review"),
    getRecentQuestions(6)
  ]);

  const breadcrumbTrail = [{ name: "Discussions", path: "/discussions" }];
  if (page > 1) {
    breadcrumbTrail.push({ name: `Page ${page}`, path: `/discussions?page=${page}` });
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(siteUrl, breadcrumbTrail)) }}
      />
      <ExperienceClient
        reviews={threadPage.rows}
        hasMore={threadPage.hasMore}
        nextOffset={offset + PAGE_SIZE}
        page={page}
        pageSize={PAGE_SIZE}
        myVotes={myVotes}
        questions={questions}
      />
    </>
  );
}
