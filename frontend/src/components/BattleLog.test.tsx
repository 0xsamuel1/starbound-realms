import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BattleLog } from './BattleLog';
import { PlayerBattle } from '../hooks/useBattleHistory';

const MY_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwx';
const ENEMY_ADDRESS = 'ZYXWVUTSRQPONMLKJIHGFEDCBA0987654321zyxwvutsrqponmlkjihgfedcba';

function battle(overrides: Partial<PlayerBattle> = {}): PlayerBattle {
  return {
    battleId: 12,
    attacker: MY_ADDRESS,
    defender: ENEMY_ADDRESS,
    systemId: 4,
    winner: MY_ADDRESS,
    rounds: 3,
    ledgerSequence: 5000,
    createdAt: Date.parse('2026-10-01T12:00:00.000Z'),
    ...overrides,
  };
}

describe('BattleLog', () => {
  it('shows a loading message while loading', () => {
    render(<BattleLog battles={[]} isLoading={true} error={null} playerAddress={MY_ADDRESS} />);

    expect(screen.getByText(/loading battle history/i)).toBeInTheDocument();
  });

  it('shows the error when the fetch failed', () => {
    render(
      <BattleLog
        battles={[]}
        isLoading={false}
        error="failed to fetch battle history: 500"
        playerAddress={MY_ADDRESS}
      />
    );

    expect(screen.getByText(/failed to fetch battle history/i)).toBeInTheDocument();
  });

  it('shows an empty state for a player with no battles', () => {
    render(<BattleLog battles={[]} isLoading={false} error={null} playerAddress={MY_ADDRESS} />);

    expect(screen.getByText(/no battles yet/i)).toBeInTheDocument();
  });

  it('lists every past battle with attacker, defender, system, winner and rounds', () => {
    render(
      <BattleLog
        battles={[
          battle({ battleId: 14, rounds: 2 }),
          battle({ battleId: 13, winner: ENEMY_ADDRESS, rounds: 5, systemId: 9 }),
        ]}
        isLoading={false}
        error={null}
        playerAddress={MY_ADDRESS}
      />
    );

    // Both battles are listed, not just the most recent one.
    expect(screen.getByText(/battle #14/i)).toBeInTheDocument();
    expect(screen.getByText(/battle #13/i)).toBeInTheDocument();

    expect(screen.getAllByText(/attacked/i)).toHaveLength(2);
    expect(screen.getAllByText(/system 4/)).toHaveLength(1);
    expect(screen.getAllByText(/system 9/)).toHaveLength(1);
    expect(screen.getAllByText(/won in 2 round/i)).toHaveLength(1);
    expect(screen.getAllByText(/won in 5 round/i)).toHaveLength(1);
  });

  it('marks each battle as a victory or a defeat relative to the viewed player', () => {
    render(
      <BattleLog
        battles={[
          battle({ battleId: 14, winner: MY_ADDRESS }),
          battle({ battleId: 13, winner: ENEMY_ADDRESS }),
        ]}
        isLoading={false}
        error={null}
        playerAddress={MY_ADDRESS}
      />
    );

    expect(screen.getByText(/victory/i)).toBeInTheDocument();
    expect(screen.getByText(/defeat/i)).toBeInTheDocument();
  });

  it('does not show loading or error in the happy path', () => {
    render(<BattleLog battles={[battle()]} isLoading={false} error={null} playerAddress={MY_ADDRESS} />);

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });
});
