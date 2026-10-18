import { RecentBattle } from '../hooks/useRecentBattles';
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
  },
  pager: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '1rem',
  },
  textMuted: {
    color: 'var(--text-muted)',
  },
};

export interface BattleFeedProps {
  battles: RecentBattle[];
  isLoading: boolean;
  error: string | null;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

/** Lists battles across all players, newest first, with previous and next paging. */
export function BattleFeed({
  battles,
  isLoading,
  error,
  hasPreviousPage,
  hasNextPage,
  onPreviousPage,
  onNextPage,
}: BattleFeedProps) {
  if (isLoading) {
    return <LoadingIndicator label="Loading battles…" />;
  }
  if (error) {
    return <p style={styles.textMuted}>{error}</p>;
  }
  if (battles.length === 0) {
    return <p style={styles.textMuted}>No battles yet.</p>;
  }

  return (
    <>
      <ul style={styles.list}>
        {battles.map((battle) => (
          <li key={battle.battleId} style={styles.item}>
            {truncateAddress(battle.attacker)} attacked {truncateAddress(battle.defender)} at system{' '}
            {battle.systemId}. {truncateAddress(battle.winner)} won in {battle.rounds} round(s).
            <div style={styles.meta}>
              Battle #{battle.battleId} · ledger {battle.ledgerSequence}
            </div>
          </li>
        ))}
      </ul>
      <div style={styles.pager}>
        <button type="button" onClick={onPreviousPage} disabled={!hasPreviousPage}>
          Previous
        </button>
        <button type="button" onClick={onNextPage} disabled={!hasNextPage}>
          Next
        </button>
      </div>
    </>
  );
}
