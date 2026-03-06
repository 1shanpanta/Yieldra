import { cre, type Runtime } from "@chainlink/cre-sdk";
import { z } from "zod";
import { encodeFunctionData, decodeFunctionResult, parseAbi } from "viem";

// ============ CONFIGURATION ============

const ConfigSchema = z.object({
  // Cron schedule for yield monitoring
  schedule: z.string().default("0 0 * * * *"), // Every hour

  // DeFi Llama API for external yield data
  defiLlamaBaseUrl: z.string().default("https://yields.llama.fi"),

  // Protocols to monitor on DeFi Llama (matched against pool.project)
  monitoredProtocols: z.array(z.string()).default(["aave-v3", "compound-v3"]),

  // Stablecoin symbol to filter DeFi Llama pools
  targetSymbol: z.string().default("USDC"),

  // On-chain addresses (Sepolia)
  vaultAddress: z.string(),
  aggregatorAddress: z.string(),

  // Chain configuration
  chainSelector: z.string(), // CRE chain selector for Sepolia

  // Rebalance threshold in basis points (e.g., 50 = 0.5%)
  rebalanceThreshold: z.number().default(50),
});

type Config = z.infer<typeof ConfigSchema>;

// ============ ABI DEFINITIONS ============

const vaultAbi = parseAbi([
  "function activeAdapter() view returns (address)",
  "function paused() view returns (bool)",
  "function rebalance(address newAdapter) external",
  "function lastRebalanceTime() view returns (uint256)",
]);

const aggregatorAbi = parseAbi([
  "function getAdapterCount() view returns (uint256)",
  "function getAdapter(uint256 index) view returns (address)",
]);

const adapterAbi = parseAbi([
  "function protocolName() view returns (string)",
  "function getCurrentAPY() view returns (uint256)",
  "function riskScore() view returns (uint256)",
  "function getTotalDeposited() view returns (uint256)",
  "function isHealthy() view returns (bool)",
]);

// ============ TYPES ============

interface OnchainAdapterData {
  address: string;
  protocolName: string;
  apy: number; // basis points
  riskScore: number;
  riskAdjustedAPY: number;
  deposited: bigint;
  healthy: boolean;
}

interface DefiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase: number | null;
  apyReward: number | null;
  apy: number | null;
}

interface RebalanceDecision {
  shouldRebalance: boolean;
  targetAdapter: string;
  reason: string;
  currentAPY: number;
  targetAPY: number;
}

// ============ DEFI LLAMA INTEGRATION ============

/**
 * Fetch yield data from DeFi Llama's public API.
 * Filters by monitored protocols and target stablecoin.
 */
async function fetchDefiLlamaYields(
  runtime: Runtime,
  config: Config
): Promise<DefiLlamaPool[]> {
  const httpClient = new cre.capabilities.HTTPClient(runtime);

  const response = await httpClient
    .sendRequest({
      url: `${config.defiLlamaBaseUrl}/pools`,
      method: "GET",
      headers: { Accept: "application/json" },
    })
    .result();

  if (!response.ok) {
    runtime.log(`DeFi Llama API error: ${response.statusCode}`);
    return [];
  }

  const bodyText = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(bodyText);
  const allPools: DefiLlamaPool[] = parsed.data || parsed || [];

  // Filter to our monitored protocols and target symbol
  const filtered = allPools.filter(
    (pool) =>
      config.monitoredProtocols.some((p) =>
        pool.project.toLowerCase().includes(p.toLowerCase())
      ) &&
      pool.symbol.toUpperCase().includes(config.targetSymbol.toUpperCase()) &&
      pool.chain.toLowerCase() === "ethereum"
  );

  runtime.log(`DeFi Llama: found ${filtered.length} relevant pools out of ${allPools.length} total`);
  return filtered;
}

// ============ ON-CHAIN READS ============

/**
 * Read all adapter data from the on-chain YieldAggregator.
 */
