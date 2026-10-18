import { useCallback, useEffect, useRef, useState } from 'react';

export interface LeaderboardEntry {
  address: string;
  systemsOwned: number;
  battlesWon: number;
  battlesLost: number;
}

/**
 * The raw shape the backend's `GET /leaderboard` actually returns: a Postgres
 * `players` row as-is (snake_case columns), with TIMESTAMP columns serialized
 * as ISO strings, per node-postgres's default type parsing.
 */
interface RawPlayer {
  address: string;
  systems_owned: number;
  battles_won: number;
  battles_lost: number;
  first_seen: string;
  last_active: string;
}

/** Maps the backend's snake_case row to the frontend's camelCase shape. */
function toLeaderboardEntry(raw: RawPlayer): LeaderboardEntry {
  return {
    address: raw.address,
    systemsOwned: raw.systems_owned,
    battlesWon: raw.battles_won,
    battlesLost: raw.battles_lost,
  };
}

export interface UseLeaderboardResult {
  players: LeaderboardEntry[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches the top-players leaderboard from the backend's `GET /leaderboard`.
 *
 * That route sits behind a strict rate limiter (10 req/min), so this hook
 * fetches exactly once per mount — no polling, no auto-retry. A refetch only
 * happens if the component remounts.
 */
export function useLeaderboard(backendUrl: string): UseLeaderboardResult {
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/leaderboard`);
      if (!response.ok) {
        throw new Error(`failed to fetch leaderboard: ${response.status}`);
      }
      const { players: raw } = (await response.json()) as { players: RawPlayer[] };
      if (isMounted.current) {
        setPlayers(raw.map(toLeaderboardEntry));
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
  }, [backendUrl]);

  useEffect(() => {
    isMounted.current = true;
    load();
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  return { players, isLoading, error };
}
