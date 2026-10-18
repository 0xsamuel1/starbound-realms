import type { NetworkLabel } from '../lib/starboundClient';

const COLORS: Record<NetworkLabel, string> = {
  Testnet: 'var(--green)',
  Mainnet: 'var(--red)',
  'Unknown network': 'var(--yellow)',
};

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    borderRadius: '999px',
    padding: '0.25rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    background: 'var(--bg-card)',
  },
  dot: {
    width: '0.5rem',
    height: '0.5rem',
    borderRadius: '50%',
  },
};

export interface NetworkBadgeProps {
  network: NetworkLabel;
}

/** Shows which Stellar network the app is configured for, so players know if real assets are at stake. */
export function NetworkBadge({ network }: NetworkBadgeProps) {
  const color = COLORS[network];
  return (
    <span
      style={{ ...styles.badge, color, border: `1px solid ${color}` }}
      title={`Connected to Stellar ${network}`}
      aria-label={`Network: ${network}`}
    >
      <span style={{ ...styles.dot, background: color }} />
      {network}
    </span>
  );
}
