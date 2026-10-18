import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerProfile } from './PlayerProfile';
import { PlayerProfile as Profile } from '../hooks/usePlayerProfile';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwx',
    systemsOwned: 3,
    battlesWon: 5,
    battlesLost: 2,
    ...overrides,
  };
}

describe('PlayerProfile', () => {
  it('shows a loading message while loading', () => {
    render(<PlayerProfile profile={null} isLoading={true} error={null} />);

    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
  });

  it('shows the error when the lookup failed', () => {
    render(<PlayerProfile profile={null} isLoading={false} error="Player not found" />);

    expect(screen.getByText('Player not found')).toBeInTheDocument();
  });

  it('shows systems owned and the battle win/loss record', () => {
    render(<PlayerProfile profile={profile()} isLoading={false} error={null} />);

    expect(screen.getByText(/systems owned/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/battles won/i)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/battles lost/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows the full player address', () => {
    render(<PlayerProfile profile={profile({ address: 'GPROFILEADDR' })} isLoading={false} error={null} />);

    expect(screen.getByText('GPROFILEADDR')).toBeInTheDocument();
  });

  it('shows zeroed stats for a player who has never fought', () => {
    render(
      <PlayerProfile
        profile={profile({ systemsOwned: 0, battlesWon: 0, battlesLost: 0 })}
        isLoading={false}
        error={null}
      />
    );

    expect(screen.getByText(/systems owned/i)).toBeInTheDocument();
    expect(screen.getByText(/battles won/i)).toBeInTheDocument();
    expect(screen.getByText(/battles lost/i)).toBeInTheDocument();
  });

  it('does not show loading or error in the happy path', () => {
    render(<PlayerProfile profile={profile()} isLoading={false} error={null} />);

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });
});
