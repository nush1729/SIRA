/**
 * PLACEHOLDER root layout — owned by Role D. Role C only relies on it loading
 * `globals.css` and the Inter font variable. D's version wins at integration.
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SIRA — Smart Interview Rescheduling & Availability",
  description:
    "Interview scheduling that actually respects everyone's calendar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
