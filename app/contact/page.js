import SiteNav from "../components/SiteNav";
import { IconMail, IconPhone } from "../components/icons";
import { CHANNELS, SOCIALS, channelHandle, liveLinks } from "../../lib/channels";

// Static Contact page. Same article shell as /about so the two read as a pair.
const DESCRIPTION =
  "Questions, feedback, feature suggestions, support, or partnership enquiries — how to reach the KastoChha team.";

// Every method is a real, actionable link: mailto for email, tel for phone.
const METHODS = [
  {
    label: "General enquiries",
    value: "contact@kastochhanepal.com",
    href: "mailto:contact@kastochhanepal.com",
    note: "Questions, feedback, feature suggestions, and support.",
    icon: IconMail
  },
  {
    label: "Partnerships",
    value: "partnership@kastochhanepal.com",
    href: "mailto:partnership@kastochhanepal.com",
    note: "Collaborations, brand partnerships, and media.",
    icon: IconMail
  },
  {
    label: "Phone",
    value: "+977-9714038455",
    href: "tel:+9779714038455",
    note: "For immediate assistance.",
    icon: IconPhone
  }
];

// The same list the footer renders, so a handle only ever changes in one place.
// The main brand account leads, then each niche under its short name — the
// "KastoChha " prefix is already the heading of the card grid's section.
const MAIN = SOCIALS.find((social) => social.label === "Instagram");

const CHANNEL_CARDS = [
  { label: "KastoChha", href: MAIN.url },
  ...liveLinks(CHANNELS).map((channel) => ({
    label: channel.label.replace(/^KastoChha\s+/, ""),
    href: channel.url
  }))
].map((card) => ({ ...card, handle: channelHandle(card.href) }));

export const metadata = {
  title: "Contact Us - KastoChha",
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact KastoChha",
    description: DESCRIPTION,
    url: "/contact",
    siteName: "KastoChha",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact KastoChha",
    description: DESCRIPTION
  }
};

export default function ContactPage() {
  return (
    <>
      <SiteNav />
      <main className="article-main">
        <div className="article-shell">
          <article className="article-body">
            <header className="article-head">
              <div className="article-kicker">Contact</div>
              <h1 className="article-title">Contact Us</h1>
              <p className="article-lede">
                Whether you have a question, feedback, a feature suggestion, need
                support, or are interested in collaborating with KastoChha,
                we&apos;d love to hear from you.
              </p>
            </header>

            <ul className="contact-list">
              {METHODS.map((method) => {
                const Icon = method.icon;
                return (
                  <li className="contact-item" key={method.value}>
                    <span className="contact-ico" aria-hidden>
                      <Icon className="icon" />
                    </span>
                    <div className="contact-body">
                      <span className="contact-label">{method.label}</span>
                      <a className="contact-value" href={method.href}>
                        {method.value}
                      </a>
                      <span className="contact-note">{method.note}</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="article-content">
              <h2>Follow our communities</h2>
              <p>
                You can also connect with us through our social communities and
                stay updated with everything happening at KastoChha.
              </p>
            </div>

            <div className="channel-grid">
              {CHANNEL_CARDS.map((channel) => (
                <a
                  className="channel-card"
                  key={channel.href}
                  href={channel.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="channel-name">{channel.label}</span>
                  <span className="channel-handle">{channel.handle}</span>
                </a>
              ))}
            </div>

            <div className="about-cta">
              <a className="btn-red" href="/chat">
                Ask KastoChha
              </a>
              <a className="btn-outline" href="/about">
                About us
              </a>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
