"use client";

import { useEffect, useState, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useVaultStats, useYieldData } from "@/hooks/useVault";

interface ApySnapshot {
  time: string;
  apy: number;
  protocol: string;
}

function generateSimulatedHistory(
  apyBps: number,
  protocol: string,
  yields: readonly { protocolName: string; riskAdjustedAPY: bigint }[],
): ApySnapshot[] {
  const now = Date.now();
  const simulated: ApySnapshot[] = [];
  const protocols = yields.map((y) => ({
    name: y.protocolName,
    apy: Number(y.riskAdjustedAPY) / 100,
  }));

  for (let i = 11; i >= 0; i--) {
    const t = new Date(now - i * 2 * 60 * 60 * 1000);
    const timeStr = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const baseApy = apyBps / 100;
    const variation = (Math.random() - 0.5) * 0.3;
    simulated.push({
      time: timeStr,
      apy: Math.max(0, +(baseApy + variation).toFixed(2)),
      protocol: protocols.length > 0
        ? protocols[Math.floor(Math.random() * protocols.length)].name
        : protocol,
    });
  }

  simulated.push({
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    apy: +(apyBps / 100).toFixed(2),
    protocol,
  });

  return simulated;
}

export default function ApyChart() {
  const { apyBps, protocol } = useVaultStats();
  const { yields } = useYieldData();
  const [history, setHistory] = useState<ApySnapshot[]>([]);
  const initialized = useRef(false);

  // Build initial simulated history and append live data
  useEffect(() => {
    if (apyBps === 0 || !protocol || protocol === "—") return;

    if (!initialized.current && yields.length > 0) {
      initialized.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time initialization with impure Date/Math calls requires effect
      setHistory(generateSimulatedHistory(apyBps, protocol, yields));
    } else if (initialized.current) {
      setHistory((prev) => {
        const newPoint: ApySnapshot = {
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          apy: +(apyBps / 100).toFixed(2),
          protocol,
        };
        return [...prev, newPoint].slice(-24);
      });
    }
  }, [apyBps, protocol, yields]);

  if (history.length < 2) {
    return (
      <div className="neo-card p-7 animate-fade-in stagger-2">
        <h2 className="text-sm font-medium text-neutral-300 tracking-wide mb-4">APY History</h2>
        <div className="h-48 flex items-center justify-center text-neutral-600 text-sm">
          Collecting data...
        </div>
      </div>
    );
  }

  return (
    <div className="neo-card p-7 flex flex-col gap-4 animate-fade-in stagger-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-300 tracking-wide">APY History</h2>
        <span className="text-[11px] text-neutral-600">Last 24h (simulated)</span>
      </div>
      <div className="h-48" role="img" aria-label={`APY history chart showing current rate of ${history[history.length - 1]?.apy}%`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="apyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C9A96E" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#C9A96E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fill: "#555", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#555", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={["dataMin - 0.2", "dataMax + 0.2"]}
              tickFormatter={(val) => `${val}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                fontSize: 12,
                color: "#e5e5e5",
              }}
              formatter={(value: number | undefined) => [`${value ?? 0}%`, "Risk-Adj APY"]}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Area
              type="monotone"
              dataKey="apy"
              stroke="#C9A96E"
              strokeWidth={2}
              fill="url(#apyGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
