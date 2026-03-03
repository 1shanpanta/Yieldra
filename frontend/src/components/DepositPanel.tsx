"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useUserPosition, useDeposit, useWithdraw, useVaultStats } from "@/hooks/useVault";

function ConfirmModal({
  title,
  details,
  onConfirm,
  onCancel,
}: {
  title: string;
  details: { label: string; value: string }[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="neo-card p-6 max-w-sm w-full mx-4 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-white">{title}</h3>
        <div className="flex flex-col gap-2">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between text-xs">
              <span className="text-neutral-500">{d.label}</span>
              <span className="text-neutral-300 font-medium">{d.value}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-neutral-400 text-sm font-medium hover:bg-white/[0.1] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-[#C9A96E] hover:bg-[#B8985D] text-[#0d0d0d] text-sm font-semibold transition-all neo-btn"
            autoFocus
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DepositPanel() {
  const { address } = useAccount();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [showConfirm, setShowConfirm] = useState<"deposit" | "withdraw" | null>(null);

  const position = useUserPosition(address);
  const {
    approveAndDeposit,
    isPending: depositPending,
    isConfirming: depositConfirming,
    isSuccess: depositSuccess,
  } = useDeposit();
  const { redeem, isPending: withdrawPending, isConfirming: withdrawConfirming, isSuccess: withdrawSuccess } = useWithdraw();
  const { apyBps, protocol, paused, totalAssetsRaw, depositCapRaw, refetch } = useVaultStats();

  const isLoading = depositPending || depositConfirming || withdrawPending || withdrawConfirming;

  // Refetch after successful transactions (once)
  useEffect(() => {
    if (depositSuccess || withdrawSuccess) {
      const timer = setTimeout(() => {
        refetch();
        position.refetch();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [depositSuccess, withdrawSuccess, refetch, position]);

  // Clear amount on tab switch
  const handleTabSwitch = useCallback((newTab: "deposit" | "withdraw") => {
    setTab(newTab);
    setAmount("");
  }, []);

  // Validation
  const validationError = useMemo(() => {
    if (!amount || Number(amount) <= 0) return null;
    const num = Number(amount);
    const balance = Number(position.usdcBalance);
    if (num > balance) return "Insufficient USDC balance";
    // Validate decimal places (USDC has 6 decimals)
    const parts = amount.split(".");
    if (parts[1] && parts[1].length > 6) return "Max 6 decimal places for USDC";
    // Check deposit cap
    if (depositCapRaw > 0n) {
      const remaining = depositCapRaw > totalAssetsRaw ? depositCapRaw - totalAssetsRaw : 0n;
      if (remaining === 0n) return "Vault deposit cap reached";
      const numRemaining = Number(remaining) / 1e6;
      if (num > numRemaining) return `Exceeds cap — max ${numRemaining.toLocaleString()} USDC`;
    }
    return null;
  }, [amount, position.usdcBalance, depositCapRaw, totalAssetsRaw]);

  const canDeposit = !!amount && Number(amount) > 0 && !validationError && !isLoading && !paused;

  const handleDepositClick = () => {
    if (!address || !canDeposit) return;
    setShowConfirm("deposit");
  };

  const handleDepositConfirm = () => {
    if (!address) return;
    setShowConfirm(null);
    approveAndDeposit(amount, address);
    setAmount("");
  };

  const handleWithdrawClick = () => {
    if (!address || position.sharesRaw === 0n) return;
    setShowConfirm("withdraw");
  };

  const handleWithdrawConfirm = () => {
    if (!address || position.sharesRaw === 0n) return;
    setShowConfirm(null);
    redeem(position.sharesRaw, address);
  };

  const projectedMonthly = amount && Number(amount) > 0
    ? (Number(amount) * (apyBps / 10000) / 12).toFixed(2)
    : null;

  if (!address) {
    return (
      <div className="neo-card p-7 flex flex-col items-center justify-center gap-4 min-h-[280px] animate-fade-in stagger-3">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5" aria-hidden="true">
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
    <>
      <div className="neo-card p-7 flex flex-col gap-6 animate-fade-in stagger-3">
        <h2 className="text-sm font-medium text-neutral-300 tracking-wide">Manage Position</h2>

        {paused && (
          <div className="text-xs text-amber-400 bg-amber-400/[0.06] rounded-lg px-3.5 py-2.5 border border-amber-400/10">
            Vault is paused — deposits are currently disabled.
          </div>
        )}

        {/* Tab Toggle */}
        <div className="flex rounded-xl p-1 bg-[#0a0a0a] border border-white/[0.03]" role="tablist" aria-label="Deposit or withdraw">
          <button
            role="tab"
            id="tab-deposit"
            aria-selected={tab === "deposit"}
            aria-controls="panel-deposit"
            onClick={() => handleTabSwitch("deposit")}
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
            id="tab-withdraw"
            aria-selected={tab === "withdraw"}
            aria-controls="panel-withdraw"
            onClick={() => handleTabSwitch("withdraw")}
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
          <div role="tabpanel" id="panel-deposit" aria-labelledby="tab-deposit" className="flex flex-col gap-6">
            <div className="flex justify-between text-xs text-neutral-500">
              <span>Wallet Balance</span>
              <span>{Number(position.usdcBalance).toLocaleString()} USDC</span>
            </div>

            <div className="neo-inset rounded-xl p-3.5 flex items-center gap-3">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                value={amount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d*\.?\d*$/.test(val)) setAmount(val);
                }}
                placeholder="0.00"
                className="flex-1 bg-transparent text-xl font-medium text-white placeholder-neutral-700 outline-none"
                aria-label="Deposit amount in USDC"
              />
              <button
                onClick={() => setAmount(position.usdcBalance)}
                className="text-[11px] text-neutral-500 hover:text-white font-medium px-2 py-1 rounded transition-colors"
                aria-label="Set maximum deposit amount"
              >
                MAX
              </button>
              <span className="text-sm text-neutral-600">USDC</span>
            </div>

            {validationError && (
              <p className="text-xs text-red-400 -mt-3" role="alert">{validationError}</p>
            )}

            {projectedMonthly && !validationError && (
              <div className="text-xs text-neutral-500 bg-white/[0.02] rounded-lg px-3.5 py-2.5 border border-white/[0.04]">
                Est. monthly yield: <span className="text-[#C9A96E] font-medium">${projectedMonthly}</span>
                {" "}at {(apyBps / 100).toFixed(2)}% APY
              </div>
            )}

            <button
              onClick={handleDepositClick}
              disabled={!canDeposit}
              className="w-full py-3 rounded-xl bg-[#C9A96E] hover:bg-[#B8985D] text-[#0d0d0d] font-semibold text-sm transition-all disabled:opacity-30 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed neo-btn"
              aria-label="Deposit USDC into vault"
            >
              {isLoading ? "Processing..." : paused ? "Vault Paused" : "Deposit USDC"}
            </button>
          </div>
        ) : (
          <div role="tabpanel" id="panel-withdraw" aria-labelledby="tab-withdraw" className="flex flex-col gap-6">
            <div className="flex justify-between text-xs text-neutral-500">
              <span>Your Position</span>
              <span>${Number(position.assetsValue).toLocaleString()} USDC</span>
            </div>
            <div className="flex justify-between text-xs text-neutral-500">
              <span>Vault Shares</span>
              <span>{Number(position.shares).toLocaleString()} tyUSDC</span>
            </div>

            <button
              onClick={handleWithdrawClick}
              disabled={isLoading || position.sharesRaw === 0n}
              className="w-full py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed neo-btn"
              aria-label="Withdraw all funds from vault"
            >
              {isLoading ? "Processing..." : "Withdraw All"}
            </button>
          </div>
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

      {/* Confirmation Modals */}
      {showConfirm === "deposit" && (
        <ConfirmModal
          title="Confirm Deposit"
          details={[
            { label: "Amount", value: `${Number(amount).toLocaleString()} USDC` },
            { label: "Current APY", value: `${(apyBps / 100).toFixed(2)}%` },
            { label: "Protocol", value: protocol },
            ...(projectedMonthly ? [{ label: "Est. Monthly", value: `$${projectedMonthly}` }] : []),
          ]}
          onConfirm={handleDepositConfirm}
          onCancel={() => setShowConfirm(null)}
        />
      )}
      {showConfirm === "withdraw" && (
        <ConfirmModal
          title="Confirm Withdrawal"
          details={[
            { label: "Shares", value: `${Number(position.shares).toLocaleString()} tyUSDC` },
            { label: "Value", value: `$${Number(position.assetsValue).toLocaleString()} USDC` },
          ]}
          onConfirm={handleWithdrawConfirm}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </>
  );
}
