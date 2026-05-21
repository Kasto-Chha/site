import { IconArrowDown, IconArrowUp } from "../components/icons";

export default function ExperiencePage() {
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
          <a className="btn-red" href="#share-review">Share Review</a>
        </div>
      </nav>

      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">COMMUNITY REVIEWS</div>
              <h1 className="page-title">KastoChha Experience</h1>
              <p className="page-sub">A Reddit-style feed for topic reviews. Vote, discuss and leave your own experience.</p>
            </div>
            <div className="page-actions">
              <a className="btn-outline" href="/chat">Ask AI</a>
              <a className="btn-red" href="#share-review">Share Review</a>
            </div>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="review-layout">
            <div>
              <div className="review-toolbar">
                <button type="button" className="review-filter active">All</button>
                <button type="button" className="review-filter">Technology</button>
                <button type="button" className="review-filter">Career</button>
                <button type="button" className="review-filter">Education</button>
                <button type="button" className="review-filter">Housing</button>
                <button type="button" className="review-filter">Finance</button>
              </div>

              <div className="review-feed">
                <div className="review-card">
                  <div className="review-vote">
                    <button type="button" className="vote-btn" aria-label="Upvote">
                      <IconArrowUp className="icon" />
                    </button>
                    <span className="vote-count">1.2k</span>
                    <button type="button" className="vote-btn" aria-label="Downvote">
                      <IconArrowDown className="icon" />
                    </button>
                  </div>
                  <div className="review-body">
                    <div className="review-topic">Technology / Phones</div>
                    <div className="review-title">iPhone 17 camera and battery review</div>
                    <div className="review-text">Strong low-light photos and all-day battery, but pricing and warranty service are key concerns.</div>
                    <div className="review-meta">
                      <span>by Rajesh K.</span>
                      <span>3h ago</span>
                      <span>212 comments</span>
                    </div>
                    <div className="review-actions">
                      <button type="button" className="review-action">Read full review</button>
                      <button type="button" className="review-action">Save</button>
                      <button type="button" className="review-action">Share</button>
                    </div>
                  </div>
                </div>

                <div className="review-card">
                  <div className="review-vote">
                    <button type="button" className="vote-btn" aria-label="Upvote">
                      <IconArrowUp className="icon" />
                    </button>
                    <span className="vote-count">860</span>
                    <button type="button" className="vote-btn" aria-label="Downvote">
                      <IconArrowDown className="icon" />
                    </button>
                  </div>
                  <div className="review-body">
                    <div className="review-topic">Career / Delivery</div>
                    <div className="review-title">Pathao rider experience with fuel costs</div>
                    <div className="review-text">Earnings are decent for side income but fuel and bike wear reduce the take-home pay.</div>
                    <div className="review-meta">
                      <span>by Sita M.</span>
                      <span>7h ago</span>
                      <span>126 comments</span>
                    </div>
                    <div className="review-actions">
                      <button type="button" className="review-action">Read full review</button>
                      <button type="button" className="review-action">Save</button>
                      <button type="button" className="review-action">Share</button>
                    </div>
                  </div>
                </div>

                <div className="review-card">
                  <div className="review-vote">
                    <button type="button" className="vote-btn" aria-label="Upvote">
                      <IconArrowUp className="icon" />
                    </button>
                    <span className="vote-count">740</span>
                    <button type="button" className="vote-btn" aria-label="Downvote">
                      <IconArrowDown className="icon" />
                    </button>
                  </div>
                  <div className="review-body">
                    <div className="review-topic">Education / MBA</div>
                    <div className="review-title">TU MBA program - value vs expectations</div>
                    <div className="review-text">Coursework is mixed and placements are limited. Best for those already employed.</div>
                    <div className="review-meta">
                      <span>by Anita P.</span>
                      <span>1d ago</span>
                      <span>98 comments</span>
                    </div>
                    <div className="review-actions">
                      <button type="button" className="review-action">Read full review</button>
                      <button type="button" className="review-action">Save</button>
                      <button type="button" className="review-action">Share</button>
                    </div>
                  </div>
                </div>

                <div className="review-card">
                  <div className="review-vote">
                    <button type="button" className="vote-btn" aria-label="Upvote">
                      <IconArrowUp className="icon" />
                    </button>
                    <span className="vote-count">612</span>
                    <button type="button" className="vote-btn" aria-label="Downvote">
                      <IconArrowDown className="icon" />
                    </button>
                  </div>
                  <div className="review-body">
                    <div className="review-topic">Housing / Hostel</div>
                    <div className="review-title">Kathmandu hostel life near Kirtipur</div>
                    <div className="review-text">Affordable but Wi-Fi is slow and food quality varies. Location is the main win.</div>
                    <div className="review-meta">
                      <span>by Bibek T.</span>
                      <span>2d ago</span>
                      <span>84 comments</span>
                    </div>
                    <div className="review-actions">
                      <button type="button" className="review-action">Read full review</button>
                      <button type="button" className="review-action">Save</button>
                      <button type="button" className="review-action">Share</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="review-side">
              <div className="review-panel bento-card" id="share-review">
                <h3>Share a review</h3>
                <p>Post your experience directly. Keep it honest, specific and helpful.</p>
                <div className="fg" style={{ marginTop: "12px" }}>
                  <div className="flbl">Topic</div>
                  <input className="finp" type="text" placeholder="e.g. iPhone 17 Nepal" />
                </div>
                <div className="fg">
                  <div className="flbl">Category</div>
                  <select className="fsel">
                    <option value="">Select category...</option>
                    <option>Technology</option>
                    <option>Career</option>
                    <option>Education</option>
                    <option>Housing</option>
                    <option>Finance</option>
                    <option>Lifestyle</option>
                  </select>
                </div>
                <div className="fg">
                  <div className="flbl">Verdict</div>
                  <select className="fsel">
                    <option value="">Choose verdict...</option>
                    <option>Ramro chha</option>
                    <option>Thikai chha</option>
                    <option>Naramro chha</option>
                  </select>
                </div>
                <div className="fg">
                  <div className="flbl">Your review</div>
                  <textarea
                    className="fta"
                    placeholder="Share what worked, what did not, and any costs or tips."
                  ></textarea>
                </div>
                <button type="button" className="fsub">Post review -&gt;</button>
              </div>

              <div className="review-panel bento-card">
                <h3>Top topics</h3>
                <ul className="review-list">
                  <li>iPhone 17 in Nepal</li>
                  <li>Pathao rider income</li>
                  <li>eSewa vs Khalti</li>
                  <li>Kathmandu hostel</li>
                  <li>Civil Service prep</li>
                </ul>
              </div>

              <div className="review-panel bento-card">
                <h3>Review guidelines</h3>
                <ul className="review-list">
                  <li>Be specific about time, place and cost.</li>
                  <li>Share what worked and what did not.</li>
                  <li>Avoid personal attacks and rumors.</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
