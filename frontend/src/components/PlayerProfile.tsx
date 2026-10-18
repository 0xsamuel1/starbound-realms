import React from 'react';
import { PlayerProfile as Profile } from '../hooks/usePlayerProfile';
import { LoadingIndicator } from './LoadingIndicator';

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.25rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  address: {
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    color: 'var(--accent)',
    wordBreak: 'break-all',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '0.75rem',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  statLabel: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
  },
  statValue: {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  textMuted: {
    color: 'var(--text-muted)',
    fontSize: '0.9rem',
  },
};

export interface PlayerProfileProps {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
}

/** Shows a player's systems-owned count and battle win/loss record. */
export function PlayerProfile({ profile, isLoading, error }: PlayerProfileProps) {
  if (isLoading) {
    return <LoadingIndicator label="Loading profile…" />;
  }
  if (error) {
    return <p style={styles.textMuted}>{error}</p>;
  }
  if (!profile) {
    return null;
  }

  return (
    <div style={styles.card} aria-label="Player profile">
      <span style={styles.address}>{profile.address}</span>
      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Systems owned</span>
          <span style={styles.statValue}>{profile.systemsOwned}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Battles won</span>
          <span style={styles.statValue}>{profile.battlesWon}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Battles lost</span>
          <span style={styles.statValue}>{profile.battlesLost}</span>
        </div>
      </div>
    </div>
  );
}
