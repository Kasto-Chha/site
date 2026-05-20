export default function BattlePage() {
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
              <div className="page-kicker">VOTE NOW</div>
              <h1 className="page-title">KastoChha Battle</h1>
              <p className="page-sub">Head to head debates where Nepal decides the winner.</p>
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
          <div className="battle-list bento-grid">
            <div className="battle-card bento-card">
              <div className="battle-inner">
                <div className="bside">
                  <div className="bs-cat">Ride Sharing</div>
                  <div className="bs-name">Pathao</div>
                  <div className="bs-desc">Established brand, wider coverage, loyalty points program.</div>
                  <div className="bs-vcnt">3,847 votes</div>
                </div>
                <div className="bvs">
                  <div className="bvs-line"></div>
                  <div className="bvs-badge">VS</div>
                  <div className="bvs-line"></div>
                </div>
                <div className="bside right">
                  <div className="bs-cat">Ride Sharing</div>
                  <div className="bs-name">InDrive</div>
                  <div className="bs-desc">Price negotiation, newer platform, cheaper rates overall.</div>
                  <div className="bs-vcnt">2,611 votes</div>
                </div>
              </div>
              <div className="battle-actions">
                <button type="button" className="b-vote-btn a">Pathao ramro chha</button>
                <div className="bvs-or">or</div>
                <button type="button" className="b-vote-btn b">InDrive ramro chha</button>
              </div>
              <div className="battle-result">
                <div className="result-wrap">
                  <span className="rpct a">60%</span>
                  <div className="rtrack">
                    <div className="rfill-a" style={{ width: "60%" }}></div>
                    <div className="rfill-b" style={{ width: "40%" }}></div>
                  </div>
                  <span className="rpct b">40%</span>
                </div>
                <div className="rtotal">6,458 total votes</div>
              </div>
            </div>

            <div className="battle-card bento-card">
              <div className="battle-inner">
                <div className="bside">
                  <div className="bs-cat">Digital Wallet</div>
                  <div className="bs-name">eSewa</div>
                  <div className="bs-desc">More merchants, trusted brand, QR pay everywhere in Nepal.</div>
                  <div className="bs-vcnt">5,102 votes</div>
                </div>
                <div className="bvs">
                  <div className="bvs-line"></div>
                  <div className="bvs-badge">VS</div>
                  <div className="bvs-line"></div>
                </div>
                <div className="bside right">
                  <div className="bs-cat">Digital Wallet</div>
                  <div className="bs-name">Khalti</div>
                  <div className="bs-desc">Better UI, faster transfers, growing merchant base.</div>
                  <div className="bs-vcnt">3,298 votes</div>
                </div>
              </div>
              <div className="battle-actions">
                <button type="button" className="b-vote-btn a">eSewa ramro chha</button>
                <div className="bvs-or">or</div>
                <button type="button" className="b-vote-btn b">Khalti ramro chha</button>
              </div>
              <div className="battle-result">
                <div className="result-wrap">
                  <span className="rpct a">61%</span>
                  <div className="rtrack">
                    <div className="rfill-a" style={{ width: "61%" }}></div>
                    <div className="rfill-b" style={{ width: "39%" }}></div>
                  </div>
                  <span className="rpct b">39%</span>
                </div>
                <div className="rtotal">8,400 total votes</div>
              </div>
            </div>

            <div className="battle-card bento-card">
              <div className="battle-inner">
                <div className="bside">
                  <div className="bs-cat">Education</div>
                  <div className="bs-name">+2 Science</div>
                  <div className="bs-desc">Medical, engineering path, high competition, job security.</div>
                  <div className="bs-vcnt">4,211 votes</div>
                </div>
                <div className="bvs">
                  <div className="bvs-line"></div>
                  <div className="bvs-badge">VS</div>
                  <div className="bvs-line"></div>
                </div>
                <div className="bside right">
                  <div className="bs-cat">Education</div>
                  <div className="bs-name">+2 Commerce</div>
                  <div className="bs-desc">BBA, banking, CA path, business opportunities, flexibility.</div>
                  <div className="bs-vcnt">3,189 votes</div>
                </div>
              </div>
              <div className="battle-actions">
                <button type="button" className="b-vote-btn a">Science ramro chha</button>
                <div className="bvs-or">or</div>
                <button type="button" className="b-vote-btn b">Commerce ramro chha</button>
              </div>
              <div className="battle-result">
                <div className="result-wrap">
                  <span className="rpct a">57%</span>
                  <div className="rtrack">
                    <div className="rfill-a" style={{ width: "57%" }}></div>
                    <div className="rfill-b" style={{ width: "43%" }}></div>
                  </div>
                  <span className="rpct b">43%</span>
                </div>
                <div className="rtotal">7,400 total votes</div>
              </div>
            </div>

            <div className="battle-card bento-card">
              <div className="battle-inner">
                <div className="bside">
                  <div className="bs-cat">Food Delivery</div>
                  <div className="bs-name">Foodmandu</div>
                  <div className="bs-desc">Wide coverage, reliable delivery times, better customer support.</div>
                  <div className="bs-vcnt">2,540 votes</div>
                </div>
                <div className="bvs">
                  <div className="bvs-line"></div>
                  <div className="bvs-badge">VS</div>
                  <div className="bvs-line"></div>
                </div>
                <div className="bside right">
                  <div className="bs-cat">Food Delivery</div>
                  <div className="bs-name">Bhoj</div>
                  <div className="bs-desc">Lower fees, fast delivery in core areas, growing options.</div>
                  <div className="bs-vcnt">1,984 votes</div>
                </div>
              </div>
              <div className="battle-actions">
                <button type="button" className="b-vote-btn a">Foodmandu ramro chha</button>
                <div className="bvs-or">or</div>
                <button type="button" className="b-vote-btn b">Bhoj ramro chha</button>
              </div>
              <div className="battle-result">
                <div className="result-wrap">
                  <span className="rpct a">56%</span>
                  <div className="rtrack">
                    <div className="rfill-a" style={{ width: "56%" }}></div>
                    <div className="rfill-b" style={{ width: "44%" }}></div>
                  </div>
                  <span className="rpct b">44%</span>
                </div>
                <div className="rtotal">4,524 total votes</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
