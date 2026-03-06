"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { toast } from "sonner";
import { VAULT_ABI, AGGREGATOR_ABI, ERC20_ABI, CONTRACTS } from "@/config/contracts";

const POLL_INTERVAL = 15_000; // 15s refresh

// Mock data shown when contracts aren't available
const MOCK = {
  totalAssets: 197_000_000_000n,   // $197,000 USDC
  apyBps: 450n,                    // 4.50%
  protocol: "Aave V3",
  paused: false,
  totalShares: 195_000_000_000n,
  depositCap: 0n,                  // unlimited
  usdcBalance: 50_000_000_000n,    // 50,000 USDC
  shares: 12_500_000_000n,         // 12,500 tyUSDC
  assetsValue: 12_750_000_000n,    // $12,750 USDC
  yields: [
    { adapter: "0x0000000000000000000000000000000000000001" as `0x${string}`, protocolName: "Aave V3", apy: 480n, riskScore: 3n, riskAdjustedAPY: 465n, deposited: 197_000_000_000n },
    { adapter: "0x0000000000000000000000000000000000000002" as `0x${string}`, protocolName: "Compound V3", apy: 420n, riskScore: 4n, riskAdjustedAPY: 403n, deposited: 0n },
    { adapter: "0x0000000000000000000000000000000000000003" as `0x${string}`, protocolName: "Spark Lend", apy: 510n, riskScore: 8n, riskAdjustedAPY: 469n, deposited: 0n },
  ],
} as const;

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

  // Contract data is available when the results array has a successful status
  const hasLiveData = results.data?.[0]?.status === "success";
  const totalAssets = hasLiveData ? (results.data![0].result as bigint) : MOCK.totalAssets;
  const apyBps = hasLiveData ? (results.data![1].result as bigint) : MOCK.apyBps;
  const protocol = hasLiveData ? (results.data![2].result as string) : MOCK.protocol;
  const paused = hasLiveData ? (results.data![3].result as boolean) : MOCK.paused;
  const totalShares = hasLiveData ? (results.data![4].result as bigint) : MOCK.totalShares;
  const depositCap = hasLiveData ? (results.data![5].result as bigint) : MOCK.depositCap;

  return {
    totalAssets: formatUnits(totalAssets, 6),
    totalAssetsRaw: totalAssets,
    apyPercent: (Number(apyBps) / 100).toFixed(2),
    apyBps: Number(apyBps),
    protocol: protocol || "—",
    paused: paused || false,
    totalShares: formatUnits(totalShares, 6),
    depositCap: formatUnits(depositCap, 6),
    depositCapRaw: depositCap,
    isLoading: hasLiveData ? false : results.isLoading,
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

  // Use mock data when no wallet is connected
  const mockShares = !address ? MOCK.shares : undefined;
  const mockAssets = !address ? MOCK.assetsValue : undefined;
  const mockBalance = !address ? MOCK.usdcBalance : undefined;

  return {
    shares: shares ? formatUnits(shares, 6) : mockShares ? formatUnits(mockShares, 6) : "0",
    sharesRaw: shares || mockShares || 0n,
    assetsValue: assets ? formatUnits(assets, 6) : mockAssets ? formatUnits(mockAssets, 6) : "0",
    usdcBalance: usdcBalance ? formatUnits(usdcBalance, 6) : mockBalance ? formatUnits(mockBalance, 6) : "0",
    usdcBalanceRaw: usdcBalance || mockBalance || 0n,
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

  // Fall back to mock yields when contract data isn't available
  const resolvedYields = yields && yields.length > 0 ? yields : MOCK.yields;
  const hasMockFallback = !yields || yields.length === 0;

  return {
    yields: resolvedYields,
    isLoading: hasMockFallback ? false : isLoading,
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
