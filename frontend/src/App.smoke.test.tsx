/**
 * Composition-level smoke test — renders the full <App /> with every hook
 * mocked and asserts the overall structure is correct in both the disconnected
 * and connected states.
 *
 * A broken prop wiring between App and GameView (e.g. a renamed prop or a
 * missing pass-through) will fail this test even if every unit test still
 * passes, because each unit test exercises pieces in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── useStellar mock ───────────────────────────────────────────────────────────

const mockConnectWallet = vi.fn().mockResolvedValue(undefined);
const mockSignTransaction = vi.fn().mockResolvedValue('SIGNED');

const stellarState = {
  walletAddress: null as string | null,
  isConnected: false,
  error: null as string | null,
  connectWallet: mockConnectWallet,
  signTransaction: mockSignTransaction,
};

vi.mock('./hooks/useStellar', () => ({
  useStellar: vi.fn(() => stellarState),
}));

// ── useGalaxyData mock ────────────────────────────────────────────────────────

vi.mock('./hooks/useGalaxyData', () => ({
  useGalaxyData: vi.fn(() => ({
    systems: [],
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ── useFleetData mock ─────────────────────────────────────────────────────────

vi.mock('./hooks/useFleetData', () => ({
  useFleetData: vi.fn(() => ({
    fleet: null,
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ── useResourceBalances mock ──────────────────────────────────────────────────

vi.mock('./hooks/useResourceBalances', () => ({
  useResourceBalances: vi.fn(() => ({
    balances: null,
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ── useRecentBattles mock ─────────────────────────────────────────────────────

vi.mock('./hooks/useRecentBattles', () => ({
  useRecentBattles: vi.fn(() => ({
    battles: [],
    isLoading: false,
    error: null,
    hasPreviousPage: false,
    hasNextPage: false,
    goToNextPage: vi.fn(),
    goToPreviousPage: vi.fn(),
  })),
}));

// ── useTrustlines mock — captured so we can inspect call arguments ─────────────

const mockUseTrustlines = vi.fn(() => ({
  missing: [],
  isSettingUp: false,
  error: null,
  setUpTrustlines: vi.fn(),
}));

vi.mock('./hooks/useTrustlines', () => ({
  useTrustlines: mockUseTrustlines,
}));

// ── SDK & starboundClient mocks ───────────────────────────────────────────────

vi.mock('@starbound-realms/sdk', () => ({
  GalaxyClient: vi.fn(),
  FleetClient: vi.fn(),
  BattleClient: vi.fn(),
  ResourcesClient: vi.fn().mockImplementation(() => ({
    getAllBalances: vi.fn().mockResolvedValue(null),
    findMissingTrustlines: vi.fn().mockResolvedValue([]),
    establishTrustlines: vi.fn(),
  })),
  UnitType: { Scout: 'Scout', Fighter: 'Fighter', Cruiser: 'Cruiser', Dreadnought: 'Dreadnought' },
}));

vi.mock('./lib/starboundClient', () => ({
  getStarboundClient: vi.fn().mockReturnValue({ networkPassphrase: 'Test SDF Network ; September 2015' }),
  getResourceIssuer: vi.fn().mockReturnValue('GISSUER'),
}));

// ── Minimal child component stubs ─────────────────────────────────────────────

vi.mock('./components/GalaxyMap', () => ({
  GalaxyMap: () => <div data-testid="galaxy-map" />,
}));

vi.mock('./components/StarSystem', () => ({
  StarSystem: () => null,
}));

vi.mock('./components/Fleet', () => ({
  Fleet: () => <div data-testid="fleet" />,
}));

vi.mock('./components/ResourceBalances', () => ({
  ResourceBalances: () => <div data-testid="resource-balances" />,
}));

vi.mock('./components/BattleFeed', () => ({
  BattleFeed: () => <div data-testid="battle-feed" />,
}));

vi.mock('./components/ResourceSetupBanner', () => ({
  ResourceSetupBanner: () => <div data-testid="resource-setup-banner" />,
}));

// ── Component under test ──────────────────────────────────────────────────────

import App from './App';

beforeEach(() => {
  vi.clearAllMocks();
  stellarState.walletAddress = null;
  stellarState.isConnected = false;
  stellarState.error = null;
  // Restore the default return value after clearAllMocks resets it.
  mockUseTrustlines.mockReturnValue({
    missing: [],
    isSettingUp: false,
    error: null,
    setUpTrustlines: vi.fn(),
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App — composition smoke tests', () => {
  it('renders without errors in the disconnected state', () => {
    render(<App />);

    // Nav and hero are always visible
    expect(screen.getByText(/starbound realms/i)).toBeInTheDocument();
    expect(screen.getByText(/conquer the galaxy/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect freighter/i })).toBeInTheDocument();

    // Game UI is hidden until connected
    expect(screen.queryByTestId('galaxy-map')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fleet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-balances')).not.toBeInTheDocument();
  });

  it('renders without errors in the connected state and mounts all game children', () => {
    stellarState.walletAddress = 'GPLAYER';
    stellarState.isConnected = true;

    render(<App />);

    // Landing content is still visible
    expect(screen.getByText(/conquer the galaxy/i)).toBeInTheDocument();

    // GameView children are now mounted
    expect(screen.getByTestId('galaxy-map')).toBeInTheDocument();
    expect(screen.getByTestId('fleet')).toBeInTheDocument();
    expect(screen.getByTestId('resource-balances')).toBeInTheDocument();
    expect(screen.getByTestId('battle-feed')).toBeInTheDocument();
    expect(screen.getByTestId('resource-setup-banner')).toBeInTheDocument();
  });

  it('passes walletAddress down to GameView — a prop-name typo would cause useTrustlines to receive undefined', () => {
    stellarState.walletAddress = 'GPLAYER_UNIQUE';
    stellarState.isConnected = true;

    render(<App />);

    // useTrustlines is called inside GameView with the walletAddress prop.
    // A miswired prop (e.g. wallet instead of walletAddress) means the hook
    // gets undefined and this assertion fails.
    expect(mockUseTrustlines).toHaveBeenCalledWith('GPLAYER_UNIQUE', expect.any(Function));
  });

  it('passes signTransaction down to GameView — a prop-name typo would cause useTrustlines to receive undefined', () => {
    stellarState.walletAddress = 'GPLAYER';
    stellarState.isConnected = true;

    render(<App />);

    // The second argument to useTrustlines is the signTransaction function.
    // If the prop is miswired, the hook receives undefined instead of a function.
    const [, receivedSignTransaction] = mockUseTrustlines.mock.calls[0];
    expect(typeof receivedSignTransaction).toBe('function');
  });

  it('does not mount game children when only isConnected is true but walletAddress is null', () => {
    // Guard: both walletAddress and isConnected must be truthy before GameView renders.
    stellarState.walletAddress = null;
    stellarState.isConnected = true;

    render(<App />);

    expect(screen.queryByTestId('galaxy-map')).not.toBeInTheDocument();
  });
});
