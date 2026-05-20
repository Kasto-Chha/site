export default function TrendingPage() {
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
              <div className="page-kicker">LIVE SIGNALS</div>
              <h1 className="page-title">Trending KastoChha</h1>
              <p className="page-sub">Real-time topics and spikes across Nepal.</p>
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
          <div className="feed-list bento-grid">
            <div className="tr-card bento-card">
              <div className="tr-rank">01</div>
              <div className="tr-num">
                <span>01</span>
                <span>TECHNOLOGY</span>
                <span className="growth">up 48% today</span>
              </div>
              <div className="tr-title">iPhone 17 Nepal ma kasto chha?</div>
              <div className="tr-desc">Price, camera quality, battery life and warranty choices from real buyers.</div>
              <div className="tr-footer">
                <span className="badge badge-red">Hot</span>
                <span className="badge badge-neutral">Technology</span>
                <div className="tr-meta"><span>1,247 likes</span><span>384 comments</span><span>2h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes">Ramro <span className="vcnt">812</span></button>
                <button type="button" className="vbtn no">Naramro <span className="vcnt">435</span></button>
                <span className="vote-total">1,247 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" style={{ width: "65%" }}></div></div>
            </div>

            <div className="tr-card bento-card">
              <div className="tr-rank">02</div>
              <div className="tr-num">
                <span>02</span>
                <span>CAREER</span>
                <span className="growth">up 31% today</span>
              </div>
              <div className="tr-title">Pathao delivery job kasto chha?</div>
              <div className="tr-desc">Income ranges, fuel costs, insurance and daily realities from riders.</div>
              <div className="tr-footer">
                <span className="badge badge-gold">Rising</span>
                <span className="badge badge-neutral">Career</span>
                <div className="tr-meta"><span>934 likes</span><span>211 comments</span><span>5h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes">Ramro <span className="vcnt">556</span></button>
                <button type="button" className="vbtn no">Naramro <span className="vcnt">378</span></button>
                <span className="vote-total">934 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" style={{ width: "60%" }}></div></div>
            </div>

            <div className="tr-card bento-card">
              <div className="tr-rank">03</div>
              <div className="tr-num">
                <span>03</span>
                <span>EDUCATION</span>
                <span className="growth">up 22% today</span>
              </div>
              <div className="tr-title">+2 Science liye pachi k garne best?</div>
              <div className="tr-desc">Engineering, MBBS, IT or banking - community advice from seniors.</div>
              <div className="tr-footer">
                <span className="badge badge-green">Trending</span>
                <span className="badge badge-neutral">Education</span>
                <div className="tr-meta"><span>678 likes</span><span>167 comments</span><span>8h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes">Ramro <span className="vcnt">430</span></button>
                <button type="button" className="vbtn no">Naramro <span className="vcnt">248</span></button>
                <span className="vote-total">678 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" style={{ width: "63%" }}></div></div>
            </div>

            <div className="tr-card bento-card">
              <div className="tr-rank">04</div>
              <div className="tr-num">
                <span>04</span>
                <span>HOUSING</span>
                <span className="growth down">down 5% today</span>
              </div>
              <div className="tr-title">Kathmandu ma kotha bhaada kati appropriate chha?</div>
              <div className="tr-desc">Rent hikes, landlord behavior and location value across the valley.</div>
              <div className="tr-footer">
                <span className="badge badge-neutral">Housing</span>
                <div className="tr-meta"><span>521 likes</span><span>142 comments</span><span>12h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes">Theek chha <span className="vcnt">295</span></button>
                <button type="button" className="vbtn no">Mahango <span className="vcnt">226</span></button>
                <span className="vote-total">521 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" style={{ width: "57%" }}></div></div>
            </div>

            <div className="tr-card bento-card">
              <div className="tr-rank">05</div>
              <div className="tr-num">
                <span>05</span>
                <span>COMMERCE</span>
                <span className="growth">up 18% today</span>
              </div>
              <div className="tr-title">Daraz Nepal delivery experience kasto chha?</div>
              <div className="tr-desc">Delivery speed, product quality and return issues from shoppers.</div>
              <div className="tr-footer">
                <span className="badge badge-gold">Rising</span>
                <span className="badge badge-neutral">Commerce</span>
                <div className="tr-meta"><span>582 likes</span><span>146 comments</span><span>13h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes">Ramro <span className="vcnt">401</span></button>
                <button type="button" className="vbtn no">Naramro <span className="vcnt">181</span></button>
                <span className="vote-total">582 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" style={{ width: "69%" }}></div></div>
            </div>

            <div className="tr-card bento-card">
              <div className="tr-rank">06</div>
              <div className="tr-num">
                <span>06</span>
                <span>FINANCE</span>
                <span className="growth">up 12% today</span>
              </div>
              <div className="tr-title">eSewa vs Khalti - kun wallet better chha?</div>
              <div className="tr-desc">Fees, offers, cashbacks and reliability across different banks.</div>
              <div className="tr-footer">
                <span className="badge badge-neutral">Finance</span>
                <div className="tr-meta"><span>466 likes</span><span>129 comments</span><span>18h ago</span></div>
              </div>
              <div className="vote-row">
                <button type="button" className="vbtn yes">eSewa <span className="vcnt">251</span></button>
                <button type="button" className="vbtn no">Khalti <span className="vcnt">215</span></button>
                <span className="vote-total">466 total votes</span>
              </div>
              <div className="vote-bar"><div className="vote-fill" style={{ width: "54%" }}></div></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
