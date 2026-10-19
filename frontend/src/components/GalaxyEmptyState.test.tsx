import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GalaxyEmptyState } from './GalaxyEmptyState';

describe('GalaxyEmptyState', () => {
  it('invites the player to be the first to claim on a brand-new galaxy', () => {
    render(<GalaxyEmptyState ownedCount={0} claimedCount={0} />);

    expect(screen.getByTestId('galaxy-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/no one has claimed a system yet/i)).toBeInTheDocument();
    expect(screen.getByText(/be the first/i)).toBeInTheDocument();
  });

  it('prompts a player who owns nothing even when others have claimed', () => {
    render(<GalaxyEmptyState ownedCount={0} claimedCount={12} />);

    expect(screen.getByTestId('galaxy-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/you have not claimed a system yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/be the first/i)).not.toBeInTheDocument();
  });

  it('renders nothing when the player already owns a system', () => {
    const { container } = render(<GalaxyEmptyState ownedCount={3} claimedCount={12} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('galaxy-empty-state')).not.toBeInTheDocument();
  });

  it('points the player at the claim flow', () => {
    render(<GalaxyEmptyState ownedCount={0} claimedCount={0} />);

    expect(screen.getByText(/claim/i)).toBeInTheDocument();
    expect(screen.getByText(/mining resources/i)).toBeInTheDocument();
  });
});
