export default function PopularPage() {
  return (
    <>
      <nav id="mainnav">
        <a href="/" className="logo">
          Kasto<em>Chha</em>
        </a>
        <div className="nav-links">
          <a href="/trending" className="nav-link">Trending</a>
          <a href="/popular" className="nav-link">Popular</a>
          <a href="/featured" className="nav-link">Featured</a>
          <a href="/battle" className="nav-link">Battle</a>
          <a href="/experience" className="nav-link">Experience</a>
        </div>
        <div className="nav-actions">
          <a className="btn-outline" href="/chat">Ask AI</a>
          <a className="btn-red" href="/experience">Share Review</a>
        </div>
      </nav>

      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">ALL TIME</div>
              <h1 className="page-title">Popular KastoChha</h1>
              <p className="page-sub">Most engaged topics of all time, ranked by community activity.</p>
            </div>
            <div className="page-actions">
              <a className="btn-outline" href="/chat">Ask AI</a>
              <a className="btn-red" href="/experience">Share Review</a>
            </div>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="pop-grid bento-grid">
            <div className="pop-card bento-card">
              <div className="pop-rank hot">01</div>
              <div className="pop-body">
                <div className="pop-cat">Technology</div>
                <div className="pop-title">Daraz Nepal delivery experience kasto chha?</div>
                <div className="pop-stats">
                  <span className="pop-stat">3.1k likes</span>
                  <span className="pop-stat">847 comments</span>
                  <span className="pop-stat" style={{ color: "var(--green)" }}>78% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card">
              <div className="pop-rank hot">02</div>
              <div className="pop-body">
                <div className="pop-cat">Finance</div>
                <div className="pop-title">eSewa vs Khalti - kun wallet better chha?</div>
                <div className="pop-stats">
                  <span className="pop-stat">2.8k likes</span>
                  <span className="pop-stat">612 comments</span>
                  <span className="pop-stat" style={{ color: "var(--green)" }}>65% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card">
              <div className="pop-rank hot">03</div>
              <div className="pop-body">
                <div className="pop-cat">Lifestyle</div>
                <div className="pop-title">Kathmandu food delivery - Foodmandu vs Bhoj?</div>
                <div className="pop-stats">
                  <span className="pop-stat">2.2k likes</span>
                  <span className="pop-stat">498 comments</span>
                  <span className="pop-stat" style={{ color: "var(--green)" }}>58% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card">
              <div className="pop-rank">04</div>
              <div className="pop-body">
                <div className="pop-cat">Education</div>
                <div className="pop-title">Tribhuvan University education quality kasto chha?</div>
                <div className="pop-stats">
                  <span className="pop-stat">1.9k likes</span>
                  <span className="pop-stat">441 comments</span>
                  <span className="pop-stat" style={{ color: "var(--gold)" }}>44% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card">
              <div className="pop-rank">05</div>
              <div className="pop-body">
                <div className="pop-cat">Career</div>
                <div className="pop-title">Nepal Civil Service preparation worth chha?</div>
                <div className="pop-stats">
                  <span className="pop-stat">1.7k likes</span>
                  <span className="pop-stat">389 comments</span>
                  <span className="pop-stat" style={{ color: "var(--gold)" }}>37% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card">
              <div className="pop-rank">06</div>
              <div className="pop-body">
                <div className="pop-cat">Housing</div>
                <div className="pop-title">Bhaktapur vs Lalitpur - kun place better for living?</div>
                <div className="pop-stats">
                  <span className="pop-stat">1.4k likes</span>
                  <span className="pop-stat">312 comments</span>
                  <span className="pop-stat" style={{ color: "var(--muted2)" }}>Stable</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card">
              <div className="pop-rank">07</div>
              <div className="pop-body">
                <div className="pop-cat">Health</div>
                <div className="pop-title">Private hospital service in Kathmandu kasto chha?</div>
                <div className="pop-stats">
                  <span className="pop-stat">1.2k likes</span>
                  <span className="pop-stat">266 comments</span>
                  <span className="pop-stat" style={{ color: "var(--gold)" }}>41% positive</span>
                </div>
              </div>
            </div>
            <div className="pop-card bento-card">
              <div className="pop-rank">08</div>
              <div className="pop-body">
                <div className="pop-cat">Travel</div>
                <div className="pop-title">Pokhara weekend trip budget and stay reviews</div>
                <div className="pop-stats">
                  <span className="pop-stat">1.1k likes</span>
                  <span className="pop-stat">248 comments</span>
                  <span className="pop-stat" style={{ color: "var(--green)" }}>64% positive</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