async function readOnchainAdapters(
  runtime: Runtime,
  config: Config
): Promise<OnchainAdapterData[]> {
  const evmClient = new cre.capabilities.EVMClient(
    runtime,
    BigInt(config.chainSelector)
  );

  // Get adapter count
  const countCalldata = encodeFunctionData({
    abi: aggregatorAbi,
    functionName: "getAdapterCount",
  });

  const countResult = await evmClient
    .callContract({
      address: config.aggregatorAddress,
      data: countCalldata,
      blockTag: "latest",
    })
    .result();

  if (!countResult.ok) {
    runtime.log("Failed to read adapter count");
    return [];
  }

  const adapterCount = decodeFunctionResult({
    abi: aggregatorAbi,
    functionName: "getAdapterCount",
    data: countResult.result as `0x${string}`,
  });

  const count = Number(adapterCount);
  runtime.log(`On-chain: ${count} adapters registered`);

  const adapters: OnchainAdapterData[] = [];

  for (let i = 0; i < count; i++) {
    try {
      // Get adapter address
      const addrCalldata = encodeFunctionData({
        abi: aggregatorAbi,
        functionName: "getAdapter",
        args: [BigInt(i)],
      });

      const addrResult = await evmClient
        .callContract({
          address: config.aggregatorAddress,
          data: addrCalldata,
          blockTag: "latest",
        })
        .result();

      if (!addrResult.ok) continue;

      const adapterAddress = decodeFunctionResult({
        abi: aggregatorAbi,
        functionName: "getAdapter",
        data: addrResult.result as `0x${string}`,
      }) as string;

      // Read adapter data in parallel
      const [nameRes, apyRes, riskRes, depositedRes, healthyRes] =
        await Promise.all([
          evmClient
            .callContract({
              address: adapterAddress,
              data: encodeFunctionData({
                abi: adapterAbi,
                functionName: "protocolName",
              }),
              blockTag: "latest",
            })
            .result(),
          evmClient
            .callContract({
              address: adapterAddress,
              data: encodeFunctionData({
                abi: adapterAbi,
                functionName: "getCurrentAPY",
              }),
              blockTag: "latest",
            })
            .result(),
          evmClient
            .callContract({
              address: adapterAddress,
              data: encodeFunctionData({
                abi: adapterAbi,
                functionName: "riskScore",
              }),
              blockTag: "latest",
            })
            .result(),
          evmClient
            .callContract({
              address: adapterAddress,
              data: encodeFunctionData({
                abi: adapterAbi,
                functionName: "getTotalDeposited",
              }),
              blockTag: "latest",
            })
            .result(),
          evmClient
            .callContract({
              address: adapterAddress,
              data: encodeFunctionData({
                abi: adapterAbi,
                functionName: "isHealthy",
              }),
              blockTag: "latest",
            })
            .result(),
        ]);

      if (
        !nameRes.ok ||
        !apyRes.ok ||
        !riskRes.ok ||
        !depositedRes.ok ||
        !healthyRes.ok
      )
        continue;

      const name = decodeFunctionResult({
        abi: adapterAbi,
        functionName: "protocolName",
        data: nameRes.result as `0x${string}`,
      }) as string;

      const apy = Number(
        decodeFunctionResult({
          abi: adapterAbi,
          functionName: "getCurrentAPY",
          data: apyRes.result as `0x${string}`,
        })
      );

      const riskScore = Number(
        decodeFunctionResult({
          abi: adapterAbi,
          functionName: "riskScore",
          data: riskRes.result as `0x${string}`,
        })
      );

      const deposited = decodeFunctionResult({
        abi: adapterAbi,
        functionName: "getTotalDeposited",
        data: depositedRes.result as `0x${string}`,
      }) as bigint;

      const healthy = decodeFunctionResult({
        abi: adapterAbi,
        functionName: "isHealthy",
        data: healthyRes.result as `0x${string}`,
      }) as boolean;

      adapters.push({
        address: adapterAddress,
        protocolName: name,
        apy,
        riskScore,
        riskAdjustedAPY: (apy * (100 - riskScore)) / 100,
        deposited,
        healthy,
      });
    } catch {
      runtime.log(`Failed to read adapter at index ${i}`);
    }
  }

  return adapters;
}

/**
 * Read the vault's current active adapter address.
 */
async function readCurrentAdapter(
  runtime: Runtime,
  config: Config
): Promise<string> {
  const evmClient = new cre.capabilities.EVMClient(
    runtime,
    BigInt(config.chainSelector)
  );

  const calldata = encodeFunctionData({
    abi: vaultAbi,
    functionName: "activeAdapter",
  });

  const result = await evmClient
    .callContract({
      address: config.vaultAddress,
      data: calldata,
      blockTag: "latest",
    })
    .result();

  if (!result.ok) return "0x0000000000000000000000000000000000000000";

  return decodeFunctionResult({
    abi: vaultAbi,
    functionName: "activeAdapter",
    data: result.result as `0x${string}`,
  }) as string;
}

/**
 * Check if the vault is paused.
 */
