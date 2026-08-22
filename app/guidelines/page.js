import SiteNav from "../components/SiteNav";

// Static Community Guidelines page. Same article shell as /about and /contact.
const DESCRIPTION =
  "How to ask, share, and disagree on KastoChha — the guidelines that keep Nepal's curious community welcoming, helpful, and reliable.";

export const metadata = {
  title: "Community Guidelines - KastoChha",
  description: DESCRIPTION,
  alternates: { canonical: "/guidelines" },
  openGraph: {
    title: "KastoChha Community Guidelines",
    description: DESCRIPTION,
    url: "/guidelines",
    siteName: "KastoChha",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "KastoChha Community Guidelines",
    description: DESCRIPTION
  }
};

export default function GuidelinesPage() {
  return (
    <>
      <SiteNav />
      <main className="article-main">
        <div className="article-shell">
          <article className="article-body">
            <header className="article-head">
              <div className="article-kicker">Community</div>
              <h1 className="article-title">Community Guidelines</h1>
              <p className="article-lede">
                KastoChha is a place where people ask questions, explore
                experiences, and help one another make better decisions. Every
                question, answer, and experience contributes to a community built on
                trust, curiosity, and respect.
              </p>
            </header>

            <div className="article-content">
              <p>
                These guidelines help keep KastoChha welcoming, helpful, and
                reliable for everyone.
              </p>

              <h2>Ask with Curiosity</h2>
              <p>
                Whether you&apos;re curious about a restaurant, gadget, college,
                travel destination, government service, career, or anything
                else—if someone can ask &ldquo;Kasto Chha?&rdquo;, it&apos;s welcome
                here.
              </p>
              <p>Ask clearly, respectfully, and with genuine curiosity.</p>

              <h2>Share Honest Experiences</h2>
              <p>The best answers come from real experiences.</p>
              <p>When sharing your thoughts:</p>
              <ul>
                <li>Speak from your own experience.</li>
                <li>Be honest and constructive.</li>
                <li>Provide helpful context whenever possible.</li>
                <li>Respect that others may have different experiences.</li>
                <li>
                  Avoid posting content intended to unfairly damage, manipulate, or
                  falsely promote any person, brand, product, service, or
                  organization.
                </li>
              </ul>
              <p>
                Our goal isn&apos;t to find the &ldquo;right&rdquo; opinion—it&apos;s
                to understand different perspectives.
              </p>

              <h2>Respect Every Member</h2>
              <p>Treat others with kindness and respect.</p>
              <p>Do not:</p>
              <ul>
                <li>Harass or bully others.</li>
                <li>Use hate speech or discriminatory language.</li>
                <li>Threaten, intimidate, or encourage violence.</li>
                <li>Personally attack individuals.</li>
              </ul>
              <p>Disagree with ideas—not people.</p>

              <h2>Keep Information Genuine</h2>
              <p>Help build a community people can trust.</p>
              <p>Please avoid:</p>
              <ul>
                <li>Knowingly sharing false or misleading information.</li>
                <li>Posting fake reviews or fabricated experiences.</li>
                <li>Manipulating discussions.</li>
                <li>Spreading rumors as facts.</li>
              </ul>
              <p>If you&apos;re unsure, say so.</p>

              <h2>No Spam or Self-Promotion</h2>
              <p>
                KastoChha exists to help people—not to flood discussions with
                advertisements.
              </p>
              <p>Avoid:</p>
              <ul>
                <li>Repetitive posts.</li>
                <li>Unsolicited promotions.</li>
                <li>Affiliate links or referral spam.</li>
                <li>Excessive self-promotion.</li>
              </ul>
              <p>
                Sharing something genuinely helpful is always encouraged when
                it&apos;s relevant to the discussion.
              </p>

              <h2>Respect Privacy</h2>
              <p>Protect your own privacy and the privacy of others.</p>
              <p>Do not share:</p>
              <ul>
                <li>Personal phone numbers.</li>
                <li>Home addresses.</li>
                <li>Government identification details.</li>
                <li>Financial information.</li>
                <li>Private conversations without permission.</li>
              </ul>

              <h2>Respect the Law</h2>
              <p>Do not post content that:</p>
              <ul>
                <li>Promotes illegal activities.</li>
                <li>Encourages fraud or scams.</li>
                <li>Violates intellectual property rights.</li>
                <li>Infringes another person&apos;s rights.</li>
              </ul>

              <h2>AI Is Here to Help</h2>
              <p>
                KastoChha combines community knowledge with AI to make information
                easier to explore.
              </p>
              <p>
                AI-generated answers are intended to help you learn and discover.
                They should not replace professional advice for medical, legal,
                financial, or other important decisions.
              </p>
              <p>Community experiences and AI work best together.</p>

              <h2>Moderation</h2>
              <p>To keep KastoChha safe and helpful, we may:</p>
              <ul>
                <li>Remove content that violates these guidelines.</li>
                <li>Limit certain platform features.</li>
                <li>
                  Suspend or permanently ban accounts that repeatedly violate our
                  rules.
                </li>
              </ul>
              <p>
                Our moderation decisions are made to protect the health of the
                community.
              </p>

              <h2>Let&apos;s Build KastoChha Together</h2>
              <p>
                The strength of KastoChha comes from the people who raise questions,
                share their experiences, and help others make better decisions.
                Every question you ask, every experience you share, and every
                conversation you join helps someone else make a better-informed
                decision.
              </p>
              <p>
                Together, we&apos;re building a community where curiosity becomes
                knowledge and knowledge is shared with everyone.
              </p>
              <blockquote>
                <p>
                  Every question starts a conversation.
                  <br />
                  Every experience helps someone else.
                  <br />
                  Every contribution makes KastoChha smarter.
                </p>
              </blockquote>
              <p>
                <strong>
                  Let&apos;s build a community where people don&apos;t just search
                  for answers—they share them.
                </strong>
              </p>
            </div>

            <div className="about-cta">
              <a className="btn-red" href="/discussions#share-review">
                Share your experience
              </a>
              <a className="btn-outline" href="/contact">
                Report a problem
              </a>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
