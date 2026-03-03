"use client";

import { useState } from "react";
import Header from "@/components/Header";
import VaultStats from "@/components/VaultStats";
import DepositPanel from "@/components/DepositPanel";
import YieldTable from "@/components/YieldTable";
import ApyChart from "@/components/ApyChart";
import HowItWorks from "@/components/HowItWorks";

export interface SelectedProtocol {
  name: string;
  apyBps: number;
  riskAdjBps: number;
  riskScore: number;
  adapter: `0x${string}`;
}

export default function Home() {
  const [selectedProtocol, setSelectedProtocol] = useState<SelectedProtocol | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-animated">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-6 md:gap-8">
        {/* Stats Row */}
        <VaultStats />

        {/* Main Content: Yield Table + Deposit Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <YieldTable
              selectedAdapter={selectedProtocol?.adapter ?? null}
              onSelect={setSelectedProtocol}
            />
            <ApyChart />
          </div>
          <div>
            <DepositPanel selectedProtocol={selectedProtocol} />
          </div>
        </div>

        {/* How It Works */}
        <HowItWorks />
      </main>

      <footer className="text-center py-6 text-xs text-neutral-600 border-t border-white/5 max-w-6xl mx-auto w-full px-4 sm:px-6">
        Built for Chainlink Convergence Hackathon &middot; ERC-4626 Vault &middot; Chainlink Automation
      </footer>
    </div>
  );
}
