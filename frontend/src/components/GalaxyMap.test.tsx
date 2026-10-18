import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getGridDimensions, getSystemAriaLabel, getSystemColor, GalaxyMap } from './GalaxyMap';
import { GalaxySystem } from '../hooks/useGalaxyData';

function makeSystem(overrides: Partial<GalaxySystem> = {}): GalaxySystem {
  return {
    systemId: 0,
    owner: null,
    coordX: 0,
    coordY: 0,
    resourceType: 'Iron',
    resourceYield: 10,
    defenseRating: 5,
    lastClaimed: 0,
    ...overrides,
  };
}

describe('getGridDimensions', () => {
  it('returns 0x0 for an empty galaxy', () => {
    expect(getGridDimensions([])).toEqual({ width: 0, height: 0 });
  });

  it('returns one past the max coordinate in each axis', () => {
    const systems = [makeSystem({ coordX: 3, coordY: 1 }), makeSystem({ coordX: 1, coordY: 5 })];

    expect(getGridDimensions(systems)).toEqual({ width: 4, height: 6 });
  });
});

describe('getSystemColor', () => {
  it('returns the unclaimed color for a system with no owner', () => {
    expect(getSystemColor(makeSystem({ owner: null }), 'GME')).toBe('var(--unclaimed)');
  });

  it("returns the accent color for a system owned by the current player", () => {
    expect(getSystemColor(makeSystem({ owner: 'GME' }), 'GME')).toBe('var(--accent)');
  });

  it('returns the red color for a system owned by someone else', () => {
    expect(getSystemColor(makeSystem({ owner: 'GOTHER' }), 'GME')).toBe('var(--red)');
  });

  it('treats a system as unclaimed-colored when no wallet is connected, even if it has an owner', () => {
    expect(getSystemColor(makeSystem({ owner: 'GOTHER' }), null)).toBe('var(--unclaimed)');
  });
});

describe('getSystemAriaLabel', () => {
  it('includes the id, unclaimed ownership, and resource type', () => {
    expect(getSystemAriaLabel(makeSystem({ systemId: 7, resourceType: 'Plasma' }), 'GME')).toBe(
      'System 7, unclaimed, resource Plasma'
    );
  });

  it('identifies a system owned by the connected player', () => {
    expect(getSystemAriaLabel(makeSystem({ systemId: 3, owner: 'GME' }), 'GME')).toBe(
      'System 3, owned by you, resource Iron'
    );
  });

  it("includes another system owner's address", () => {
    expect(getSystemAriaLabel(makeSystem({ systemId: 4, owner: 'GOTHER' }), 'GME')).toBe(
      'System 4, owned by GOTHER, resource Iron'
    );
  });
});

describe('GalaxyMap', () => {
  it('renders one cell per system, without errors', () => {
    const systems = [makeSystem({ systemId: 0 }), makeSystem({ systemId: 1, coordX: 1 })];

    render(<GalaxyMap systems={systems} walletAddress={null} />);

    expect(screen.getAllByTestId(/galaxy-cell-/)).toHaveLength(2);
  });

  it('positions each cell at its coordinates, not transposed', () => {
    const systems = [makeSystem({ systemId: 0, coordX: 3, coordY: 1 })];

    render(<GalaxyMap systems={systems} walletAddress={null} />);

    const cell = screen.getByTestId('galaxy-cell-0');
    const x = Number(cell.getAttribute('x'));
    const y = Number(cell.getAttribute('y'));
    expect(x).toBeGreaterThan(y);
  });

  it("colors each cell by the system's owner relative to the connected wallet", () => {
    const systems = [
      makeSystem({ systemId: 0, owner: null }),
      makeSystem({ systemId: 1, coordX: 1, owner: 'GME' }),
      makeSystem({ systemId: 2, coordX: 2, owner: 'GOTHER' }),
    ];

    render(<GalaxyMap systems={systems} walletAddress="GME" />);

    expect(screen.getByTestId('galaxy-cell-0')).toHaveAttribute('fill', 'var(--unclaimed)');
    expect(screen.getByTestId('galaxy-cell-1')).toHaveAttribute('fill', 'var(--accent)');
    expect(screen.getByTestId('galaxy-cell-2')).toHaveAttribute('fill', 'var(--red)');
  });

  it('shows the system id and resource type on hover via a native title', () => {
    const systems = [makeSystem({ systemId: 7, resourceType: 'Plasma' })];

    render(<GalaxyMap systems={systems} walletAddress={null} />);

    expect(screen.getByTestId('galaxy-cell-7').querySelector('title')?.textContent).toBe(
      'System 7 — Plasma'
    );
  });

  it('calls onSelectSystem with the system id when a cell is clicked', () => {
    const systems = [makeSystem({ systemId: 3 })];
    let selected: number | null = null;

    render(<GalaxyMap systems={systems} walletAddress={null} onSelectSystem={(id) => (selected = id)} />);
    fireEvent.click(screen.getByTestId('galaxy-cell-3'));

    expect(selected).toBe(3);
  });

  it('makes each cell focusable as a button when selection is enabled', () => {
    const systems = [makeSystem({ systemId: 4 })];

    render(<GalaxyMap systems={systems} walletAddress={null} onSelectSystem={() => {}} />);

    const cell = screen.getByTestId('galaxy-cell-4');
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(cell).toHaveAttribute('role', 'button');
  });

  it('leaves cells out of the tab order when selection is disabled', () => {
    const systems = [makeSystem({ systemId: 4 })];

    render(<GalaxyMap systems={systems} walletAddress={null} />);

    const cell = screen.getByTestId('galaxy-cell-4');
    expect(cell).not.toHaveAttribute('tabindex');
    expect(cell).toHaveAttribute('role', 'img');
    expect(cell).toHaveAccessibleName('System 4, unclaimed, resource Iron');
  });

  it.each(['Enter', ' '])('calls onSelectSystem when a cell receives the %j key', (key) => {
    const systems = [makeSystem({ systemId: 6 })];
    let selected: number | null = null;

    render(<GalaxyMap systems={systems} walletAddress={null} onSelectSystem={(id) => (selected = id)} />);
    fireEvent.keyDown(screen.getByTestId('galaxy-cell-6'), { key });

    expect(selected).toBe(6);
  });

  it('ignores other keys on a cell', () => {
    const systems = [makeSystem({ systemId: 6 })];
    let selected: number | null = null;

    render(<GalaxyMap systems={systems} walletAddress={null} onSelectSystem={(id) => (selected = id)} />);
    fireEvent.keyDown(screen.getByTestId('galaxy-cell-6'), { key: 'a' });

    expect(selected).toBeNull();
  });

  it('renders an empty grid without errors when there are no systems', () => {
    render(<GalaxyMap systems={[]} walletAddress={null} />);

    expect(screen.queryAllByTestId(/galaxy-cell-/)).toHaveLength(0);
  });
});
