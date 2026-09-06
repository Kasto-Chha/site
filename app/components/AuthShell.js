// Shared split-screen frame for the Clerk sign-in / sign-up pages: a dark
// brand panel with the site pitch on the left, the auth card on the right.
export default function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <div className="auth-brand-glow" aria-hidden="true"></div>
        <a className="auth-logo" href="/">
          Kasto<em>Chha</em>
        </a>
        <div className="auth-brand-body">
          <span className="auth-badge">Nepal&apos;s Curious Community Network</span>
          <h1 className="auth-headline">
            Nepal ma sabai kura...
            <br />
            <em>KastoChha?</em>
          </h1>
          <p className="auth-sub">
            From momo to mausam, gadgets to careers — real opinions, honest
            experiences, and community answers.
          </p>
          <ul className="auth-points">
            <li>Get instant KastoChha Answers from ChatBot.</li>
            <li>Vote in battles and trending debates</li>
            <li>Ask, Share and Explore KastoChha Experiences.</li>
          </ul>
        </div>
        <div className="auth-brand-foot">Built for Nepalis, by Nepalis</div>
      </aside>

      <main className="auth-panel">
        {children}
        <a className="auth-back" href="/">
          &lt;- Back to home
        </a>
      </main>
    </div>
  );
}
