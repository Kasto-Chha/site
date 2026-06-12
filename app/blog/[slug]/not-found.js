export default function BlogNotFound() {
  return (
    <div className="blog-empty">
      <h2>Post not found</h2>
      <p>That story is not published yet or has been removed.</p>
      <a className="btn-outline" href="/blog">Back to blog</a>
    </div>
  );
}
