"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, hardhat } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Treasury Yield Vault",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo",
  chains: [sepolia, hardhat],
  ssr: true,
});