async function isVaultPaused(
  runtime: Runtime,
  config: Config
): Promise<boolean> {
  const evmClient = new cre.capabilities.EVMClient(
    runtime,
    BigInt(config.chainSelector)
  );

  const calldata = encodeFunctionData({
    abi: vaultAbi,
    functionName: "paused",
  });

  const result = await evmClient
    .callContract({
      address: config.vaultAddress,
      data: calldata,
      blockTag: "latest",
    })
    .result();

  if (!result.ok) return true; // Fail safe: treat as paused

  return decodeFunctionResult({
    abi: vaultAbi,
    functionName: "paused",
    data: result.result as `0x${string}`,
  }) as boolean;
}

// ============ DECISION ENGINE ============

/**
 * Core rebalancing logic — the "brain" of Yieldra.
 *
 * Combines on-chain adapter data with external DeFi Llama yields
 * to determine the optimal adapter for the vault's funds.
 *
 * Strategy:
 * 1. Read on-chain adapter APYs from the YieldAggregator
 * 2. Cross-reference with DeFi Llama's real-time yield data
 * 3. Compute risk-adjusted APY for each adapter
 * 4. If the best adapter differs from current and exceeds threshold, trigger rebalance
 */
function computeRebalanceDecision(
  onchainAdapters: OnchainAdapterData[],
  defiLlamaData: DefiLlamaPool[],
  currentAdapterAddress: string,
  threshold: number
): RebalanceDecision {
  const noRebalance: RebalanceDecision = {
    shouldRebalance: false,
    targetAdapter: "0x0000000000000000000000000000000000000000",
    reason: "",
    currentAPY: 0,
    targetAPY: 0,
  };

  if (onchainAdapters.length === 0) {
    return { ...noRebalance, reason: "No adapters registered" };
  }

  // Enrich on-chain data with DeFi Llama external yields
  const enrichedAdapters = onchainAdapters.map((adapter) => {
    // Find matching DeFi Llama pool by protocol name
    const llamaMatch = defiLlamaData.find((pool) =>
      adapter.protocolName.toLowerCase().includes(pool.project.toLowerCase()) ||
      pool.project.toLowerCase().includes(adapter.protocolName.toLowerCase().split(" ")[0])
    );

    // Use DeFi Llama APY if available, convert from percentage to basis points
    const externalApyBps = llamaMatch?.apy
      ? Math.round(llamaMatch.apy * 100)
      : 0;

    // Use the higher of on-chain APY or external APY as the "true" yield signal
    // This cross-validation catches stale on-chain feeds
    const bestApyEstimate =
      externalApyBps > 0
        ? Math.round((adapter.apy + externalApyBps) / 2) // Average for stability
        : adapter.apy;

    const riskAdjusted = (bestApyEstimate * (100 - adapter.riskScore)) / 100;

    return {
      ...adapter,
      externalAPY: externalApyBps,
      enrichedAPY: bestApyEstimate,
      enrichedRiskAdjustedAPY: riskAdjusted,
    };
  });

  // Filter to healthy adapters only
  const healthy = enrichedAdapters.filter((a) => a.healthy);
  if (healthy.length === 0) {
    return { ...noRebalance, reason: "No healthy adapters available" };
  }

  // Find the best adapter by enriched risk-adjusted APY
  const best = healthy.reduce((prev, curr) =>
    curr.enrichedRiskAdjustedAPY > prev.enrichedRiskAdjustedAPY ? curr : prev
  );

  // Find current adapter's enriched data
  const current = enrichedAdapters.find(
    (a) => a.address.toLowerCase() === currentAdapterAddress.toLowerCase()
  );

  // If no current adapter is set, always rebalance to the best
  if (
    !current ||
    currentAdapterAddress === "0x0000000000000000000000000000000000000000"
  ) {
    return {
      shouldRebalance: true,
      targetAdapter: best.address,
      reason: `No active adapter. Deploying to ${best.protocolName} (${best.enrichedRiskAdjustedAPY} bps risk-adjusted)`,
      currentAPY: 0,
      targetAPY: best.enrichedRiskAdjustedAPY,
    };
  }

  // Don't rebalance to the same adapter
  if (best.address.toLowerCase() === currentAdapterAddress.toLowerCase()) {
    return {
      ...noRebalance,
      reason: `Best adapter (${best.protocolName}) is already active`,
      currentAPY: current.enrichedRiskAdjustedAPY,
      targetAPY: best.enrichedRiskAdjustedAPY,
    };
  }

  // Check if yield gap exceeds threshold
  const gap = best.enrichedRiskAdjustedAPY - current.enrichedRiskAdjustedAPY;
  if (gap > threshold) {
    return {
      shouldRebalance: true,
      targetAdapter: best.address,
      reason: `${best.protocolName} (${best.enrichedRiskAdjustedAPY} bps) beats ${current.protocolName} (${current.enrichedRiskAdjustedAPY} bps) by ${gap} bps (threshold: ${threshold})`,
      currentAPY: current.enrichedRiskAdjustedAPY,
      targetAPY: best.enrichedRiskAdjustedAPY,
    };
  }

  return {
    ...noRebalance,
    reason: `Gap of ${gap} bps does not exceed threshold of ${threshold} bps`,
    currentAPY: current.enrichedRiskAdjustedAPY,
    targetAPY: best.enrichedRiskAdjustedAPY,
  };
}

