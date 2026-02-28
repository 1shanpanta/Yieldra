"use client";

const steps = [
  {
    num: "01",
    title: "Deposit USDC",
    desc: "Deposit stablecoins into the vault and receive tyUSDC shares representing your position.",
  },
  {
    num: "02",
    title: "Yield Monitored",
    desc: "Chainlink Automation continuously monitors APY across Aave, Compound, and Tokenized Treasuries.",
  },
  {
    num: "03",
    title: "Auto-Rebalance",
    desc: "When a better risk-adjusted yield is found, funds automatically move to the optimal protocol.",
  },
  {
    num: "04",
    title: "Withdraw Anytime",
    desc: "Redeem your tyUSDC shares at any time to receive your USDC plus accumulated yield.",
  },
];

export default function HowItWorks() {
  return (
    <div className="neo-card p-7 flex flex-col gap-5 animate-fade-in stagger-4">
      <h2 className="text-sm font-medium text-neutral-300 tracking-wide">How It Works</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((step) => (
          <div
            key={step.num}
            className="rounded-xl bg-[#0f0f0f] border border-white/[0.03] p-5 flex flex-col gap-2.5"
          >
            <span className="text-[#C9A96E] text-[10px] font-semibold tracking-widest">{step.num}</span>
            <span className="text-sm font-medium text-white">{step.title}</span>
            <span className="text-xs text-neutral-600 leading-relaxed">{step.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
