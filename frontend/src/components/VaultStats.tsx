"use client";

import { useVaultStats } from "@/hooks/useVault";

function StatCard({
  label, value, sub, accent, stagger,
}: {
  label: string; value: string; sub?: string; accent?: boolean; stagger: number;
}) {
  return (
    <div className={`neo-card p-6 flex flex-col gap-2 animate-fade-in stagger-${stagger}`}>
      <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-medium">{label}</span>
      <span className={`text-2xl font-semibold tracking-tight ${accent ? "text-[#C9A96E]" : "text-white"}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-neutral-600">{sub}</span>}
    </div>
  );
}

export default function VaultStats() {
  const { totalAssets, apyPercent, apyBps, protocol, paused, isLoading } = useVaultStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5" aria-busy="true" aria-label="Loading vault stats">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="neo-card p-6 animate-pulse">
            <div className="h-3 w-16 bg-neutral-800 rounded mb-4" />
            <div className="h-7 w-24 bg-neutral-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const tvl = Number(totalAssets);
  const tvlFormatted = tvl.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const monthlyEarnings = tvl > 0 ? (tvl * (apyBps / 10000) / 12) : 0;
  const monthlyFormatted = monthlyEarnings.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      <StatCard stagger={1} label="Total Value Locked" value={`$${tvlFormatted}`} sub="USDC" />
      <StatCard stagger={2} label="Current APY" value={`${apyPercent}%`} sub={`~$${monthlyFormatted}/mo`} accent />
      <StatCard stagger={3} label="Active Protocol" value={protocol} sub="Auto-optimized" />
      <StatCard
        stagger={4}
        label="Vault Status"
        value={paused ? "Paused" : "Active"}
        sub={paused ? "Deposits disabled" : "Accepting deposits"}
      />
    </div>
  );
}
