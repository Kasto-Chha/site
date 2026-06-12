import { getBlogPosts } from "../../lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
	const posts = await getBlogPosts();

	return (
		<main className="section">
			<div className="container">
				<div className="page-head" style={{ marginBottom: 24 }}>
					<div>
						<div className="page-kicker">BLOG</div>
						<h1 className="page-title">KastoChha stories</h1>
						<p className="page-sub">Published community stories and analysis from the platform.</p>
					</div>
				</div>

				<div className="feed-list bento-grid">
					{posts.length === 0 ? (
						<div className="bento-card empty-card">
							<div className="tr-title">No published posts yet</div>
							<div className="tr-desc">Add published rows to blog_posts in Supabase to populate this page.</div>
						</div>
					) : (
						posts.map((post) => (
							<article className="bento-card" key={post.id}>
								<div className="tr-num">
									<span>{post.reading_time ? `${post.reading_time} min` : "Blog"}</span>
									<span>{post.author_name || "KastoChha"}</span>
								</div>
								<h2 className="tr-title">{post.title}</h2>
								<p className="tr-desc">{post.excerpt || post.seo_description || post.content.slice(0, 180)}</p>
								<div className="tr-footer">
									<span className="badge badge-neutral">{post.status}</span>
									{post.published_at ? <span>{new Date(post.published_at).toLocaleDateString("en-US")}</span> : null}
								</div>
								<a className="btn-outline" href={`/blog/${post.slug}`} style={{ marginTop: 16, display: "inline-flex" }}>
									Read story
								</a>
							</article>
						))
					)}
				</div>
			</div>
		</main>
	);
}
