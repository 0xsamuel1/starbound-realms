import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlayerProfile {
  address: string;
  systemsOwned: number;
  battlesWon: number;
  battlesLost: number;
}

/**
 * The raw shape the backend's `GET /player/:address` actually returns: a
 * Postgres `players` row as-is (snake_case columns), with TIMESTAMP columns
 * serialized as ISO strings, per node-postgres's default type parsing.
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
function toPlayerProfile(raw: RawPlayer): PlayerProfile {
  return {
    address: raw.address,
    systemsOwned: raw.systems_owned,
    battlesWon: raw.battles_won,
    battlesLost: raw.battles_lost,
  };
}

export interface UsePlayerProfileResult {
  profile: PlayerProfile | null;
  isLoading: boolean;
  error: string | null;
  /** Re-fetches the profile — call after a write (e.g. claiming a system) to refresh the stats. */
  refetch: () => Promise<void>;
}

/**
 * Fetches a player's profile from the backend's `GET /player/:address`.
 * Skips the request entirely while `address` is null (no wallet connected).
 */
export function usePlayerProfile(
  backendUrl: string,
  address: string | null
): UsePlayerProfileResult {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!address) {
      setProfile(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/player/${address}`);
      if (!response.ok) {
        // The backend sends a human-readable message (e.g. "Player not found").
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `failed to fetch player profile: ${response.status}`);
      }
      const { player } = (await response.json()) as { player: RawPlayer };
      if (isMounted.current) {
        setProfile(toPlayerProfile(player));
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        setProfile(null);
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

  return { profile, isLoading, error, refetch: load };
}
