import React from 'react';

const styles: Record<string, React.CSSProperties> = {
  callout: {
    background: 'var(--bg-card, #0f1729)',
    border: '1px dashed var(--border, #1e2a44)',
    borderRadius: '12px',
    padding: '1.5rem 1.75rem',
    marginBottom: '1.25rem',
    textAlign: 'center',
  },
  title: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: 'var(--text, #e2e8f0)',
    marginBottom: '0.5rem',
  },
  message: {
    fontSize: '0.92rem',
    color: 'var(--text-muted, #94a3b8)',
    lineHeight: 1.65,
    margin: 0,
  },
};

export interface GalaxyEmptyStateProps {
  /** How many systems the connected player currently owns. */
  ownedCount: number;
  /** How many systems in the galaxy have any owner at all. */
  claimedCount: number;
}

/**
 * Inviting prompt shown over/near the galaxy grid when there is nothing to
 * celebrate yet (#140) — either a brand-new galaxy or a player who has not
 * claimed anything. Replaces a silent grid of gray cells.
 */
export function GalaxyEmptyState({ ownedCount, claimedCount }: GalaxyEmptyStateProps) {
  if (ownedCount > 0) {
    return null;
  }

  const freshGalaxy = claimedCount === 0;

  return (
    <div style={styles.callout} role="status" data-testid="galaxy-empty-state">
      <p style={styles.title}>
        {freshGalaxy ? 'No one has claimed a system yet — be the first!' : 'You have not claimed a system yet'}
      </p>
      <p style={styles.message}>
        {freshGalaxy
          ? 'Pick any cell on the galaxy map and claim it to start mining resources and building your fleet.'
          : 'Claim an unclaimed cell on the galaxy map to start mining resources and building your fleet.'}
      </p>
    </div>
  );
}
