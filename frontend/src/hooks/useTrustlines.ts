import { useCallback, useEffect, useRef, useState } from 'react';
import { ResourcesClient } from '@starbound-realms/sdk';
import { getResourceIssuer, getStarboundClient } from '../lib/starboundClient';

export interface UseTrustlinesResult {
  /** Resource asset codes the player can't receive yet; null until checked or when disconnected. */
  missing: string[] | null;
  isLoading: boolean;
  isSettingUp: boolean;
  error: string | null;
  /** Asks the player to sign one transaction creating every missing trustline. */
  setUpTrustlines: () => Promise<void>;
}

/**
 * Tracks whether the connected player can hold IRON/NRGY/PLSM. These are
 * classic Stellar assets, so a player's account must trust each one before
 * it can receive any. Never prompts for a signature on its own: the player
 * starts setup explicitly via setUpTrustlines.
 */
export function useTrustlines(
  walletAddress: string | null,
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>
): UseTrustlinesResult {
  const [missing, setMissing] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(walletAddress));
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const checkTrustlines = useCallback(async () => {
    if (!walletAddress) {
      setMissing(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const resources = new ResourcesClient(getStarboundClient());
      const result = await resources.findMissingTrustlines(walletAddress, getResourceIssuer());
      if (isMounted.current) {
        setMissing(result);
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
  }, [walletAddress]);

  useEffect(() => {
    isMounted.current = true;
    checkTrustlines();
    return () => {
      isMounted.current = false;
    };
  }, [checkTrustlines]);

  const setUpTrustlines = useCallback(async () => {
    if (!walletAddress) {
      return;
    }
    setIsSettingUp(true);
    setError(null);
    try {
      const client = getStarboundClient();
      const resources = new ResourcesClient(client);
      await resources.establishTrustlines(walletAddress, getResourceIssuer(), (xdr) =>
        signTransaction(xdr, client.networkPassphrase)
      );
      await checkTrustlines();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSettingUp(false);
    }
  }, [walletAddress, signTransaction, checkTrustlines]);

  return { missing, isLoading, isSettingUp, error, setUpTrustlines };
}
