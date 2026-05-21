import { IconBook, IconBriefcase, IconHome } from "../components/icons";

export default function FeaturedPage() {
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
              <div className="page-kicker">EDITOR PICK</div>
              <h1 className="page-title">Featured KastoChha</h1>
              <p className="page-sub">Curated stories with deep community insights.</p>
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
          <div className="feat-grid bento-grid">
            <div className="fc fc-main bento-card">
              <div className="fc-visual">
                <div className="fc-star">Editor Pick</div>
                <div className="fc-emoji"><IconBook className="icon" /></div>
              </div>
              <div className="fc-body">
                <span className="fc-why">Why featured - Deep community analysis</span>
                <div className="fc-title">Nepal ma MBA garnu worth chha? 200+ graduates ko opinions</div>
                <div className="fc-desc">Salary expectations, job market reality, college quality, ROI and campus culture.</div>
                <a href="#" className="fc-read">Read full story -&gt;</a>
              </div>
            </div>
            <div className="fc fc-b bento-card">
              <div className="fc-visual">
                <div className="fc-emoji"><IconHome className="icon" /></div>
              </div>
              <div className="fc-body">
                <span className="fc-why">Why featured - High impact for students</span>
                <div className="fc-title">Kathmandu hostel life kasto chha?</div>
                <div className="fc-desc">Safety, cost, food quality and commute realities.</div>
                <a href="#" className="fc-read">Read -&gt;</a>
              </div>
            </div>
            <div className="fc fc-c bento-card">
              <div className="fc-visual">
                <div className="fc-emoji"><IconBriefcase className="icon" /></div>
              </div>
              <div className="fc-body">
                <span className="fc-why">Why featured - Trending career topic</span>
                <div className="fc-title">Nepal ma freelancing - realistic income expectations</div>
                <div className="fc-desc">Toptal, Upwork, Fiverr bata Nepali freelancers ko journey.</div>
                <a href="#" className="fc-read">Read -&gt;</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
