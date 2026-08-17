// Copy for /privacy and /terms.
//
// These two pages are linked from the footer and, more importantly, from the
// consent gate every new account has to pass (see app/components/TermsGate.js) —
// so they must resolve to something rather than 404.
//
// The wording below is a SKELETON, not a policy. Each section lists the points
// that need covering for this stack; replace the `body` strings with the real
// text and set `DRAFT` to false, which removes the "not final" banner from both
// pages. Nothing else needs editing — the pages render straight from here.

export const DRAFT = true;

export const LAST_UPDATED = "";

export const PRIVACY = {
  kicker: "Legal",
  title: "Privacy Policy",
  lede:
    "How KastoChha collects, uses, and protects the information you share with us.",
  sections: [
    {
      heading: "What we collect",
      body: [
        "Account details handled by our sign-in provider (Clerk): your name, email address, and profile image.",
        "Content you post: experiences, questions, votes, and the topics you file them under.",
        "Questions you ask the KastoChha Assist assistant, and the conversations they belong to.",
        "Basic technical data your browser sends with every request."
      ]
    },
    {
      heading: "How we use it",
      body: [
        "To show your posts to the community and attribute them to you.",
        "To answer your questions and keep your chat history available to you.",
        "To enforce rate limits and daily question quotas.",
        "To measure how the site is used, in aggregate."
      ]
    },
    {
      heading: "Who we share it with",
      body: [
        "Clerk, for authentication.",
        "Supabase, where site content and chat history are stored.",
        "Our AI provider, which receives the text of a question in order to answer it.",
        "We do not sell personal information."
      ]
    },
    {
      heading: "Your choices",
      body: [
        "You can edit or delete your own experiences at any time.",
        "You can rename, delete, or clear your entire chat history from the assistant sidebar.",
        "You can request deletion of your account and the content tied to it."
      ]
    },
    {
      heading: "Contact",
      body: [
        "Questions about this policy can be sent through the contact page."
      ]
    }
  ]
};

export const TERMS = {
  kicker: "Legal",
  title: "Terms & Conditions",
  lede:
    "The agreement between you and KastoChha when you use this site.",
  sections: [
    {
      heading: "Using KastoChha",
      body: [
        "You must be old enough to hold an account under the law that applies to you.",
        "You are responsible for what is posted from your account."
      ]
    },
    {
      heading: "Your content",
      body: [
        "You keep ownership of what you post.",
        "You grant KastoChha a licence to display, distribute, and adapt your posts on the platform.",
        "You confirm you have the right to post what you share."
      ]
    },
    {
      heading: "Community rules",
      body: [
        "Posting on KastoChha is governed by the Community Guidelines, which form part of these terms.",
        "We may remove content or suspend accounts that break them."
      ]
    },
    {
      heading: "AI answers",
      body: [
        "KastoChha Assist generates answers automatically and can be wrong.",
        "Answers are informational only — not professional, legal, medical, or financial advice.",
        "Verify anything that matters before acting on it."
      ]
    },
    {
      heading: "Liability",
      body: [
        "The service is provided as-is, without warranties.",
        "Opinions and experiences on this site belong to the people who posted them, not to KastoChha."
      ]
    },
    {
      heading: "Changes",
      body: [
        "These terms may change. Material changes trigger a fresh consent prompt at your next sign-in."
      ]
    }
  ]
};
