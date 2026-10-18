import React, { useCallback, useRef, useState } from 'react';
import { GalaxyClient, FleetClient, BattleClient, UnitType } from '@starbound-realms/sdk';
import { useGalaxyData } from '../hooks/useGalaxyData';
import { useFleetData } from '../hooks/useFleetData';
import { useResourceBalances } from '../hooks/useResourceBalances';
import { useRecentBattles } from '../hooks/useRecentBattles';
import { useTrustlines } from '../hooks/useTrustlines';
import { GalaxyMap } from './GalaxyMap';
import { StarSystem } from './StarSystem';
import { Fleet } from './Fleet';
import { ResourceBalances } from './ResourceBalances';
import { BattleFeed } from './BattleFeed';
import { ResourceSetupBanner } from './ResourceSetupBanner';
import { getStarboundClient } from '../lib/starboundClient';

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  walletError: {
    color: 'var(--red)',
    fontSize: '0.85rem',
    marginTop: '-0.75rem',
  },

  galaxySection: {
    maxWidth: '900px',
    width: '100%',
    margin: '3rem auto 0',
    padding: '0 2rem',
  },

  galaxyTitle: {
    fontSize: '1.1rem',
    fontWeight: 700,
    marginBottom: '1rem',
    color: 'var(--text)',
  },

  textMuted: {
    color: 'var(--text-muted)',
    fontSize: '0.9rem',
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GameViewProps {
  walletAddress: string;
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>;
  backendUrl: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders the full connected-wallet game UI: galaxy map, star-system drawer,
 * fleet builder, resource balances, and the recent-battles feed.
 *
 * Receives `walletAddress`, `signTransaction`, and `backendUrl` as props so
 * it can be tested in isolation without a real Freighter or Soroban node.
 */
export function GameView({ walletAddress, signTransaction, backendUrl }: GameViewProps) {
  const { systems, isLoading: galaxyLoading, error: galaxyError, refetch: refetchGalaxy } =
    useGalaxyData(backendUrl);

  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const selectedSystem = systems.find((s) => s.systemId === selectedSystemId) ?? null;

  const claimSystem = useCallback(
    async (systemId: number) => {
      setClaimError(null);
      try {
        const client = getStarboundClient();
        const galaxy = new GalaxyClient(client);
        await galaxy.claimSystem(walletAddress, systemId, (xdr) => signTransaction(xdr, client.networkPassphrase));
        await refetchGalaxy();
        setSelectedSystemId(null);
      } catch (err) {
        setClaimError(err instanceof Error ? err.message : String(err));
      }
    },
    [walletAddress, signTransaction, refetchGalaxy]
  );

  const { fleet, error: fleetError, refetch: refetchFleet } = useFleetData(walletAddress);
  const { balances, error: balancesError, refetch: refetchBalances } = useResourceBalances(walletAddress);
  const playerSectionRef = useRef<HTMLDivElement>(null);
  const recentBattles = useRecentBattles(backendUrl);

  const {
    missing: missingTrustlines,
    isSettingUp: settingUpTrustlines,
    error: trustlineError,
    setUpTrustlines,
  } = useTrustlines(walletAddress, signTransaction);

  const [buildError, setBuildError] = useState<string | null>(null);

  const buildUnit = useCallback(
    async (unitType: UnitType, count: number) => {
      setBuildError(null);
      try {
        const client = getStarboundClient();
        const fleetClient = new FleetClient(client);
        await fleetClient.buildUnit(walletAddress, unitType, count, (xdr) =>
          signTransaction(xdr, client.networkPassphrase)
        );
        await Promise.all([refetchFleet(), refetchBalances()]);
      } catch (err) {
        setBuildError(err instanceof Error ? err.message : String(err));
      }
    },
    [walletAddress, signTransaction, refetchFleet, refetchBalances]
  );

  const [moveError, setMoveError] = useState<string | null>(null);

  const moveFleet = useCallback(
    async (targetSystemId: number) => {
      setMoveError(null);
      try {
        const client = getStarboundClient();
        const fleetClient = new FleetClient(client);
        await fleetClient.moveFleet(walletAddress, targetSystemId, (xdr) =>
          signTransaction(xdr, client.networkPassphrase)
        );
        await refetchFleet();
        setSelectedSystemId(null);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : String(err));
      }
    },
    [walletAddress, signTransaction, refetchFleet]
  );

  const [attackError, setAttackError] = useState<string | null>(null);
  const [battleResult, setBattleResult] = useState<string | null>(null);

  const attackSystem = useCallback(
    async (systemId: number) => {
      const defender = systems.find((s) => s.systemId === systemId)?.owner;
      if (!defender) {
        return;
      }
      setAttackError(null);
      setBattleResult(null);
      try {
        const client = getStarboundClient();
        const battleClient = new BattleClient(client);
        const battleId = await battleClient.resolveBattle(walletAddress, defender, systemId, (xdr) =>
          signTransaction(xdr, client.networkPassphrase)
        );
        const battle = await battleClient.getBattle(battleId);
        setBattleResult(
          battle.winner === walletAddress
            ? `Victory! You took system ${systemId} in ${battle.rounds} round(s).`
            : `Defeat. Your fleet was repelled from system ${systemId} after ${battle.rounds} round(s).`
        );
        await Promise.all([refetchFleet(), refetchGalaxy()]);
        setSelectedSystemId(null);
      } catch (err) {
        setAttackError(err instanceof Error ? err.message : String(err));
      }
    },
    [walletAddress, systems, signTransaction, refetchFleet, refetchGalaxy]
  );

  return (
    <>
      {/* Galaxy map section */}
      <section style={styles.galaxySection}>
        <ResourceSetupBanner
          missing={missingTrustlines}
          isSettingUp={settingUpTrustlines}
          onSetUp={setUpTrustlines}
        />
        {trustlineError && <p style={styles.walletError}>{trustlineError}</p>}
        <h2 style={styles.galaxyTitle}>The Galaxy</h2>
        {galaxyLoading && <p style={styles.textMuted}>Loading galaxy...</p>}
        {galaxyError && <p style={styles.walletError}>{galaxyError}</p>}
        {!galaxyLoading && !galaxyError && (
          <>
            <GalaxyMap systems={systems} walletAddress={walletAddress} onSelectSystem={setSelectedSystemId} />
            <StarSystem
              system={selectedSystem}
              walletAddress={walletAddress}
              fleet={fleet}
              onClose={() => setSelectedSystemId(null)}
              onClaim={claimSystem}
              onMoveFleet={moveFleet}
              onAttack={attackSystem}
            />
            {claimError && <p style={styles.walletError}>{claimError}</p>}
            {moveError && <p style={styles.walletError}>{moveError}</p>}
            {attackError && <p style={styles.walletError}>{attackError}</p>}
            {battleResult && <p style={styles.textMuted}>{battleResult}</p>}

            <div ref={playerSectionRef}>
              <ResourceBalances balances={balances} />
              {balancesError && <p style={styles.walletError}>{balancesError}</p>}
              <Fleet fleet={fleet} onBuildUnit={buildUnit} />
            </div>
            {fleetError && <p style={styles.walletError}>{fleetError}</p>}
            {buildError && <p style={styles.walletError}>{buildError}</p>}
          </>
        )}
      </section>

      {/* Galaxy-wide battle feed */}
      <section style={styles.galaxySection}>
        <h2 style={styles.galaxyTitle}>Recent Battles</h2>
        <BattleFeed
          battles={recentBattles.battles}
          isLoading={recentBattles.isLoading}
          error={recentBattles.error}
          hasPreviousPage={recentBattles.hasPreviousPage}
          hasNextPage={recentBattles.hasNextPage}
          onPreviousPage={recentBattles.goToPreviousPage}
          onNextPage={recentBattles.goToNextPage}
        />
      </section>
    </>
  );
}
