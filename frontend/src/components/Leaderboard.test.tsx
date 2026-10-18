import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Leaderboard } from './Leaderboard';
import { LeaderboardEntry } from '../hooks/useLeaderboard';

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwx',
    systemsOwned: 5,
    battlesWon: 3,
    battlesLost: 1,
    ...overrides,
  };
}

describe('Leaderboard', () => {
  it('shows a loading message while loading', () => {
    render(<Leaderboard players={[]} isLoading={true} error={null} />);

    expect(screen.getByText(/loading leaderboard/i)).toBeInTheDocument();
  });

  it('shows the error when the fetch failed', () => {
    render(<Leaderboard players={[]} isLoading={false} error="failed to fetch leaderboard: 429" />);

    expect(screen.getByText(/failed to fetch leaderboard/i)).toBeInTheDocument();
  });

  it('lists each player with rank, systems owned and battle record', () => {
    render(
      <Leaderboard
        players={[
          entry({ address: 'GTOPPLAYER', systemsOwned: 9, battlesWon: 4, battlesLost: 0 }),
          entry({ address: 'GSECONDPLACE', systemsOwned: 3, battlesWon: 1, battlesLost: 2 }),
        ]}
        isLoading={false}
        error={null}
      />
    );

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('GTOPPLAYER')).toBeInTheDocument();
    expect(screen.getByText('GSECON...LACE')).toBeInTheDocument();
    expect(screen.getByText('9 systems')).toBeInTheDocument();
    expect(screen.getByText('3 systems')).toBeInTheDocument();
    expect(screen.getByText('4W')).toBeInTheDocument();
    expect(screen.getByText('0L')).toBeInTheDocument();
    expect(screen.getByText('1W')).toBeInTheDocument();
    expect(screen.getByText('2L')).toBeInTheDocument();
  });

  it('shows an empty state when there are no players yet', () => {
    render(<Leaderboard players={[]} isLoading={false} error={null} />);

    expect(screen.getByText(/no players yet/i)).toBeInTheDocument();
  });

  it('does not show loading or error in the happy path', () => {
    render(<Leaderboard players={[entry()]} isLoading={false} error={null} />);

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });
});
