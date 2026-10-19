import { useState, type KeyboardEvent } from 'react';
import { GalaxySystem } from '../hooks/useGalaxyData';

const CELL_SIZE = 32;
const CELL_GAP = 2;
const VIEWPORT_HEIGHT = 600;
const OVERSCAN_ROWS = 3;

/** Returns one past the furthest claimed/unclaimed coordinate in each axis. */
export function getGridDimensions(systems: GalaxySystem[]): { width: number; height: number } {
  if (systems.length === 0) {
    return { width: 0, height: 0 };
  }
  return {
    width: Math.max(...systems.map((s) => s.coordX)) + 1,
    height: Math.max(...systems.map((s) => s.coordY)) + 1,
  };
}

/** Returns the CSS color for a system cell, relative to the connected wallet. */
export function getSystemColor(system: GalaxySystem, walletAddress: string | null): string {
  if (!system.owner || !walletAddress) {
    return 'var(--unclaimed)';
  }
  return system.owner === walletAddress ? 'var(--accent)' : 'var(--red)';
}

/** Returns a complete accessible name for a galaxy cell. */
export function getSystemAriaLabel(system: GalaxySystem, walletAddress: string | null): string {
  const ownership = !system.owner
    ? 'unclaimed'
    : system.owner === walletAddress
      ? 'owned by you'
      : `owned by ${system.owner}`;

  return `System ${system.systemId}, ${ownership}, resource ${system.resourceType}`;
}

/** Selects only cells in (or just outside) the visible vertical window. */
export function getVisibleSystems(
  systems: GalaxySystem[],
  scrollTop: number,
  viewportHeight = VIEWPORT_HEIGHT,
): GalaxySystem[] {
  const rowHeight = CELL_SIZE + CELL_GAP;
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const lastRow = Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS;
  return systems.filter((system) => system.coordY >= firstRow && system.coordY <= lastRow);
}

export interface GalaxyMapProps {
  systems: GalaxySystem[];
  walletAddress: string | null;
  onSelectSystem?: (systemId: number, trigger: SVGRectElement) => void;
}

/** Renders the galaxy grid as an SVG, one cell per star system. */
export function GalaxyMap({ systems, walletAddress, onSelectSystem }: GalaxyMapProps) {
  const { width, height } = getGridDimensions(systems);
  const [scrollTop, setScrollTop] = useState(0);
  const svgWidth = width * (CELL_SIZE + CELL_GAP);
  const svgHeight = height * (CELL_SIZE + CELL_GAP);
  const visibleSystems = getVisibleSystems(systems, scrollTop);

  const selectSystem = (systemId: number, trigger: SVGRectElement) => {
    onSelectSystem?.(systemId, trigger);
  };

  const handleCellKeyDown = (event: KeyboardEvent<SVGRectElement>, systemId: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    selectSystem(systemId, event.currentTarget);
  };

  return (
    <div
      style={{ maxHeight: `${VIEWPORT_HEIGHT}px`, overflow: 'auto' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      aria-label="Galaxy map viewport"
    >
      <svg
        viewBox={`0 0 ${svgWidth || CELL_SIZE} ${svgHeight || CELL_SIZE}`}
        style={{ width: '100%', height: `${svgHeight || CELL_SIZE}px`, maxWidth: `${svgWidth}px` }}
        role="img"
        aria-label="Galaxy map"
      >
      {visibleSystems.map((system) => (
        <rect
          key={system.systemId}
          id={`galaxy-cell-${system.systemId}`}
          data-testid={`galaxy-cell-${system.systemId}`}
          x={system.coordX * (CELL_SIZE + CELL_GAP)}
          y={system.coordY * (CELL_SIZE + CELL_GAP)}
          width={CELL_SIZE}
          height={CELL_SIZE}
          rx={4}
          fill={getSystemColor(system, walletAddress)}
          stroke="var(--border)"
          style={{ cursor: onSelectSystem ? 'pointer' : 'default' }}
          role={onSelectSystem ? 'button' : 'img'}
          tabIndex={onSelectSystem ? 0 : undefined}
          aria-label={getSystemAriaLabel(system, walletAddress)}
          onClick={(event) => selectSystem(system.systemId, event.currentTarget)}
          onKeyDown={(event) => handleCellKeyDown(event, system.systemId)}
        >
          <title>{`System ${system.systemId} — ${system.resourceType}`}</title>
        </rect>
      ))}
      </svg>
    </div>
  );
}
