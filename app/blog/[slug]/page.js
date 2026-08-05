import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import BlogComments from "../BlogComments";
import SiteNav from "../../components/SiteNav";
import { getBlogComments, getBlogPostBySlug } from "../../../lib/supabase/queries";
import { getUserRole, hasRole, ROLE } from "../../../lib/auth/roles";
import { sanitizeRichText } from "../../../lib/sanitize";

export const dynamic = "force-dynamic";

function initialsFromName(name) {
	if (!name) return "KC";
	const parts = name.trim().split(/\s+/).slice(0, 2);
	return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "KC";
}

export default async function BlogPostPage({ params }) {
	const post = await getBlogPostBySlug(params.slug);

	if (!post) {
		notFound();
	}

	// Work out who may edit/delete each comment here rather than shipping every
	// commenter's Clerk id to the browser for the client to compare. The API
	// re-checks ownership on every write; these flags only decide what shows.
	const { userId } = await auth();
	const isAdmin = userId ? hasRole(await getUserRole(userId), ROLE.ADMIN) : false;
	const rawComments = await getBlogComments(post.id);
	const comments = rawComments.map(({ author_user_id: authorId, ...comment }) => {
		const isAuthor = Boolean(userId) && authorId === userId;
		return { ...comment, canEdit: isAuthor, canDelete: isAuthor || isAdmin };
	});

	const published = post.published_at || post.created_at;
	const dateLabel = published
		? new Date(published).toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric"
		  })
		: "";
	const readingLabel = post.reading_time ? `${post.reading_time} min read` : "";
	const metaLine = [dateLabel, readingLabel].filter(Boolean).join("  ·  ");
	const lede = post.excerpt || post.seo_description;

	return (
		<>
			<SiteNav />
			<main className="blog-main">
				<div className="blog-shell">
					<article className="blog-article">
						<header className="blog-head">
							<div className="blog-kicker">Blog</div>
							<h1 className="blog-title">{post.title}</h1>
							{lede ? <p className="blog-lede">{lede}</p> : null}
							<div className="blog-byline">
								<div className="blog-avatar">{initialsFromName(post.author_name)}</div>
								<div className="blog-byline-meta">
									<span className="blog-author">{post.author_name || "KastoChha"}</span>
									{metaLine ? <span className="blog-byline-sub">{metaLine}</span> : null}
								</div>
							</div>
						</header>

						{post.cover_image_url ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img className="blog-cover" src={post.cover_image_url} alt={post.title} />
						) : null}

						<div
							className="blog-content"
							// Content is sanitized on write and again here, so any HTML
							// stored before sanitization existed is also rendered safely.
							dangerouslySetInnerHTML={{ __html: sanitizeRichText(post.content) }}
						/>
					</article>

					<BlogComments postId={post.id} initialComments={comments} />
				</div>
			</main>
		</>
	);
}
