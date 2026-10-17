import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getAllBalances = vi.fn();

vi.mock('@starbound-realms/sdk', () => ({
  ResourcesClient: vi.fn().mockImplementation(() => ({ getAllBalances })),
}));
vi.mock('../lib/starboundClient', () => ({
  getStarboundClient: vi.fn().mockReturnValue({}),
}));

import { useResourceBalances } from './useResourceBalances';

const SOME_BALANCES = { Iron: 120n, Energy: 45n, Plasma: 0n };

beforeEach(() => {
  getAllBalances.mockReset();
});

describe('useResourceBalances', () => {
  it('returns null balances and does not fetch when no wallet is connected', () => {
    const { result } = renderHook(() => useResourceBalances(null));

    expect(result.current.balances).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getAllBalances).not.toHaveBeenCalled();
  });

  it('fetches all three balances for the given player once connected', async () => {
    getAllBalances.mockResolvedValue(SOME_BALANCES);

    const { result } = renderHook(() => useResourceBalances('GPLAYER'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.balances).toEqual(SOME_BALANCES);
    expect(getAllBalances).toHaveBeenCalledWith('GPLAYER');
  });

  it('sets an error instead of throwing when the read fails', async () => {
    getAllBalances.mockRejectedValue(new Error('rpc down'));

    const { result } = renderHook(() => useResourceBalances('GPLAYER'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('rpc down');
    expect(result.current.balances).toBeNull();
  });
});
