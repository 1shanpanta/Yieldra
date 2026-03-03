"use client";

import { useState } from "react";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { config } from "@/config/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient per-client to prevent SSR data leaking between requests
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#C9A96E",
            accentColorForeground: "#0d0d0d",
            borderRadius: "large",
            overlayBlur: "small",
          })}
        >
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#1a1a1a",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                color: "#e5e5e5",
              },
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
