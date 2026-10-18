import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A single entry in a player's battle history. The raw backend row and the
 * mapping are identical to the `GET /battles` feed, so the shape is kept
 * aligned with `RecentBattle` in useRecentBattles.ts.
 */
export interface PlayerBattle {
  battleId: number;
  attacker: string;
  defender: string;
  systemId: number;
  winner: string;
  rounds: number;
  ledgerSequence: number;
  createdAt: number;
}

/** Raw `battles` row as returned by node-postgres (snake_case, BIGINTs as strings). */
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
function toPlayerBattle(raw: RawBattle): PlayerBattle {
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

export interface UseBattleHistoryResult {
  battles: PlayerBattle[];
  isLoading: boolean;
  error: string | null;
  /** Re-fetches the history — call after a battle to refresh the list. */
  refetch: () => Promise<void>;
}

/**
 * Fetches a player's full battle history from the backend's
 * `GET /player/:address/battles`. Skips the request while `address` is null.
 */
export function useBattleHistory(
  backendUrl: string,
  address: string | null
): UseBattleHistoryResult {
  const [battles, setBattles] = useState<PlayerBattle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!address) {
      setBattles([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/player/${address}/battles`);
      if (!response.ok) {
        throw new Error(`failed to fetch battle history: ${response.status}`);
      }
      const { battles: raw } = (await response.json()) as { battles: RawBattle[] };
      if (isMounted.current) {
        setBattles(raw.map(toPlayerBattle));
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        setBattles([]);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [backendUrl, address]);

  useEffect(() => {
    isMounted.current = true;
    load();
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  return { battles, isLoading, error, refetch: load };
}
