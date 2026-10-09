import "./globals.css";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { STIX_Two_Text, DM_Sans, DM_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import TermsGate from "./components/TermsGate";
import { jsonLd, organizationSchema, websiteSchema } from "../lib/seo/schema";
import { clerkAppearance } from "../lib/clerkAppearance";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const GA_ID = "G-YEHEX8EXWM";

// Editorial serif used for the wordmark, headings, and italics. Exposed as
// --font-serif so all existing CSS keeps working unchanged. Variable font,
// weights 400-700: heavier CSS weights render at 700.
const stixTwoText = STIX_Two_Text({
  subsets: ["latin"],
  variable: "--font-serif",
  style: ["normal", "italic"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"]
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"]
});

export const metadata = {
  metadataBase: new URL(siteUrl),
  // The homepage had no canonical tag at all — every other page emitted one.
  // Pages that need their own override this via their alternates.
  alternates: { canonical: "/" },
  title: "KastoChha - Nepal's Curious Community Network",
  description:
    "KastoChha is Nepal's community-powered review platform for asking, sharing, and exploring honest opinions and real experiences to make better decisions.",
  openGraph: {
    title: "KastoChha - Nepal's Curious Community Network",
    description:
      "Nepal's most curious community — real reviews, honest opinions, and answers on everything that matters in Nepal. Built for Nepalis, by Nepalis.",
    url: siteUrl,
    siteName: "KastoChha",
    type: "website",
    images: [
      {
        url: "/api/og?kicker=Nepal%27s+Independent+Community-Powered+Review+Platform&title=Nepal+ma+sabai+kura...+KastoChha%3F",
        width: 1200,
        height: 630,
        alt: "KastoChha - Nepal's Curious Community Network"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "KastoChha - Nepal's Curious Community Network",
    description:
      "Real reviews, honest opinions, and answers on everything that matters in Nepal.",
    images: [
      "/api/og?kicker=Nepal%27s+Independent+Community-Powered+Review+Platform&title=Nepal+ma+sabai+kura...+KastoChha%3F"
    ]
  }
};

export const viewport = {
  themeColor: "#F5F0E8",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }) {
  // The per-request CSP nonce minted in middleware.js (see lib/csp.js). Reading
  // it makes every page render per request, which a nonce requires anyway: a
  // page cached as static HTML would carry a stale nonce, or none.
  const nonce = headers().get("x-nonce") || undefined;

  return (
    // `dynamic` is what lets ClerkProvider read the nonce and stamp it on the
    // clerk-js <script> it renders; without it that tag is blocked and sign-in
    // never loads.
    <ClerkProvider appearance={clerkAppearance} dynamic>
      <html lang="en">
        <body className={`${stixTwoText.variable} ${dmSans.variable} ${dmMono.variable}`}>
          {/* .fi elements (every card grid) start at opacity:0 and only reach
              opacity:1 via a useEffect that adds .show once IntersectionObserver
              fires — see useScrollReveal. That effect never runs at all without
              JavaScript, so every one of those sections stays invisible forever,
              not just unanimated. <noscript> content is only ever applied by a
              browser that has JS disabled, so this has zero effect on the
              normal, JS-enabled case — the reveal animation is untouched for
              every real visitor — and exists purely as the no-JS floor. */}
          <noscript>
            <style>{".fi{opacity:1 !important;transform:none !important}"}</style>
          </noscript>
          <a href="#main" className="sr-only focus:not-sr-only" style={{position:'absolute',left:8,top:8,zIndex:10000,background:'#fff',padding:'6px 8px',borderRadius:6}}>Skip to content</a>
          {/* Organization + WebSite, site-wide. The Organization block is what
              finally connects the brand to the 17 accounts it publishes from
              (sameAs) — that footprint has been invisible to search until now.
              Page-specific schema is added by each page on top of this. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLd(organizationSchema(siteUrl), websiteSchema(siteUrl))
            }}
          />
          {children}
          {/* Renders nothing unless the signed-in user still owes consent. */}
          <TermsGate />
          {/* <Analytics /> renders a <Suspense> boundary (it reads the route),
              so it has to live inside <body>. It used to sit after </html>,
              outside the document: the server put that boundary's marker in
              the body while the client looked for it at the document root, so
              hydration failed on every page load and React threw away the
              server HTML and rebuilt the whole page in the browser. */}
          <Analytics />
          {/* Records real-visitor load speed (Core Web Vitals) for the Speed Insights
              tab in the Vercel dashboard. Like <Analytics />, it renders a
              <Suspense> boundary, so it has to stay inside <body>. */}
          <SpeedInsights />
          {/* Google Analytics, loaded late on purpose. lazyOnload waits for the
              window load event and then browser idle time, so its ~200 KB
              download and ~0.6 s of parsing no longer compete with the page's
              own start-up. Trade-off: a visitor who leaves before it loads
              (the first second or two) is not counted by Google Analytics;
              Vercel Analytics above still counts every visit. This is the
              standard gtag snippet; the ready-made <GoogleAnalytics> component
              has no option to delay itself. */}
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="lazyOnload"
            nonce={nonce}
          />
          <Script id="ga-init" strategy="lazyOnload" nonce={nonce}>
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </body>
      </html>
    </ClerkProvider>
  );
}
