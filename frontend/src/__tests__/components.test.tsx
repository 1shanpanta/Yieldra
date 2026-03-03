/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock wagmi and RainbowKit before any component imports
vi.mock("wagmi", () => ({
  useAccount: vi.fn(() => ({ address: undefined })),
  useReadContract: vi.fn(() => ({ data: undefined, isLoading: false, refetch: vi.fn() })),
  useReadContracts: vi.fn(() => ({ data: undefined, isLoading: false, refetch: vi.fn() })),
  useWriteContract: vi.fn(() => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  })),
  useWaitForTransactionReceipt: vi.fn(() => ({
    isLoading: false,
    isSuccess: false,
  })),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button data-testid="connect-button">Connect Wallet</button>,
  RainbowKitProvider: ({ children }: { children: React.ReactNode }) => children,
  darkTheme: () => ({}),
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
  QueryClient: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

describe("Header component", () => {
  it("renders the Yieldra branding", async () => {
    const { default: Header } = await import("@/components/Header");
    render(<Header />);

    expect(screen.getByText("Yieldra")).toBeInTheDocument();
    expect(screen.getByText("Chainlink")).toBeInTheDocument();
  });

  it("renders with banner role", async () => {
    const { default: Header } = await import("@/components/Header");
    render(<Header />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders connect button in nav", async () => {
    const { default: Header } = await import("@/components/Header");
    render(<Header />);

    expect(screen.getByRole("navigation", { name: /wallet/i })).toBeInTheDocument();
    expect(screen.getByTestId("connect-button")).toBeInTheDocument();
  });

  it("has accessible logo link", async () => {
    const { default: Header } = await import("@/components/Header");
    render(<Header />);

    const link = screen.getByLabelText("Yieldra home");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});

describe("HowItWorks component", () => {
  it("renders all 4 steps", async () => {
    const { default: HowItWorks } = await import("@/components/HowItWorks");
    render(<HowItWorks />);

    expect(screen.getByText("Deposit USDC")).toBeInTheDocument();
    expect(screen.getByText("Yield Monitored")).toBeInTheDocument();
    expect(screen.getByText("Auto-Rebalance")).toBeInTheDocument();
    expect(screen.getByText("Withdraw Anytime")).toBeInTheDocument();
  });

  it("renders step numbers", async () => {
    const { default: HowItWorks } = await import("@/components/HowItWorks");
    render(<HowItWorks />);

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();
  });

  it("has section with aria-labelledby heading", async () => {
    const { default: HowItWorks } = await import("@/components/HowItWorks");
    render(<HowItWorks />);

    const section = screen.getByRole("region", { name: /how it works/i });
    expect(section).toBeInTheDocument();
  });

  it("renders step descriptions", async () => {
    const { default: HowItWorks } = await import("@/components/HowItWorks");
    render(<HowItWorks />);

    expect(screen.getByText(/receive tyUSDC shares/i)).toBeInTheDocument();
    expect(screen.getByText(/Chainlink Automation/i)).toBeInTheDocument();
    expect(screen.getByText(/risk-adjusted yield/i)).toBeInTheDocument();
    expect(screen.getByText(/Redeem your tyUSDC/i)).toBeInTheDocument();
  });
});

describe("DepositPanel — not connected (demo mode)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows demo badge and manage position when not connected", async () => {
    const wagmi = await import("wagmi");
    vi.mocked(wagmi.useAccount).mockReturnValue({
      address: undefined,
      addresses: undefined,
      chain: undefined,
      chainId: undefined,
      connector: undefined,
      isConnected: false,
      isConnecting: false,
      isDisconnected: true,
      isReconnecting: false,
      status: "disconnected",
    });

    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    expect(screen.getByText("DEMO")).toBeInTheDocument();
    expect(screen.getByText("Manage Position")).toBeInTheDocument();
    expect(screen.getByText("Connect Wallet to Deposit")).toBeInTheDocument();
  });
});

describe("DepositPanel — connected", () => {
  const mockAddress = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;

  beforeEach(async () => {
    vi.resetModules();

    const wagmi = await import("wagmi");
    vi.mocked(wagmi.useAccount).mockReturnValue({
      address: mockAddress,
      addresses: [mockAddress],
      chain: undefined,
      chainId: 31337,
      connector: undefined,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      status: "connected",
    } as any);

    vi.mocked(wagmi.useReadContracts).mockReturnValue({
      data: [
        { result: 10000000000n, status: "success" }, // totalAssets: 10000 USDC
        { result: 450n, status: "success" }, // currentAPY: 450 bps
        { result: "Aave V3", status: "success" },
        { result: false, status: "success" }, // paused
        { result: 10000000000000000n, status: "success" }, // totalSupply
        { result: 0n, status: "success" }, // depositCap (0 = unlimited)
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    vi.mocked(wagmi.useReadContract).mockImplementation((args: any) => {
      if (args?.functionName === "balanceOf" && args?.abi?.[0]?.name === "approve") {
        return { data: 50000000000n, isLoading: false, refetch: vi.fn() } as any;
      }
      if (args?.functionName === "balanceOf") {
        return { data: 50000000000n, isLoading: false, refetch: vi.fn() } as any;
      }
      if (args?.functionName === "convertToAssets") {
        return { data: 5000000000n, isLoading: false, refetch: vi.fn() } as any;
      }
      return { data: undefined, isLoading: false, refetch: vi.fn() } as any;
    });

    vi.mocked(wagmi.useWriteContract).mockReturnValue({
      writeContract: vi.fn(),
      data: undefined,
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as any);

    vi.mocked(wagmi.useWaitForTransactionReceipt).mockReturnValue({
      isLoading: false,
      isSuccess: false,
    } as any);
  });

  it("renders Manage Position heading", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    expect(screen.getByText("Manage Position")).toBeInTheDocument();
  });

  it("renders deposit and withdraw tabs", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    expect(screen.getByRole("tab", { name: /deposit/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /withdraw/i })).toBeInTheDocument();
  });

  it("has deposit tab selected by default", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    const depositTab = screen.getByRole("tab", { name: /deposit/i });
    expect(depositTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders deposit amount input", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    const input = screen.getByLabelText(/^deposit amount in usdc$/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("inputMode", "decimal");
  });

  it("renders MAX button", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    expect(screen.getByLabelText(/maximum deposit/i)).toBeInTheDocument();
  });

  it("renders deposit button", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    expect(screen.getByLabelText(/deposit usdc/i)).toBeInTheDocument();
  });

  it("switches to withdraw tab", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    const withdrawTab = screen.getByRole("tab", { name: /withdraw/i });
    await userEvent.click(withdrawTab);

    expect(withdrawTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/withdraw all/i)).toBeInTheDocument();
  });

  it("has proper tabpanel structure", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    const tabpanel = screen.getByRole("tabpanel");
    expect(tabpanel).toBeInTheDocument();
  });

  it("has tablist with label", async () => {
    const { default: DepositPanel } = await import("@/components/DepositPanel");
    render(<DepositPanel selectedProtocol={null} />);

    const tablist = screen.getByRole("tablist", { name: /deposit or withdraw/i });
    expect(tablist).toBeInTheDocument();
  });
});

