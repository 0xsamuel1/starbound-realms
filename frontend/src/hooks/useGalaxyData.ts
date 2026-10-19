import { useCallback, useEffect, useRef, useState } from 'react';

export interface GalaxySystem {
  systemId: number;
  owner: string | null;
  coordX: number;
  coordY: number;
  resourceType: 'Iron' | 'Energy' | 'Plasma';
  resourceYield: number;
  defenseRating: number;
  lastClaimed: number;
}

/**
 * The raw shape the backend's `GET /galaxy` actually returns: a Postgres row
 * as-is (snake_case columns), with BIGINT columns (last_claimed) serialized
 * as strings rather than numbers, per node-postgres's default type parsing.
 */
interface RawGalaxySystem {
  system_id: number;
  owner: string | null;
  coord_x: number;
  coord_y: number;
  resource_type: 'Iron' | 'Energy' | 'Plasma';
  resource_yield: number;
  defense_rating: number;
  last_claimed: string;
}

/** Maps the backend's snake_case row to the frontend's camelCase shape. */
function toGalaxySystem(raw: RawGalaxySystem): GalaxySystem {
  return {
    systemId: raw.system_id,
    owner: raw.owner,
    coordX: raw.coord_x,
    coordY: raw.coord_y,
    resourceType: raw.resource_type,
    resourceYield: raw.resource_yield,
    defenseRating: raw.defense_rating,
    lastClaimed: Number(raw.last_claimed),
  };
}

export interface UseGalaxyDataResult {
  systems: GalaxySystem[];
  isLoading: boolean;
  error: string | null;
  pagination: { limit: number; offset: number; count: number; hasMore: boolean; nextOffset: number | null } | null;
  /** Re-fetches the galaxy grid — call after a write (e.g. claiming a system) to refresh the view. */
  refetch: () => Promise<void>;
}

/** Fetches the galaxy grid from the backend's read API. */
export function useGalaxyData(backendUrl: string): UseGalaxyDataResult {
  const [systems, setSystems] = useState<GalaxySystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<UseGalaxyDataResult['pagination']>(null);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/galaxy`);
      if (!response.ok) {
        throw new Error(`failed to fetch galaxy: ${response.status}`);
      }
      const { systems: raw, pagination: page } = (await response.json()) as {
        systems: RawGalaxySystem[];
        pagination?: UseGalaxyDataResult['pagination'];
      };
      if (isMounted.current) {
        setSystems(raw.map(toGalaxySystem));
        setPagination(page ?? null);
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

  return { systems, isLoading, error, pagination, refetch: load };
}
