import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { getOwnershipLabel, StarSystem } from './StarSystem';
import { GalaxySystem } from '../hooks/useGalaxyData';
import { Fleet } from '@starbound-realms/sdk';

function makeSystem(overrides: Partial<GalaxySystem> = {}): GalaxySystem {
  return {
    systemId: 5,
    owner: null,
    coordX: 2,
    coordY: 1,
    resourceType: 'Iron',
    resourceYield: 25,
    defenseRating: 12,
    lastClaimed: 0,
    ...overrides,
  };
}

function makeFleet(overrides: Partial<Fleet> = {}): Fleet {
  return { scouts: 1, fighters: 0, cruisers: 0, dreadnoughts: 0, location: 0, lastMoved: 0, ...overrides };
}

describe('getOwnershipLabel', () => {
  it('returns "Unclaimed" for a system with no owner', () => {
    expect(getOwnershipLabel(makeSystem({ owner: null }), 'GME')).toBe('Unclaimed');
  });

  it('returns "You" when the connected wallet owns the system', () => {
    expect(getOwnershipLabel(makeSystem({ owner: 'GME' }), 'GME')).toBe('You');
  });

  it("returns the owner's truncated address when someone else owns it", () => {
    const owner = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQR';
    expect(getOwnershipLabel(makeSystem({ owner }), 'GME')).toBe('GABCDE...OPQR');
  });

  it('returns the full owner address when no wallet is connected', () => {
    expect(getOwnershipLabel(makeSystem({ owner: 'GSOMEONE' }), null)).toBe('GSOMEONE');
  });
});

describe('StarSystem', () => {
  it('renders nothing when no system is selected', () => {
    const { container } = render(
      <StarSystem system={null} walletAddress="GME" onClose={() => {}} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the system's id, coordinates, resource, yield, and defense rating", () => {
    const system = makeSystem({ systemId: 5, coordX: 2, coordY: 1, resourceType: 'Plasma', resourceYield: 25, defenseRating: 12 });

    render(<StarSystem system={system} walletAddress="GME" onClose={() => {}} />);

    expect(screen.getByText(/System 5/)).toBeInTheDocument();
    expect(screen.getByText(/\(2, 1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Plasma/)).toBeInTheDocument();
    expect(screen.getByText(/25/)).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<StarSystem system={makeSystem()} walletAddress="GME" onClose={onClose} />);

    screen.getByRole('button', { name: /close/i }).click();

    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus to its close button when opened', async () => {
    render(<StarSystem system={makeSystem()} walletAddress="GME" onClose={() => {}} />);

    const closeButton = screen.getByRole('button', { name: /close system details/i });
    await waitFor(() => expect(closeButton).toHaveFocus());
  });

  it('shows a claim button for an unclaimed system and calls onClaim with the system id', () => {
    const onClaim = vi.fn();
    render(
      <StarSystem system={makeSystem({ systemId: 9, owner: null })} walletAddress="GME" onClose={() => {}} onClaim={onClaim} />
    );

    screen.getByRole('button', { name: /claim/i }).click();

    expect(onClaim).toHaveBeenCalledWith(9);
  });

  it('does not show a claim button for an already-owned system', () => {
    render(
      <StarSystem system={makeSystem({ owner: 'GME' })} walletAddress="GME" onClose={() => {}} onClaim={vi.fn()} />
    );

    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument();
  });

  it('does not show a claim button when no onClaim handler is given', () => {
    render(<StarSystem system={makeSystem({ owner: null })} walletAddress="GME" onClose={() => {}} />);

    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument();
  });

  it('shows a move-fleet button and calls onMoveFleet with the target system id', () => {
    const onMoveFleet = vi.fn();
    render(
      <StarSystem
        system={makeSystem({ systemId: 7 })}
        walletAddress="GME"
        fleet={makeFleet({ location: 0 })}
        onClose={() => {}}
        onMoveFleet={onMoveFleet}
      />
    );

    screen.getByRole('button', { name: /move fleet/i }).click();

    expect(onMoveFleet).toHaveBeenCalledWith(7);
  });

  it('does not show a move-fleet button when no onMoveFleet handler is given', () => {
    render(
      <StarSystem system={makeSystem({ systemId: 7 })} walletAddress="GME" fleet={makeFleet()} onClose={() => {}} />
    );

    expect(screen.queryByRole('button', { name: /move fleet/i })).not.toBeInTheDocument();
  });

  it('does not show a move-fleet button when the fleet has no units', () => {
    render(
      <StarSystem
        system={makeSystem({ systemId: 7 })}
        walletAddress="GME"
        fleet={makeFleet({ scouts: 0 })}
        onClose={() => {}}
        onMoveFleet={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /move fleet/i })).not.toBeInTheDocument();
  });

  it('does not show a move-fleet button when no fleet data is available', () => {
    render(
      <StarSystem system={makeSystem({ systemId: 7 })} walletAddress="GME" fleet={null} onClose={() => {}} onMoveFleet={vi.fn()} />
    );

    expect(screen.queryByRole('button', { name: /move fleet/i })).not.toBeInTheDocument();
  });

  it('shows an attack button for a system owned by someone else and calls onAttack with the system id', () => {
    const onAttack = vi.fn();
    render(
      <StarSystem
        system={makeSystem({ systemId: 7, owner: 'GENEMY' })}
        walletAddress="GME"
        fleet={makeFleet()}
        onClose={() => {}}
        onAttack={onAttack}
      />
    );

    screen.getByRole('button', { name: /attack/i }).click();

    expect(onAttack).toHaveBeenCalledWith(7);
  });

  it('does not show an attack button for an unclaimed system', () => {
    render(
      <StarSystem
        system={makeSystem({ systemId: 7, owner: null })}
        walletAddress="GME"
        fleet={makeFleet()}
        onClose={() => {}}
        onAttack={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /attack/i })).not.toBeInTheDocument();
  });

  it('does not show an attack button for a system owned by the connected wallet', () => {
    render(
      <StarSystem
        system={makeSystem({ systemId: 7, owner: 'GME' })}
        walletAddress="GME"
        fleet={makeFleet()}
        onClose={() => {}}
        onAttack={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /attack/i })).not.toBeInTheDocument();
  });

  it('does not show an attack button when the fleet has no units', () => {
    render(
      <StarSystem
        system={makeSystem({ systemId: 7, owner: 'GENEMY' })}
        walletAddress="GME"
        fleet={makeFleet({ scouts: 0 })}
        onClose={() => {}}
        onAttack={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /attack/i })).not.toBeInTheDocument();
  });

  it('does not show an attack button when no fleet data is available', () => {
    render(
      <StarSystem
        system={makeSystem({ systemId: 7, owner: 'GENEMY' })}
        walletAddress="GME"
        fleet={null}
        onClose={() => {}}
        onAttack={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /attack/i })).not.toBeInTheDocument();
  });

  it('does not show an attack button when no onAttack handler is given', () => {
    render(
      <StarSystem
        system={makeSystem({ systemId: 7, owner: 'GENEMY' })}
        walletAddress="GME"
        fleet={makeFleet()}
        onClose={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /attack/i })).not.toBeInTheDocument();
  });

  it('does not show a move-fleet button for the system the fleet is already at', () => {
    render(
      <StarSystem
        system={makeSystem({ systemId: 7 })}
        walletAddress="GME"
        fleet={makeFleet({ location: 7 })}
        onClose={() => {}}
        onMoveFleet={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /move fleet/i })).not.toBeInTheDocument();
  });
});
