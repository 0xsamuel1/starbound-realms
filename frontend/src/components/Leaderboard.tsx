import React from 'react';
import { LeaderboardEntry } from '../hooks/useLeaderboard';
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
  header: {
    display: 'grid',
    gridTemplateColumns: '3rem 1fr 8rem 5rem 5rem',
    gap: '0.75rem',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    padding: '0 1rem',
  },
  item: {
    display: 'grid',
    gridTemplateColumns: '3rem 1fr 8rem 5rem 5rem',
    gap: '0.75rem',
    alignItems: 'center',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    color: 'var(--text)',
  },
  rank: {
    fontWeight: 700,
    color: 'var(--accent)',
  },
  record: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  textMuted: {
    color: 'var(--text-muted)',
    fontSize: '0.9rem',
  },
};

export interface LeaderboardProps {
  players: LeaderboardEntry[];
  isLoading: boolean;
  error: string | null;
}

/** Renders the top-players leaderboard: rank, address, systems owned, and W/L record. */
export function Leaderboard({ players, isLoading, error }: LeaderboardProps) {
  if (isLoading) {
    return <LoadingIndicator label="Loading leaderboard…" />;
  }
  if (error) {
    return <p style={styles.textMuted}>{error}</p>;
  }
  if (players.length === 0) {
    return <p style={styles.textMuted}>No players yet — claim the first star system.</p>;
  }

  return (
    <>
      <div style={styles.header} aria-hidden="true">
        <span>Rank</span>
        <span>Player</span>
        <span>Systems</span>
        <span>Won</span>
        <span>Lost</span>
      </div>
      <ol style={styles.list} aria-label="Leaderboard">
        {players.map((player, index) => (
          <li key={player.address} style={styles.item}>
            <span style={styles.rank}>#{index + 1}</span>
            <span>{truncateAddress(player.address)}</span>
            <span>{player.systemsOwned} systems</span>
            <span style={styles.record}>{player.battlesWon}W</span>
            <span style={styles.record}>{player.battlesLost}L</span>
          </li>
        ))}
      </ol>
    </>
  );
}
