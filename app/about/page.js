import SiteNav from "../components/SiteNav";

// Static About page. Reuses the article typography from the blog so the long
// copy matches the rest of the site without a stylesheet of its own.
const DESCRIPTION =
  "KastoChha is Nepal's Curious Community Network — ask anything, share honest experiences, and discover the ground reality together.";

export const metadata = {
  title: "About Us - KastoChha",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About KastoChha",
    description: DESCRIPTION,
    url: "/about",
    siteName: "KastoChha",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "About KastoChha",
    description: DESCRIPTION
  }
};

export default function AboutPage() {
  return (
    <>
      <SiteNav />
      <main className="blog-main">
        <div className="blog-shell">
          <article className="blog-article">
            <header className="blog-head">
              <div className="blog-kicker">About</div>
              <h1 className="blog-title">About KastoChha</h1>
              <p className="blog-lede">
                Welcome to KastoChha, Nepal&apos;s Curious Community Network—a place
                where curiosity sparks conversations, experiences become knowledge,
                and people help one another make better decisions.
              </p>
            </header>

            <div className="blog-content">
              <p>
                Inspired by one of Nepal&apos;s most familiar phrases,{" "}
                <strong>&ldquo;Kasto Chha?&rdquo;</strong> (कस्तो छ?), meaning
                &ldquo;How is it?&rdquo;, we&apos;re building a platform where people
                can freely ask questions, share honest experiences, exchange
                opinions, and discover the ground reality together.
              </p>
              <p>
                Whether it&apos;s a restaurant, a gadget, a vehicle, a college, a
                movie, a travel destination, a job, a government service, an
                experience, or simply anything you&apos;re curious about—if someone
                can ask &ldquo;Kasto Chha?&rdquo;, it belongs on KastoChha.
              </p>
              <p>
                Our platform brings together the collective wisdom of the community
                with the intelligence of AI. Ask our AI when you need an instant
                answer, raise a &ldquo;Kasto Chha?&rdquo; question about anything
                you&apos;re curious about, explore experiences shared by others, or
                contribute your own &ldquo;Kasto Chha?&rdquo; experience to help the
                next curious person.
              </p>
              <p>
                At KastoChha, every question starts a conversation, every experience
                adds value, and every voice helps build a smarter, more informed
                community.
              </p>
              <blockquote>
                <p>
                  Because the best answers don&apos;t just come from AI—they come
                  from people who&apos;ve experienced it.
                </p>
              </blockquote>

              <h2>Our Mission</h2>
              <p>
                Our mission is to become Nepal&apos;s most trusted platform for
                discovering honest answers and sharing real experiences.
              </p>
              <p>
                Today, our AI helps answer questions using trusted information and
                intelligent reasoning. As our community grows, the experiences shared
                by our users will play an increasingly important role in making those
                answers more practical, authentic, and uniquely Nepali.
              </p>
              <p>
                We believe every shared experience has the power to help someone
                else. Every story, recommendation, opinion, and discussion
                contributes to a growing knowledge base that benefits the entire
                community.
              </p>
              <p>
                From everyday choices to life&apos;s biggest decisions, KastoChha
                exists to make asking and finding &ldquo;Kasto Chha?&rdquo; more
                easier, meaningful, and useful for everyone.
              </p>

              <h2>Our Ecosystem</h2>
              <p>
                KastoChha is more than a community platform - it&apos;s a growing
                curiosity ecosystem designed to help people discover, understand, and
                share knowledge.
              </p>

              <h3>Community</h3>
              <p>
                The heart of KastoChha is its community. Whether you&apos;re looking
                for answers or have experiences to share, KastoChha gives everyone a
                place to participate. Raise a &ldquo;Kasto Chha?&rdquo; - question
                about anything you&apos;re curious about, share your own &ldquo;Kasto
                Chha?&rdquo; experience, answer questions from others, and join
                meaningful discussions. Every contribution helps someone make a
                better-informed decision while strengthening the collective knowledge
                of the community.
              </p>

              <h3>AI Chat</h3>
              <p>
                Our AI chatbot provides instant answers and helps you explore topics
                through natural conversations. Whether you&apos;re looking for a quick
                overview or asking follow-up questions, AI makes discovering
                information faster and easier. As the KastoChha community grows, our
                long-term goal is for community experiences to enrich and strengthen
                future AI answers.
              </p>

              <h3>Articles &amp; Guides</h3>
              <p>
                Some questions deserve more than a quick answer. That&apos;s why we
                publish researched articles, explainers, comparisons, and practical
                guides that provide deeper context, multiple perspectives, and a
                richer understanding of important topics.
              </p>

              <h3>Social Communities</h3>
              <p>
                Curiosity doesn&apos;t stop on our website platform. Through our niche
                social communities covering technology, motors, food, travel, money,
                careers, entertainment, muglan and more, we educate, spark
                conversations, and encourage people to continue those discussions on
                KastoChha.
              </p>
              <p>
                Together, our community, AI, articles, and social platforms create a
                living knowledge ecosystem where every question, every answer, and
                every shared experience helps make the &ldquo;Kasto Chha?&rdquo;
                answer even better.
              </p>

              <h2>Our Vision</h2>
              <p>
                We envision a Nepal where knowledge is built together—not just
                searched for.
              </p>
              <p>
                A place where people freely share their experiences, learn from one
                another, and help others make better decisions.
              </p>
              <p>
                A place where every &ldquo;Kasto Chha?&rdquo; question starts a
                conversation, every conversation becomes knowledge, and every shared
                experience helps create better answers for the next person.
              </p>
              <p>
                Our vision is to build Nepal&apos;s most trusted community-driven
                knowledge platform, where human experiences and AI continuously
                strengthen one another, making KastoChha the first place people turn
                whenever they want to know:
              </p>
              <blockquote>
                <p>&ldquo;Kasto Chha?&rdquo;</p>
              </blockquote>

              <h2>Join the Curious Community</h2>
              <p>
                Every experience you share has the potential to help someone else.
                Every question you ask can start a meaningful conversation. And every
                conversation brings us one step closer to building a smarter, more
                informed Nepal.
              </p>
              <p>
                <strong>
                  Let&apos;s Ask, Explore and Share Together - Kasto Chha?
                </strong>
              </p>
            </div>

            <div className="about-cta">
              <a className="btn-red" href="/experience#share-review">
                Share your experience
              </a>
              <a className="btn-outline" href="/chat">
                Ask KastoChha
              </a>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
