"use client";

import { useYieldData, useVaultStats } from "@/hooks/useVault";
import { formatUnits } from "viem";

function getRiskColor(score: number): string {
  if (score <= 5) return "text-emerald-500/80";
  if (score <= 10) return "text-amber-500/80";
  return "text-orange-500/70";
}

function getRiskLabel(score: number): string {
  if (score <= 5) return "Low";
  if (score <= 10) return "Medium";
  return "Higher";
}

export default function YieldTable() {
  const { yields, shouldRebalance, rebalanceTarget, isLoading } = useYieldData();
  const { protocol: activeProtocol, apyBps: currentApyBps } = useVaultStats();

  if (isLoading) {
    return (
      <div className="neo-card p-7">
        <div className="h-5 w-40 bg-neutral-800 rounded mb-6 animate-pulse" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-neutral-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const targetYield = yields.find(
    (y) => rebalanceTarget && y.adapter.toLowerCase() === rebalanceTarget.toLowerCase()
  );
  const currentRiskAdj = currentApyBps ? (currentApyBps * 0.95) : 0;
  const targetRiskAdj = targetYield ? Number(targetYield.riskAdjustedAPY) : 0;
  const apyDelta = ((targetRiskAdj - currentRiskAdj) / 100).toFixed(2);

  return (
    <div className="neo-card p-7 flex flex-col gap-5 animate-fade-in stagger-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-300 tracking-wide">Yield Comparison</h2>
        {shouldRebalance && targetYield && (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-[#C9A96E] font-medium">
            +{apyDelta}% via {targetYield.protocolName}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {yields.map((y, i) => {
          const isActive = y.protocolName === activeProtocol;
          const apy = Number(y.apy) / 100;
          const riskAdj = Number(y.riskAdjustedAPY) / 100;
          const risk = Number(y.riskScore);
          const deposited = formatUnits(y.deposited, 6);

          return (
            <div
              key={i}
              className={`rounded-xl p-4 transition-all ${
                isActive
                  ? "bg-white/[0.03] border border-white/[0.08] glow-warm"
                  : "bg-[#0f0f0f] border border-white/[0.03] hover:border-white/[0.06]"
              }`}
            >
              {/* Desktop */}
              <div className="hidden sm:flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[#C9A96E]" : "bg-neutral-700"}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{y.protocolName}</span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-400">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] ${getRiskColor(risk)}`}>
                      Risk: {risk}/100 ({getRiskLabel(risk)})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-8 text-right">
                  <div>
                    <div className="text-sm font-medium text-white">{apy.toFixed(2)}%</div>
                    <div className="text-[10px] text-neutral-600">Raw APY</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[#C9A96E]">{riskAdj.toFixed(2)}%</div>
                    <div className="text-[10px] text-neutral-600">Risk-Adj</div>
                  </div>
                  {Number(deposited) > 0 && (
                    <div>
                      <div className="text-sm font-medium text-white">
                        ${Number(deposited).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-neutral-600">Deposited</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile */}
              <div className="flex sm:hidden flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[#C9A96E]" : "bg-neutral-700"}`} />
                  <span className="text-sm font-medium text-white">{y.protocolName}</span>
                  {isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-400">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs pl-4">
                  <span className={getRiskColor(risk)}>Risk: {risk}</span>
                  <span className="text-white">{apy.toFixed(2)}%</span>
                  <span className="text-[#C9A96E]">{riskAdj.toFixed(2)}% adj</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {yields.length === 0 && (
        <div className="text-center py-8 text-neutral-600 text-sm">
          No yield adapters registered
        </div>
      )}
    </div>
  );
}
