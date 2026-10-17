import { useCallback, useEffect, useRef, useState } from 'react';

export interface RecentBattle {
  battleId: number;
  attacker: string;
  defender: string;
  systemId: number;
  winner: string;
  rounds: number;
  ledgerSequence: number;
  createdAt: number;
}

/**
 * The raw shape the backend's `GET /battles` actually returns: a Postgres row
 * as-is (snake_case columns), with BIGINT columns serialized as strings and
 * TIMESTAMP columns serialized as ISO strings, per node-postgres's defaults.
 */
interface RawBattle {
  battle_id: string;
  attacker: string;
  defender: string;
  system_id: number;
  winner: string;
  rounds: number;
  ledger_sequence: string;
  created_at: string;
}

/** Maps the backend's snake_case row to the frontend's camelCase shape. */
function toRecentBattle(raw: RawBattle): RecentBattle {
  return {
    battleId: Number(raw.battle_id),
    attacker: raw.attacker,
    defender: raw.defender,
    systemId: raw.system_id,
    winner: raw.winner,
    rounds: raw.rounds,
    ledgerSequence: Number(raw.ledger_sequence),
    createdAt: Date.parse(raw.created_at),
  };
}

export const RECENT_BATTLES_PAGE_SIZE = 20;

export interface UseRecentBattlesResult {
  battles: RecentBattle[];
  isLoading: boolean;
  error: string | null;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
}

/** Fetches the galaxy-wide battle feed from the backend's `GET /battles`, one page at a time. */
export function useRecentBattles(backendUrl: string): UseRecentBattlesResult {
  const [battles, setBattles] = useState<RecentBattle[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/battles?limit=${RECENT_BATTLES_PAGE_SIZE}&offset=${offset}`);
      if (!response.ok) {
        throw new Error(`failed to fetch battles: ${response.status}`);
      }
      const { battles: raw } = (await response.json()) as { battles: RawBattle[] };
      if (isMounted.current) {
        setBattles(raw.map(toRecentBattle));
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [backendUrl, offset]);

  useEffect(() => {
    isMounted.current = true;
    load();
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  return {
    battles,
    isLoading,
    error,
    hasPreviousPage: offset > 0,
    hasNextPage: battles.length === RECENT_BATTLES_PAGE_SIZE,
    goToNextPage: () => setOffset((current) => current + RECENT_BATTLES_PAGE_SIZE),
    goToPreviousPage: () => setOffset((current) => Math.max(0, current - RECENT_BATTLES_PAGE_SIZE)),
  };
}
