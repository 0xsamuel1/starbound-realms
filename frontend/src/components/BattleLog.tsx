import React from 'react';
import { PlayerBattle } from '../hooks/useBattleHistory';
import { truncateAddress } from '../lib/format';
import { LoadingIndicator } from './LoadingIndicator';

const styles: Record<string, React.CSSProperties> = {
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  item: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    color: 'var(--text)',
  },
  meta: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    marginTop: '0.25rem',
  },
  victory: {
    color: 'var(--green)',
    fontWeight: 700,
  },
  defeat: {
    color: 'var(--red)',
    fontWeight: 700,
  },
  textMuted: {
    color: 'var(--text-muted)',
    fontSize: '0.9rem',
  },
};

export interface BattleLogProps {
  battles: PlayerBattle[];
  isLoading: boolean;
  error: string | null;
  /** The viewed player's address — each battle is framed as their victory or defeat. */
  playerAddress: string;
}

/**
 * Lists a player's full battle history from `GET /player/:address/battles`,
 * newest first: attacker, defender, system, winner, and rounds, with each
 * outcome framed as a victory or defeat for `playerAddress`.
 */
export function BattleLog({ battles, isLoading, error, playerAddress }: BattleLogProps) {
  if (isLoading) {
    return <LoadingIndicator label="Loading battle history…" />;
  }
  if (error) {
    return <p style={styles.textMuted}>{error}</p>;
  }
  if (battles.length === 0) {
    return <p style={styles.textMuted}>No battles yet.</p>;
  }

  return (
    <ul style={styles.list} aria-label="Battle history">
      {battles.map((battle) => {
        const won = battle.winner === playerAddress;
        return (
          <li key={battle.battleId} style={styles.item}>
            <span style={won ? styles.victory : styles.defeat}>{won ? 'Victory' : 'Defeat'}</span>{' '}
            — {truncateAddress(battle.attacker)} attacked {truncateAddress(battle.defender)} at
            system {battle.systemId}. {truncateAddress(battle.winner)} won in {battle.rounds}{' '}
            round(s).
            <div style={styles.meta}>
              Battle #{battle.battleId} · ledger {battle.ledgerSequence}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
