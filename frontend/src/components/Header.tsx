"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-5 border-b border-white/5" role="banner">
      <Link href="/" className="flex items-center gap-3" aria-label="Yieldra home">
        <div className="w-8 h-8 rounded-lg bg-[#C9A96E] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d0d0d" strokeWidth="2.5" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="text-lg font-medium tracking-tight text-white">
          Yieldra
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 font-medium tracking-wide">
          Chainlink
        </span>
      </Link>
      <nav className="flex items-center gap-3" aria-label="Wallet connection">
        <Link
          href="/profile"
          className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
          aria-label="View profile"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </Link>
        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus="address"
        />
      </nav>
    </header>
  );
}
