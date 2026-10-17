import { useCallback, useEffect, useRef, useState } from 'react';
import { ResourcesClient, ResourceType } from '@starbound-realms/sdk';
import { getStarboundClient } from '../lib/starboundClient';

export type ResourceBalances = Record<ResourceType, bigint>;

export interface UseResourceBalancesResult {
  balances: ResourceBalances | null;
  isLoading: boolean;
  error: string | null;
  /** Re-reads the balances, call after a write (mining, building, burning) to refresh the view. */
  refetch: () => Promise<void>;
}

/**
 * Reads a player's Iron, Energy, and Plasma balances directly from the chain via
 * the SDK. The backend has no route for resource balances, so this mirrors
 * `useFleetData` and goes straight to the ledger.
 */
export function useResourceBalances(playerAddress: string | null): UseResourceBalancesResult {
  const [balances, setBalances] = useState<ResourceBalances | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    if (!playerAddress) {
      setBalances(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const client = new ResourcesClient(getStarboundClient());
      const result = await client.getAllBalances(playerAddress);
      if (isMounted.current) {
        setBalances(result);
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        setBalances(null);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [playerAddress]);

  useEffect(() => {
    isMounted.current = true;
    load();
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  return { balances, isLoading, error, refetch: load };
}
