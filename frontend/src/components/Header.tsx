"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-5 border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#C9A96E] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d0d0d" strokeWidth="2.5">
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
      </div>
      <ConnectButton
        chainStatus="icon"
        showBalance={false}
        accountStatus="address"
      />
    </header>
  );
}
