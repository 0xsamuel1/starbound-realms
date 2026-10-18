import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

// ── GameView mock — keeps App tests focused on landing + wallet wiring ─────────

vi.mock('./components/GameView', () => ({
  GameView: ({ walletAddress }: { walletAddress: string }) => (
    <div data-testid="game-view" data-wallet={walletAddress} />
  ),
}));

// ── useLeaderboard mock — leaderboard tab tests don't need a real fetch ─────────

vi.mock('./hooks/useLeaderboard', () => ({
  useLeaderboard: vi.fn(() => ({
    players: [
      { address: 'GTOPPLAYER', systemsOwned: 9, battlesWon: 4, battlesLost: 0 },
    ],
    isLoading: false,
    error: null,
  })),
}));

// ── Component under test ──────────────────────────────────────────────────────

import App from './App';

beforeEach(() => {
  vi.clearAllMocks();
  stellarState.walletAddress = null;
  stellarState.isConnected = false;
  stellarState.error = null;
  mockConnectWallet.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App — landing page', () => {
  it('renders the hero heading on first load', () => {
    render(<App />);

    expect(screen.getByText(/conquer the galaxy/i)).toBeInTheDocument();
  });

  it('renders the Connect Freighter button when no wallet is connected', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /connect freighter/i })).toBeInTheDocument();
  });

  it('does not render GameView when no wallet is connected', () => {
    render(<App />);

    expect(screen.queryByTestId('game-view')).not.toBeInTheDocument();
  });
});

describe('App — wallet connection', () => {
  it('clicking Connect Freighter calls connectWallet', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /connect freighter/i }));

    expect(mockConnectWallet).toHaveBeenCalledOnce();
  });

  it('shows the connected wallet badge and hides the Connect button when connected', () => {
    stellarState.walletAddress = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    stellarState.isConnected = true;

    render(<App />);

    expect(screen.queryByRole('button', { name: /connect freighter/i })).not.toBeInTheDocument();
    expect(screen.getByText(/✓ Connected/)).toBeInTheDocument();
  });

  it('renders GameView with the connected wallet address once connected', () => {
    stellarState.walletAddress = 'GPLAYER123';
    stellarState.isConnected = true;

    render(<App />);

    const gameView = screen.getByTestId('game-view');
    expect(gameView).toBeInTheDocument();
    expect(gameView.getAttribute('data-wallet')).toBe('GPLAYER123');
  });

  it('surfaces a walletError when useStellar reports one', () => {
    stellarState.walletAddress = null;
    stellarState.isConnected = false;
    stellarState.error = 'Freighter access request was declined';

    render(<App />);

    expect(screen.getByRole('alert')).toHaveTextContent(/declined/i);
  });

  it('does not render GameView when walletAddress is null even if isConnected is true', () => {
    // Edge case: isConnected flag may be briefly true before the address resolves.
    stellarState.walletAddress = null;
    stellarState.isConnected = true;

    render(<App />);

    expect(screen.queryByTestId('game-view')).not.toBeInTheDocument();
  });
});

describe('App — leaderboard tab', () => {
  it('hides the leaderboard by default', () => {
    render(<App />);

    expect(screen.queryByLabelText('Leaderboard')).not.toBeInTheDocument();
  });

  it('shows real leaderboard data when the Leaderboard nav item is clicked', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));

    const leaderboard = screen.getByLabelText('Leaderboard');
    expect(leaderboard).toBeInTheDocument();
    expect(screen.getByText('GTOPPLAYER')).toBeInTheDocument();
    expect(screen.getByText('9 systems')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
  });

  it('toggles the leaderboard closed when clicked again', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(screen.getByLabelText('Leaderboard')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(screen.queryByLabelText('Leaderboard')).not.toBeInTheDocument();
  });
});
