"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useUserPosition, useDeposit, useWithdraw, useVaultStats } from "@/hooks/useVault";

export default function DepositPanel() {
  const { address } = useAccount();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");

  const position = useUserPosition(address);
  const { approve, deposit, isPending: depositPending, isConfirming: depositConfirming } = useDeposit();
  const { redeem, isPending: withdrawPending, isConfirming: withdrawConfirming } = useWithdraw();
  const { apyBps, refetch } = useVaultStats();

  const isLoading = depositPending || depositConfirming || withdrawPending || withdrawConfirming;

  const handleDeposit = async () => {
    if (!address || !amount) return;
    approve(amount);
    setTimeout(() => {
      deposit(amount, address);
      setAmount("");
      refetch();
    }, 2000);
  };

  const handleWithdraw = () => {
    if (!address || position.sharesRaw === 0n) return;
    redeem(position.sharesRaw, address);
    setAmount("");
    refetch();
  };

  const projectedMonthly = amount && Number(amount) > 0
    ? (Number(amount) * (apyBps / 10000) / 12).toFixed(2)
    : null;

  if (!address) {
    return (
      <div className="neo-card p-7 flex flex-col items-center justify-center gap-4 min-h-[280px] animate-fade-in stagger-3">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-neutral-500 text-sm text-center">
          Connect wallet to continue
        </p>
      </div>
    );
  }

  return (
    <div className="neo-card p-7 flex flex-col gap-6 animate-fade-in stagger-3">
      <h2 className="text-sm font-medium text-neutral-300 tracking-wide">Manage Position</h2>

      {/* Tab Toggle */}
      <div className="flex rounded-xl p-1 bg-[#0a0a0a] border border-white/[0.03]" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "deposit"}
          onClick={() => setTab("deposit")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            tab === "deposit"
              ? "bg-[#1a1a1a] text-white neo-raised"
              : "text-neutral-600 hover:text-neutral-400"
          }`}
        >
          Deposit
        </button>
        <button
          role="tab"
          aria-selected={tab === "withdraw"}
          onClick={() => setTab("withdraw")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
            tab === "withdraw"
              ? "bg-[#1a1a1a] text-white neo-raised"
              : "text-neutral-600 hover:text-neutral-400"
          }`}
        >
          Withdraw
        </button>
      </div>

      {tab === "deposit" ? (
        <>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Wallet Balance</span>
            <span>{Number(position.usdcBalance).toLocaleString()} USDC</span>
          </div>

          <div className="neo-inset rounded-xl p-3.5 flex items-center gap-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-xl font-medium text-white placeholder-neutral-700 outline-none"
              aria-label="Deposit amount"
            />
            <button
              onClick={() => setAmount(position.usdcBalance)}
              className="text-[11px] text-neutral-500 hover:text-white font-medium px-2 py-1 rounded transition-colors"
            >
              MAX
            </button>
            <span className="text-sm text-neutral-600">USDC</span>
          </div>

          {projectedMonthly && (
            <div className="text-xs text-neutral-500 bg-white/[0.02] rounded-lg px-3.5 py-2.5 border border-white/[0.04]">
              Est. monthly yield: <span className="text-[#C9A96E] font-medium">${projectedMonthly}</span>
              {" "}at {(apyBps / 100).toFixed(2)}% APY
            </div>
          )}

          <button
            onClick={handleDeposit}
            disabled={isLoading || !amount || Number(amount) <= 0}
            className="w-full py-3 rounded-xl bg-[#C9A96E] hover:bg-[#B8985D] text-[#0d0d0d] font-semibold text-sm transition-all disabled:opacity-30 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed neo-btn"
          >
            {isLoading ? "Processing..." : "Deposit USDC"}
          </button>
        </>
      ) : (
        <>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Your Position</span>
            <span>${Number(position.assetsValue).toLocaleString()} USDC</span>
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Vault Shares</span>
            <span>{Number(position.shares).toLocaleString()} tyUSDC</span>
          </div>

          <button
            onClick={handleWithdraw}
            disabled={isLoading || position.sharesRaw === 0n}
            className="w-full py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed neo-btn"
          >
            {isLoading ? "Processing..." : "Withdraw All"}
          </button>
        </>
      )}

      {position.sharesRaw > 0n && (
        <div className="border-t border-white/[0.04] pt-5 flex flex-col gap-2.5">
          <div className="flex justify-between text-xs">
            <span className="text-neutral-600">Deposited Value</span>
            <span className="text-neutral-300 font-medium">${Number(position.assetsValue).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-neutral-600">Vault Shares</span>
            <span className="text-neutral-300 font-medium">{Number(position.shares).toLocaleString()} tyUSDC</span>
          </div>
        </div>
      )}
    </div>
  );
}
