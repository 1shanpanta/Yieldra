"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { toast } from "sonner";
import { VAULT_ABI, AGGREGATOR_ABI, ERC20_ABI, CONTRACTS } from "@/config/contracts";

const POLL_INTERVAL = 15_000; // 15s refresh

export function useVaultStats() {
  const results = useReadContracts({
    contracts: [
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "totalAssets" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "currentAPY" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "currentProtocol" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "paused" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "totalSupply" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "depositCap" },
    ],
    query: { refetchInterval: POLL_INTERVAL },
  });

  const totalAssets = results.data?.[0]?.result as bigint | undefined;
  const apyBps = results.data?.[1]?.result as bigint | undefined;
  const protocol = results.data?.[2]?.result as string | undefined;
  const paused = results.data?.[3]?.result as boolean | undefined;
  const totalShares = results.data?.[4]?.result as bigint | undefined;
  const depositCap = results.data?.[5]?.result as bigint | undefined;

  return {
    totalAssets: totalAssets ? formatUnits(totalAssets, 6) : "0",
    totalAssetsRaw: totalAssets || 0n,
    apyPercent: apyBps ? (Number(apyBps) / 100).toFixed(2) : "0",
    apyBps: apyBps ? Number(apyBps) : 0,
    protocol: protocol || "—",
    paused: paused || false,
    totalShares: totalShares ? formatUnits(totalShares, 6) : "0",
    depositCap: depositCap ? formatUnits(depositCap, 6) : "0",
    depositCapRaw: depositCap || 0n,
    isLoading: results.isLoading,
    refetch: results.refetch,
  };
}

export function useUserPosition(address: `0x${string}` | undefined) {
  const { data: shares, refetch: refetchShares } = useReadContract({
    address: CONTRACTS.vault,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: POLL_INTERVAL },
  });

  const { data: assets, refetch: refetchAssets } = useReadContract({
    address: CONTRACTS.vault,
    abi: VAULT_ABI,
    functionName: "convertToAssets",
    args: shares ? [shares] : undefined,
    query: { enabled: !!shares && shares > 0n, refetchInterval: POLL_INTERVAL },
  });

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: POLL_INTERVAL },
  });

  const refetch = useCallback(() => {
    refetchShares();
    refetchAssets();
    refetchBalance();
  }, [refetchShares, refetchAssets, refetchBalance]);

  return {
    shares: shares ? formatUnits(shares, 6) : "0",
    sharesRaw: shares || 0n,
    assetsValue: assets ? formatUnits(assets, 6) : "0",
    usdcBalance: usdcBalance ? formatUnits(usdcBalance, 6) : "0",
    usdcBalanceRaw: usdcBalance || 0n,
    refetch,
  };
}

export function useYieldData() {
  const { data: yields, isLoading, refetch } = useReadContract({
    address: CONTRACTS.aggregator,
    abi: AGGREGATOR_ABI,
    functionName: "getAllYields",
    query: { refetchInterval: POLL_INTERVAL },
  });

  const { data: rebalanceData } = useReadContract({
    address: CONTRACTS.aggregator,
    abi: AGGREGATOR_ABI,
    functionName: "shouldRebalance",
    query: { refetchInterval: POLL_INTERVAL },
  });

  return {
    yields: yields || [],
    shouldRebalance: rebalanceData?.[0] || false,
    rebalanceTarget: rebalanceData?.[1],
    isLoading,
    refetch,
  };
}

export function useDeposit() {
  // Separate writeContract instances for approve and deposit
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: approvePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();
  const {
    isLoading: approveConfirming,
    isSuccess: approveSuccess,
  } = useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: depositPending,
    error: depositError,
    reset: resetDeposit,
  } = useWriteContract();
  const {
    isLoading: depositConfirming,
    isSuccess: depositSuccess,
  } = useWaitForTransactionReceipt({ hash: depositHash });

  // Track pending deposit args for chaining after approval
  const pendingDepositRef = useRef<{ amount: string; receiver: `0x${string}` } | null>(null);

  // Chain: once approval is confirmed, fire the deposit
  useEffect(() => {
    if (approveSuccess && pendingDepositRef.current) {
      const { amount, receiver } = pendingDepositRef.current;
      pendingDepositRef.current = null;
      const parsed = parseUnits(amount, 6);
      toast.loading("Depositing USDC...", { id: "deposit" });
      writeDeposit(
        {
          address: CONTRACTS.vault,
          abi: VAULT_ABI,
          functionName: "deposit",
          args: [parsed, receiver],
        },
        {
          onSuccess: () => toast.success("Deposit submitted — confirming...", { id: "deposit" }),
          onError: (err) => toast.error(err.message.split("\n")[0] || "Deposit failed", { id: "deposit" }),
        }
      );
    }
  }, [approveSuccess, writeDeposit]);

  // Toast on deposit confirmed
  const depositToasted = useRef(false);
  useEffect(() => {
    if (depositSuccess && !depositToasted.current) {
      depositToasted.current = true;
      toast.success("Deposit confirmed successfully");
    }
  }, [depositSuccess]);

  // Toast on errors
  useEffect(() => {
    if (approveError) toast.error(approveError.message.split("\n")[0] || "Approval failed", { id: "approve" });
  }, [approveError]);

  useEffect(() => {
    if (depositError) toast.error(depositError.message.split("\n")[0] || "Deposit failed", { id: "deposit" });
  }, [depositError]);

  const approveAndDeposit = (amount: string, receiver: `0x${string}`) => {
    // Reset state from any previous transaction
    resetApprove();
    resetDeposit();
    depositToasted.current = false;
    pendingDepositRef.current = { amount, receiver };

    const parsed = parseUnits(amount, 6);
    toast.loading("Approving USDC...", { id: "approve" });
    writeApprove(
      {
        address: CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.vault, parsed],
      },
      {
        onSuccess: () => toast.success("Approval submitted — waiting for confirmation...", { id: "approve" }),
        onError: (err) => {
          pendingDepositRef.current = null;
          toast.error(err.message.split("\n")[0] || "Approval failed", { id: "approve" });
        },
      }
    );
  };

  return {
    approveAndDeposit,
    isPending: approvePending || depositPending,
    isConfirming: approveConfirming || depositConfirming,
    isSuccess: depositSuccess,
    hash: depositHash,
  };
}

export function useWithdraw() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const toasted = useRef(false);
  useEffect(() => {
    if (isSuccess && !toasted.current) {
      toasted.current = true;
      toast.success("Withdrawal confirmed successfully");
    }
  }, [isSuccess]);

  useEffect(() => {
    if (error) toast.error(error.message.split("\n")[0] || "Transaction failed");
  }, [error]);

  const redeem = (shares: bigint, receiver: `0x${string}`) => {
    reset();
    toasted.current = false;
    toast.loading("Withdrawing...", { id: "withdraw" });
    writeContract(
      {
        address: CONTRACTS.vault,
        abi: VAULT_ABI,
        functionName: "redeem",
        args: [shares, receiver, receiver],
      },
      {
        onSuccess: () => toast.success("Withdrawal submitted — confirming...", { id: "withdraw" }),
        onError: (err) => toast.error(err.message.split("\n")[0] || "Withdrawal failed", { id: "withdraw" }),
      }
    );
  };

  return { redeem, isPending, isConfirming, isSuccess, hash };
}
