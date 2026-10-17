import { ResourceType } from '@starbound-realms/sdk';
import { ResourceBalances as Balances } from '../hooks/useResourceBalances';

const RESOURCES: { type: ResourceType; code: string }[] = [
  { type: 'Iron', code: 'IRON' },
  { type: 'Energy', code: 'NRGY' },
  { type: 'Plasma', code: 'PLSM' },
];

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
    marginTop: '1rem',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
  },
  cell: {
    textAlign: 'center',
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
  },
  amount: {
    fontSize: '1.3rem',
    fontWeight: 700,
    color: 'var(--text)',
    display: 'block',
  },
};

export interface ResourceBalancesProps {
  balances: Balances | null;
}

/** Shows the connected player's resource balances, next to where resources get spent. */
export function ResourceBalances({ balances }: ResourceBalancesProps) {
  if (!balances) {
    return null;
  }

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Your Resources</div>
      <div style={styles.grid}>
        {RESOURCES.map(({ type, code }) => (
          <div key={type} style={styles.cell}>
            <span style={styles.amount}>{balances[type].toString()}</span>
            {code}
          </div>
        ))}
      </div>
    </div>
  );
}
