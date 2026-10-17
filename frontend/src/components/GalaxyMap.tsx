import type { KeyboardEvent } from 'react';
import { GalaxySystem } from '../hooks/useGalaxyData';

const CELL_SIZE = 32;
const CELL_GAP = 2;

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

export interface GalaxyMapProps {
  systems: GalaxySystem[];
  walletAddress: string | null;
  onSelectSystem?: (systemId: number) => void;
}

/** Renders the galaxy grid as an SVG, one cell per star system. */
export function GalaxyMap({ systems, walletAddress, onSelectSystem }: GalaxyMapProps) {
  const { width, height } = getGridDimensions(systems);
  const svgWidth = width * (CELL_SIZE + CELL_GAP);
  const svgHeight = height * (CELL_SIZE + CELL_GAP);

  const handleCellKeyDown = (event: KeyboardEvent<SVGRectElement>, systemId: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    onSelectSystem?.(systemId);
  };

  return (
    <svg
      viewBox={`0 0 ${svgWidth || CELL_SIZE} ${svgHeight || CELL_SIZE}`}
      style={{ width: '100%', height: 'auto', maxWidth: `${svgWidth}px` }}
      role="img"
      aria-label="Galaxy map"
    >
      {systems.map((system) => (
        <rect
          key={system.systemId}
          data-testid={`galaxy-cell-${system.systemId}`}
          x={system.coordX * (CELL_SIZE + CELL_GAP)}
          y={system.coordY * (CELL_SIZE + CELL_GAP)}
          width={CELL_SIZE}
          height={CELL_SIZE}
          rx={4}
          fill={getSystemColor(system, walletAddress)}
          stroke="var(--border)"
          style={{ cursor: onSelectSystem ? 'pointer' : 'default' }}
          role={onSelectSystem ? 'button' : undefined}
          tabIndex={onSelectSystem ? 0 : undefined}
          aria-label={onSelectSystem ? `System ${system.systemId}: ${system.resourceType}` : undefined}
          onClick={() => onSelectSystem?.(system.systemId)}
          onKeyDown={(event) => handleCellKeyDown(event, system.systemId)}
        >
          <title>{`System ${system.systemId} — ${system.resourceType}`}</title>
        </rect>
      ))}
    </svg>
  );
}
