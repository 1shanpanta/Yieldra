"use client";

import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { VAULT_ABI, AGGREGATOR_ABI, ERC20_ABI, CONTRACTS } from "@/config/contracts";

export function useVaultStats() {
  const results = useReadContracts({
    contracts: [
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "totalAssets" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "currentAPY" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "currentProtocol" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "paused" },
      { address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "totalSupply" },
    ],
  });

  const totalAssets = results.data?.[0]?.result as bigint | undefined;
  const apyBps = results.data?.[1]?.result as bigint | undefined;
  const protocol = results.data?.[2]?.result as string | undefined;
  const paused = results.data?.[3]?.result as boolean | undefined;
  const totalShares = results.data?.[4]?.result as bigint | undefined;

  return {
    totalAssets: totalAssets ? formatUnits(totalAssets, 6) : "0",
    apyPercent: apyBps ? (Number(apyBps) / 100).toFixed(2) : "0",
    apyBps: apyBps ? Number(apyBps) : 0,
    protocol: protocol || "—",
    paused: paused || false,
    totalShares: totalShares ? formatUnits(totalShares, 6) : "0",
    isLoading: results.isLoading,
    refetch: results.refetch,
  };
}

export function useUserPosition(address: `0x${string}` | undefined) {
  const { data: shares } = useReadContract({
    address: CONTRACTS.vault,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: assets } = useReadContract({
    address: CONTRACTS.vault,
    abi: VAULT_ABI,
    functionName: "convertToAssets",
    args: shares ? [shares] : undefined,
    query: { enabled: !!shares && shares > 0n },
  });

  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  return {
    shares: shares ? formatUnits(shares, 6) : "0",
    sharesRaw: shares || 0n,
    assetsValue: assets ? formatUnits(assets, 6) : "0",
    usdcBalance: usdcBalance ? formatUnits(usdcBalance, 6) : "0",
    usdcBalanceRaw: usdcBalance || 0n,
  };
}

export function useYieldData() {
  const { data: yields, isLoading, refetch } = useReadContract({
    address: CONTRACTS.aggregator,
    abi: AGGREGATOR_ABI,
    functionName: "getAllYields",
  });

  const { data: rebalanceData } = useReadContract({
    address: CONTRACTS.aggregator,
    abi: AGGREGATOR_ABI,
    functionName: "shouldRebalance",
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
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: string) => {
    const parsed = parseUnits(amount, 6);
    writeContract({
      address: CONTRACTS.usdc,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.vault, parsed],
    });
  };

  const deposit = (amount: string, receiver: `0x${string}`) => {
    const parsed = parseUnits(amount, 6);
    writeContract({
      address: CONTRACTS.vault,
      abi: VAULT_ABI,
      functionName: "deposit",
      args: [parsed, receiver],
    });
  };

  return { approve, deposit, isPending, isConfirming, isSuccess, hash };
}

export function useWithdraw() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const redeem = (shares: bigint, receiver: `0x${string}`) => {
    writeContract({
      address: CONTRACTS.vault,
      abi: VAULT_ABI,
      functionName: "redeem",
      args: [shares, receiver, receiver],
    });
  };

  return { redeem, isPending, isConfirming, isSuccess, hash };
}
