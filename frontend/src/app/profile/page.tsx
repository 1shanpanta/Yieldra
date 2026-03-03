"use client";

import Header from "@/components/Header";
import ProfilePage from "@/components/ProfilePage";

export default function Profile() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-animated">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
        <ProfilePage />
      </main>

      <footer className="text-center py-6 text-xs text-neutral-600 border-t border-white/5 max-w-6xl mx-auto w-full px-4 sm:px-6">
        Built for Chainlink Convergence Hackathon &middot; ERC-4626 Vault &middot; Chainlink Automation
      </footer>
    </div>
  );
}
