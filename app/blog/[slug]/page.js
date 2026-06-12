import { notFound } from "next/navigation";

import BlogComments from "../BlogComments";
import { getBlogComments, getBlogPostBySlug } from "../../../lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function BlogPostPage({ params }) {
	const post = await getBlogPostBySlug(params.slug);

	if (!post) {
		notFound();
	}

	const comments = await getBlogComments(post.id);

	return (
		<main className="section">
			<div className="container">
				<article className="bento-card">
					<div className="tr-num">
						<span>{post.author_name || "KastoChha"}</span>
						<span>{post.reading_time ? `${post.reading_time} min read` : "Blog post"}</span>
					</div>
					<h1 className="page-title" style={{ marginTop: 12 }}>{post.title}</h1>
					<p className="page-sub">{post.excerpt || post.seo_description}</p>
					<div className="tr-desc" style={{ whiteSpace: "pre-wrap", marginTop: 24 }}>
						{post.content}
					</div>
				</article>

				<BlogComments postId={post.id} initialComments={comments} />
			</div>
		</main>
	);
}