describe("VaultStats — loading state", () => {
  beforeEach(async () => {
    vi.resetModules();
    const wagmi = await import("wagmi");
    vi.mocked(wagmi.useReadContracts).mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    } as any);
  });

  it("shows loading skeleton", async () => {
    const { default: VaultStats } = await import("@/components/VaultStats");
    render(<VaultStats />);

    const container = screen.getByLabelText("Loading vault stats");
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute("aria-busy", "true");
  });
});

describe("VaultStats — loaded state", () => {
  beforeEach(async () => {
    vi.resetModules();
    const wagmi = await import("wagmi");
    vi.mocked(wagmi.useReadContracts).mockReturnValue({
      data: [
        { result: 50000000000n, status: "success" },
        { result: 450n, status: "success" },
        { result: "Aave V3", status: "success" },
        { result: false, status: "success" },
        { result: 50000000000000000n, status: "success" },
        { result: 0n, status: "success" },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as any);
  });

  it("displays Total Value Locked", async () => {
    const { default: VaultStats } = await import("@/components/VaultStats");
    render(<VaultStats />);

    expect(screen.getByText("Total Value Locked")).toBeInTheDocument();
    expect(screen.getByText("$50,000.00")).toBeInTheDocument();
  });

  it("displays Current APY", async () => {
    const { default: VaultStats } = await import("@/components/VaultStats");
    render(<VaultStats />);

    expect(screen.getByText("Current APY")).toBeInTheDocument();
    expect(screen.getByText("4.50%")).toBeInTheDocument();
  });

  it("displays Active Protocol", async () => {
    const { default: VaultStats } = await import("@/components/VaultStats");
    render(<VaultStats />);

    expect(screen.getByText("Active Protocol")).toBeInTheDocument();
    expect(screen.getByText("Aave V3")).toBeInTheDocument();
  });

  it("displays Vault Status as Active", async () => {
    const { default: VaultStats } = await import("@/components/VaultStats");
    render(<VaultStats />);

    expect(screen.getByText("Vault Status")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Accepting deposits")).toBeInTheDocument();
  });
});
