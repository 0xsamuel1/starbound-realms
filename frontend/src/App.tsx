import React, { useCallback, useRef, useState } from 'react';
import { GalaxyClient, FleetClient, BattleClient, UnitType } from '@starbound-realms/sdk';
import { useStellar } from './hooks/useStellar';
import { useGalaxyData } from './hooks/useGalaxyData';
import { useFleetData } from './hooks/useFleetData';
import { useResourceBalances } from './hooks/useResourceBalances';
import { useRecentBattles } from './hooks/useRecentBattles';
import { useTrustlines } from './hooks/useTrustlines';
import { GalaxyMap } from './components/GalaxyMap';
import { StarSystem } from './components/StarSystem';
import { Fleet } from './components/Fleet';
import { ResourceBalances } from './components/ResourceBalances';
import { BattleFeed } from './components/BattleFeed';
import { ResourceSetupBanner } from './components/ResourceSetupBanner';
import { truncateAddress } from './lib/format';
import { getStarboundClient } from './lib/starboundClient';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at 50% 0%, rgba(99,179,237,0.08) 0%, #080b14 60%)',
    display: 'flex',
    flexDirection: 'column',
  },

  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.25rem 2.5rem',
    borderBottom: '1px solid var(--border)',
    backdropFilter: 'blur(10px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'rgba(8,11,20,0.8)',
  },

  navLogo: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: 'var(--accent)',
    letterSpacing: '0.05em',
  },

  navLinks: {
    display: 'flex',
    gap: '2rem',
    listStyle: 'none',
  },

  navLink: {
    color: 'var(--text-muted)',
    textDecoration: 'none',
    fontSize: '0.9rem',
    transition: 'color 0.2s',
    cursor: 'pointer',
  },

  hero: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '6rem 2rem 4rem',
    gap: '1.5rem',
  },

  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    background: 'rgba(99,179,237,0.1)',
    border: '1px solid var(--border)',
    borderRadius: '999px',
    padding: '0.3rem 0.9rem',
    fontSize: '0.8rem',
    color: 'var(--accent)',
    letterSpacing: '0.05em',
  },

  title: {
    fontSize: 'clamp(2.8rem, 7vw, 5rem)',
    fontWeight: 800,
    lineHeight: 1.1,
    background: 'linear-gradient(135deg, #e2e8f0 0%, #63b3ed 50%, #9f7aea 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },

  subtitle: {
    fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
    color: 'var(--text-muted)',
    maxWidth: '580px',
    lineHeight: 1.7,
  },

  ctaGroup: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: '0.5rem',
  },

  btnPrimary: {
    background: 'var(--accent)',
    color: '#080b14',
    border: 'none',
    borderRadius: '8px',
    padding: '0.8rem 2rem',
    fontSize: '0.95rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.2s, box-shadow 0.2s',
    boxShadow: '0 0 20px var(--accent-glow)',
  },

  btnSecondary: {
    background: 'transparent',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '0.8rem 2rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },

  features: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '1.25rem',
    maxWidth: '900px',
    width: '100%',
    margin: '3rem auto 0',
    padding: '0 2rem',
  },

  featureCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
    textAlign: 'left',
  },

  featureIcon: {
    fontSize: '1.8rem',
    marginBottom: '0.75rem',
  },

  featureTitle: {
    fontSize: '0.95rem',
    fontWeight: 700,
    marginBottom: '0.4rem',
    color: 'var(--text)',
  },

  featureDesc: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    lineHeight: 1.6,
  },

  gameLoop: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
    justifyContent: 'center',
    margin: '3rem 2rem 0',
    padding: '1.25rem 2rem',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    maxWidth: '800px',
    width: 'calc(100% - 4rem)',
  },

  gameLoopStep: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    fontWeight: 500,
  },

  gameLoopArrow: {
    color: 'var(--accent)',
    fontSize: '1rem',
  },

  footer: {
    textAlign: 'center',
    padding: '2rem',
    color: 'var(--text-muted)',
    fontSize: '0.8rem',
    borderTop: '1px solid var(--border)',
    marginTop: '4rem',
  },

  footerLink: {
    color: 'var(--accent)',
    textDecoration: 'none',
  },

  walletConnected: {
    background: 'rgba(104, 211, 145, 0.1)',
    border: '1px solid rgba(104, 211, 145, 0.3)',
    color: 'var(--green)',
    borderRadius: '8px',
    padding: '0.8rem 2rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

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

// ── Feature data ──────────────────────────────────────────────────────────────

const features = [
  {
    icon: '🌌',
    title: 'On-chain Galaxy',
    desc: 'Every star system, every owner, every battle — stored permanently on Stellar.',
  },
  {
    icon: '⚔️',
    title: 'Real Combat',
    desc: 'Deploy fleets, conquer neighbors, defend territory. Battles resolved by Soroban contracts.',
  },
  {
    icon: '⛏️',
    title: 'Mine Resources',
    desc: 'Iron, Energy, Plasma — real Stellar assets tradeable on the Stellar DEX.',
  },
  {
    icon: '🔐',
    title: 'Truly Trustless',
    desc: 'No admin keys. No hidden logic. No server controls game state. Just contracts.',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const { walletAddress, isConnected: walletConnected, error: walletError, connectWallet, signTransaction } =
    useStellar();
  const { systems, isLoading: galaxyLoading, error: galaxyError, refetch: refetchGalaxy } =
    useGalaxyData(BACKEND_URL);
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const selectedSystem = systems.find((s) => s.systemId === selectedSystemId) ?? null;

  const claimSystem = useCallback(
    async (systemId: number) => {
      if (!walletAddress) {
        return;
      }
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
  const recentBattles = useRecentBattles(BACKEND_URL);
  const {
    missing: missingTrustlines,
    isSettingUp: settingUpTrustlines,
    error: trustlineError,
    setUpTrustlines,
  } = useTrustlines(walletAddress, signTransaction);
  const [buildError, setBuildError] = useState<string | null>(null);

  const buildUnit = useCallback(
    async (unitType: UnitType, count: number) => {
      if (!walletAddress) {
        return;
      }
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
      if (!walletAddress) {
        return;
      }
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
      if (!walletAddress) {
        return;
      }
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
    <div style={styles.page}>
      {/* Nav */}
      <nav style={styles.nav}>
        <span style={styles.navLogo}>✦ STARBOUND REALMS</span>
        <ul style={styles.navLinks}>
          <li>
            <a
              href="https://github.com/OlaGreat/starbound-realms"
              target="_blank"
              rel="noreferrer"
              style={styles.navLink}
            >
              GitHub
            </a>
          </li>
          <li>
            <a
              href="https://github.com/OlaGreat/starbound-realms/blob/main/docs/architecture.md"
              target="_blank"
              rel="noreferrer"
              style={styles.navLink}
            >
              Docs
            </a>
          </li>
        </ul>
      </nav>

      {/* Hero */}
      <section style={styles.hero}>
        <span style={styles.badge}>⚡ Built on Stellar · Powered by Soroban</span>

        <h1 style={styles.title}>
          Conquer the Galaxy.
          <br />
          Own Everything.
        </h1>

        <p style={styles.subtitle}>
          A fully on-chain strategy game on the Stellar network. Claim star
          systems, mine real Stellar assets, build fleets, and battle for
          galactic dominance — no servers, no trust required.
        </p>

        <div style={styles.ctaGroup}>
          {walletConnected && walletAddress ? (
            <button
              type="button"
              style={styles.walletConnected}
              onClick={() => playerSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              ✓ Connected — {walletAddress && truncateAddress(walletAddress)}
            </button>
          ) : (
            <button style={styles.btnPrimary} onClick={connectWallet}>
              Connect Freighter
            </button>
          )}
          <a
            href="https://github.com/OlaGreat/starbound-realms"
            target="_blank"
            rel="noreferrer"
          >
            <button style={styles.btnSecondary}>View on GitHub →</button>
          </a>
        </div>

        {walletError && <p style={styles.walletError}>{walletError}</p>}

        {/* Game loop */}
        <div style={styles.gameLoop}>
          {['Claim Systems', 'Mine Resources', 'Build Fleets', 'Conquer Neighbors', 'Dominate the Galaxy'].map(
            (step, i, arr) => (
              <React.Fragment key={step}>
                <span style={styles.gameLoopStep}>{step}</span>
                {i < arr.length - 1 && <span style={styles.gameLoopArrow}>→</span>}
              </React.Fragment>
            )
          )}
        </div>
      </section>

      {/* Galaxy map — only meaningful once a wallet is connected, since the
          whole point is coloring systems by ownership relative to you. */}
      {walletConnected && (
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
      )}

      {/* Galaxy-wide battle feed: every player's recent battles, not just the connected wallet's. */}
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

      {/* Features */}
      <div style={styles.features}>
        {features.map((f) => (
          <div key={f.title} style={styles.featureCard}>
            <div style={styles.featureIcon}>{f.icon}</div>
            <div style={styles.featureTitle}>{f.title}</div>
            <div style={styles.featureDesc}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>
          Open source ·{' '}
          <a
            href="https://github.com/OlaGreat/starbound-realms"
            style={styles.footerLink}
            target="_blank"
            rel="noreferrer"
          >
            Contribute on GitHub
          </a>{' '}
          · Built on{' '}
          <a
            href="https://stellar.org"
            style={styles.footerLink}
            target="_blank"
            rel="noreferrer"
          >
            Stellar
          </a>
        </p>
      </footer>
    </div>
  );
}
