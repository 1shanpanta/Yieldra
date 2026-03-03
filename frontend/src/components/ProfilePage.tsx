"use client";

import { useState } from "react";
import { useAccount, useChains } from "wagmi";
import { useUserPosition, useVaultStats } from "@/hooks/useVault";

const MOCK_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className={`text-sm font-medium ${accent ? "text-[#C9A96E]" : "text-white"}`}>{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { address, chain } = useAccount();
  const chains = useChains();
  const position = useUserPosition(address);
  const { apyBps, protocol, totalAssets } = useVaultStats();
  const [copied, setCopied] = useState(false);

  const isDemo = !address;
  const displayAddress = address || MOCK_ADDRESS;
  const networkName = chain?.name || chains[0]?.name || "Ethereum";

  const assetsNum = Number(position.assetsValue);
  const sharesNum = Number(position.shares);
  const balanceNum = Number(position.usdcBalance);
  const tvlNum = Number(totalAssets);

  // Earnings projections based on current APY
  const dailyEarnings = assetsNum * (apyBps / 10000) / 365;
  const monthlyEarnings = assetsNum * (apyBps / 10000) / 12;
  const yearlyEarnings = assetsNum * (apyBps / 10000);

  // Portfolio share of TVL
  const portfolioShare = tvlNum > 0 ? (assetsNum / tvlNum) * 100 : 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Profile Header */}
      <div className="neo-card p-7 flex flex-col gap-5 animate-fade-in stagger-1 relative">
        {isDemo && (
          <div className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-neutral-500 font-medium">
            DEMO
          </div>
        )}

        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#C9A96E] to-[#8B7340] flex items-center justify-center shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0d0d0d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-white tracking-tight">
                {truncateAddress(displayAddress)}
              </span>
              <button
                onClick={handleCopy}
                className="text-neutral-500 hover:text-white transition-colors p-1 rounded"
                aria-label="Copy wallet address"
              >
                {copied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isDemo ? "bg-neutral-600" : "bg-emerald-500"}`} />
              <span className="text-xs text-neutral-500">
                {isDemo ? "Not connected" : `Connected to ${networkName}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-2 gap-4 animate-fade-in stagger-2">
        <div className="neo-card p-5 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-medium">Portfolio Value</span>
          <span className="text-2xl font-semibold text-white tracking-tight">
            ${assetsNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-neutral-600">{sharesNum.toLocaleString()} tyUSDC</span>
        </div>
        <div className="neo-card p-5 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-medium">Wallet Balance</span>
          <span className="text-2xl font-semibold text-white tracking-tight">
            ${balanceNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-neutral-600">USDC available</span>
        </div>
      </div>

      {/* Earnings Projections */}
      <div className="neo-card p-7 flex flex-col gap-4 animate-fade-in stagger-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-300 tracking-wide">Earnings Projection</h2>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-[#C9A96E] font-medium">
            {(apyBps / 100).toFixed(2)}% APY
          </span>
        </div>
        <StatRow label="Daily Earnings" value={`$${dailyEarnings.toFixed(2)}`} accent />
        <StatRow label="Monthly Earnings" value={`$${monthlyEarnings.toFixed(2)}`} accent />
        <StatRow label="Yearly Earnings" value={`$${yearlyEarnings.toFixed(2)}`} accent />
      </div>

      {/* Position Details */}
      <div className="neo-card p-7 flex flex-col gap-4 animate-fade-in stagger-4">
        <h2 className="text-sm font-medium text-neutral-300 tracking-wide">Position Details</h2>
        <StatRow label="Active Protocol" value={protocol} />
        <StatRow label="Vault Shares" value={`${sharesNum.toLocaleString()} tyUSDC`} />
        <StatRow label="Deposited Value" value={`$${assetsNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        <StatRow label="Share of TVL" value={`${portfolioShare.toFixed(2)}%`} />
        <StatRow label="Network" value={networkName} />
      </div>
    </div>
  );
}
