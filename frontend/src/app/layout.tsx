import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Yieldra | Auto-Rebalancing DeFi Vault",
  description:
    "Auto-rebalancing vault that syncs your stablecoins to the highest risk-adjusted yield across DeFi protocols. Powered by Chainlink.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Yieldra | Auto-Rebalancing DeFi Vault",
    description:
      "Auto-rebalancing vault that syncs your stablecoins to the highest risk-adjusted yield across DeFi protocols. Powered by Chainlink.",
    type: "website",
    siteName: "Yieldra",
  },
  twitter: {
    card: "summary_large_image",
    title: "Yieldra | Auto-Rebalancing DeFi Vault",
    description:
      "Auto-rebalancing vault powered by Chainlink Automation and Data Feeds.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