// ============ ON-CHAIN WRITE ============

/**
 * Execute rebalance by calling vault.rebalance(targetAdapter) via CRE EVM write.
 */
async function executeRebalance(
  runtime: Runtime,
  config: Config,
  targetAdapter: string
): Promise<boolean> {
  const evmClient = new cre.capabilities.EVMClient(
    runtime,
    BigInt(config.chainSelector)
  );

  const calldata = encodeFunctionData({
    abi: vaultAbi,
    functionName: "rebalance",
    args: [targetAdapter as `0x${string}`],
  });

  const writeResult = await evmClient
    .writeReport({
      receiver: config.vaultAddress,
      report: new Uint8Array(Buffer.from(calldata.slice(2), "hex")),
      gasConfig: {
        gasLimit: "500000",
      },
    })
    .result();

  if (!writeResult.ok) {
    runtime.log(`Rebalance transaction failed: ${writeResult.err}`);
    return false;
  }

  runtime.log(`Rebalance submitted. TX status: ${writeResult.result.txStatus}`);
  return true;
}

// ============ MAIN WORKFLOW ============

/**
 * Main workflow callback — triggered by cron every hour.
 *
 * Flow:
 * 1. Check if vault is paused → abort if so
 * 2. Fetch external yield data from DeFi Llama
 * 3. Read on-chain adapter states from YieldAggregator
 * 4. Read current active adapter from vault
 * 5. Run decision engine (compare yields, apply threshold)
 * 6. If rebalance needed → execute via EVM write
 */
const onYieldCheck = async (
  runtime: Runtime,
  _payload: unknown,
  config: Config
): Promise<string> => {
  runtime.log("=== Yieldra CRE Workflow: Yield Check Started ===");

  // Step 1: Check vault state
  const paused = await isVaultPaused(runtime, config);
  if (paused) {
    runtime.log("Vault is paused. Skipping.");
    return "skipped:paused";
  }

  // Step 2: Fetch external yield data from DeFi Llama
  const defiLlamaData = await fetchDefiLlamaYields(runtime, config);
  runtime.log(
    `DeFi Llama yields: ${defiLlamaData.map((p) => `${p.project}: ${p.apy?.toFixed(2)}%`).join(", ") || "none"}`
  );

  // Step 3: Read on-chain adapter data
  const onchainAdapters = await readOnchainAdapters(runtime, config);
  runtime.log(
    `On-chain adapters: ${onchainAdapters.map((a) => `${a.protocolName}: ${a.apy} bps (risk-adj: ${a.riskAdjustedAPY} bps)`).join(", ")}`
  );

  // Step 4: Read current active adapter
  const currentAdapter = await readCurrentAdapter(runtime, config);
  runtime.log(`Current active adapter: ${currentAdapter}`);

  // Step 5: Run decision engine
  const decision = computeRebalanceDecision(
    onchainAdapters,
    defiLlamaData,
    currentAdapter,
    config.rebalanceThreshold
  );

  runtime.log(`Decision: ${decision.reason}`);

  // Step 6: Execute rebalance if needed
  if (decision.shouldRebalance) {
    runtime.log(
      `Executing rebalance to ${decision.targetAdapter} (${decision.targetAPY} bps risk-adjusted APY)`
    );
    const success = await executeRebalance(
      runtime,
      config,
      decision.targetAdapter
    );
    return success ? "rebalanced" : "failed";
  }

  runtime.log("No rebalance needed.");
  return "no-action";
};

// ============ WORKFLOW INIT ============

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handler(cron.trigger({ schedule: config.schedule }), (runtime, payload) =>
      onYieldCheck(runtime, payload, config)
    ),
  ];
};

// ============ ENTRY POINT ============

async function main() {
  const configJson = process.env.CONFIG_JSON;
  if (!configJson) {
    throw new Error("CONFIG_JSON environment variable not set");
  }

  const config = ConfigSchema.parse(JSON.parse(configJson));

  const runner = cre.Runner.newRunner<Config>(ConfigSchema, initWorkflow);

  await runner.run(config);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
