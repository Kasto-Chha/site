import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { STIX_Two_Text, DM_Sans, DM_Mono } from "next/font/google";

import TermsGate from "./components/TermsGate";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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
  title: "KastoChha - Nepal's Curious Community Network | Real Reviews, Opinions & Answers",
  description:
    "From momo to mausam, gadgets to careers — KastoChha answers every Nepali curiosity with real reviews, honest opinions, and community experiences. No filter, no sponsored posts.",
  openGraph: {
    title: "KastoChha - Nepal's Curious Community Network",
    description:
      "Nepal's most curious community — real reviews, honest opinions, and answers on everything that matters in Nepal. Built for Nepalis, by Nepalis.",
    url: siteUrl,
    siteName: "KastoChha",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "KastoChha - Nepal's Curious Community Network",
    description:
      "Real reviews, honest opinions, and answers on everything that matters in Nepal."
  }
};

export const viewport = {
  themeColor: "#F5F0E8",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${stixTwoText.variable} ${dmSans.variable} ${dmMono.variable}`}>
          <a href="#main" className="sr-only focus:not-sr-only" style={{position:'absolute',left:8,top:8,zIndex:10000,background:'#fff',padding:'6px 8px',borderRadius:6}}>Skip to content</a>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "KastoChha",
            "url": siteUrl,
            "description": "Community powered opinions from across Nepal."
          }) }} />
          {children}
          {/* Renders nothing unless the signed-in user still owes consent. */}
          <TermsGate />
        </body>
      </html>
    </ClerkProvider>
  );
}
