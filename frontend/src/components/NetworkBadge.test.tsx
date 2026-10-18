import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetworkBadge } from './NetworkBadge';

describe('NetworkBadge', () => {
  it('labels testnet', () => {
    render(<NetworkBadge network="Testnet" />);

    expect(screen.getByLabelText('Network: Testnet')).toHaveTextContent('Testnet');
  });

  it('labels mainnet', () => {
    render(<NetworkBadge network="Mainnet" />);

    expect(screen.getByLabelText('Network: Mainnet')).toHaveTextContent('Mainnet');
  });
});
