import "./globals.css";
import "react-quill/dist/quill.snow.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Fraunces, DM_Sans, DM_Mono } from "next/font/google";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "700", "900"],
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
  title: "KastoChha - Nepal ko Real Talk",
  description: "Front-end prototype for KastoChha, a community opinion platform.",
  openGraph: {
    title: "KastoChha - Nepal ko Real Talk",
    description: "Community powered opinions from across Nepal.",
    url: siteUrl,
    siteName: "KastoChha",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "KastoChha - Nepal ko Real Talk",
    description: "Community powered opinions from across Nepal."
  }
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${fraunces.variable} ${dmSans.variable} ${dmMono.variable}`}>
          <a href="#main" className="sr-only focus:not-sr-only" style={{position:'absolute',left:8,top:8,zIndex:10000,background:'#fff',padding:'6px 8px',borderRadius:6}}>Skip to content</a>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "KastoChha",
            "url": siteUrl,
            "description": "Community powered opinions from across Nepal."
          }) }} />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
