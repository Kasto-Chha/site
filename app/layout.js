import "./globals.css";
import { Fraunces, DM_Sans, DM_Mono } from "next/font/google";

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
  title: "KastoChha - Nepal ko Real Talk",
  description: "Front-end prototype for KastoChha, a community opinion platform."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${dmSans.variable} ${dmMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
