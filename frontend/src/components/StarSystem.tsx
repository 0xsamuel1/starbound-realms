import { Fleet, isFleetEmpty } from '@starbound-realms/sdk';
import { useEffect, useRef } from 'react';
import { GalaxySystem } from '../hooks/useGalaxyData';
import { truncateAddress } from '../lib/format';

const styles: Record<string, React.CSSProperties> = {
  drawer: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1.5rem',
    marginTop: '1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.4rem 0',
    fontSize: '0.9rem',
    color: 'var(--text-muted)',
  },
  claimButton: {
    marginTop: '1rem',
    width: '100%',
    background: 'var(--accent)',
    color: '#080b14',
    border: 'none',
    borderRadius: '8px',
    padding: '0.7rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  moveButton: {
    marginTop: '0.6rem',
    width: '100%',
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: '8px',
    padding: '0.7rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  attackButton: {
    marginTop: '0.6rem',
    width: '100%',
    background: 'transparent',
    color: 'var(--red)',
    border: '1px solid var(--red)',
    borderRadius: '8px',
    padding: '0.7rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

/** Returns how a system's ownership should read relative to the connected wallet. */
export function getOwnershipLabel(system: GalaxySystem, walletAddress: string | null): string {
  if (!system.owner) {
    return 'Unclaimed';
  }
  if (system.owner === walletAddress) {
    return 'You';
  }
  return walletAddress ? truncateAddress(system.owner) : system.owner;
}

export interface StarSystemProps {
  system: GalaxySystem | null;
  walletAddress: string | null;
  fleet?: Fleet | null;
  onClose: () => void;
  onClaim?: (systemId: number) => void;
  onMoveFleet?: (systemId: number) => void;
  onAttack?: (systemId: number) => void;
}

/** Detail drawer for a single star system, opened from GalaxyMap. */
export function StarSystem({ system, walletAddress, fleet, onClose, onClaim, onMoveFleet, onAttack }: StarSystemProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (system) {
      closeButtonRef.current?.focus();
    }
  }, [system?.systemId]);

  if (!system) {
    return null;
  }

  const canClaim = !system.owner && Boolean(onClaim);
  const canMoveFleet =
    Boolean(onMoveFleet) && Boolean(fleet) && !isFleetEmpty(fleet!) && fleet!.location !== system.systemId;
  // resolve_battle has no location requirement — any non-empty fleet can
  // attack any system owned by someone else, regardless of where it is.
  const canAttack =
    Boolean(onAttack) && Boolean(fleet) && !isFleetEmpty(fleet!) && Boolean(system.owner) && system.owner !== walletAddress;

  return (
    <div style={styles.drawer} role="dialog" aria-labelledby={`star-system-title-${system.systemId}`}>
      <div style={styles.header}>
        <span id={`star-system-title-${system.systemId}`} style={styles.title}>
          System {system.systemId}
        </span>
        <button
          ref={closeButtonRef}
          style={styles.closeButton}
          onClick={onClose}
          aria-label="Close system details"
        >
          ✕
        </button>
      </div>

      <div style={styles.row}>
        <span>Coordinates</span>
        <span>
          ({system.coordX}, {system.coordY})
        </span>
      </div>
      <div style={styles.row}>
        <span>Resource</span>
        <span>{system.resourceType}</span>
      </div>
      <div style={styles.row}>
        <span>Yield</span>
        <span>{system.resourceYield}</span>
      </div>
      <div style={styles.row}>
        <span>Defense rating</span>
        <span>{system.defenseRating}</span>
      </div>
      <div style={styles.row}>
        <span>Owner</span>
        <span>{getOwnershipLabel(system, walletAddress)}</span>
      </div>

      {canClaim && (
        <button style={styles.claimButton} onClick={() => onClaim!(system.systemId)}>
          Claim System
        </button>
      )}

      {canMoveFleet && (
        <button style={styles.moveButton} onClick={() => onMoveFleet!(system.systemId)}>
          Move Fleet Here
        </button>
      )}

      {canAttack && (
        <button style={styles.attackButton} onClick={() => onAttack!(system.systemId)}>
          Attack
        </button>
      )}
    </div>
  );
}
