import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRecentBattles, RECENT_BATTLES_PAGE_SIZE } from './useRecentBattles';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// Shape exactly as the backend's `SELECT * FROM battles` returns it.
function rawBattle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    battle_id: '12',
    attacker: 'GATTACKER',
    defender: 'GDEFENDER',
    system_id: 4,
    winner: 'GATTACKER',
    rounds: 3,
    ledger_sequence: '5000',
    created_at: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

function mockBattlesResponse(battles: unknown[]) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ battles }),
  } as Response);
}

describe('useRecentBattles', () => {
  it('fetches the first page from /battles and maps snake_case fields to camelCase', async () => {
    mockBattlesResponse([rawBattle()]);

    const { result } = renderHook(() => useRecentBattles('http://backend.example'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetch).toHaveBeenCalledWith(
      `http://backend.example/battles?limit=${RECENT_BATTLES_PAGE_SIZE}&offset=0`
    );
    expect(result.current.battles).toEqual([
      {
        battleId: 12,
        attacker: 'GATTACKER',
        defender: 'GDEFENDER',
        systemId: 4,
        winner: 'GATTACKER',
        rounds: 3,
        ledgerSequence: 5000,
        createdAt: Date.parse('2026-10-01T12:00:00.000Z'),
      },
    ]);
  });

  it('has no previous page on the first page, and a next page only when this one is full', async () => {
    mockBattlesResponse([rawBattle()]);

    const { result } = renderHook(() => useRecentBattles('http://backend.example'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPreviousPage).toBe(false);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('moves forward and back by one page size', async () => {
    mockBattlesResponse([]);

    const { result } = renderHook(() => useRecentBattles('http://backend.example'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.goToNextPage());
    await waitFor(() => expect(result.current.hasPreviousPage).toBe(true));
    expect(fetch).toHaveBeenLastCalledWith(
      `http://backend.example/battles?limit=${RECENT_BATTLES_PAGE_SIZE}&offset=${RECENT_BATTLES_PAGE_SIZE}`
    );

    act(() => result.current.goToPreviousPage());
    await waitFor(() => expect(result.current.hasPreviousPage).toBe(false));
    expect(fetch).toHaveBeenLastCalledWith(
      `http://backend.example/battles?limit=${RECENT_BATTLES_PAGE_SIZE}&offset=0`
    );
  });

  it('sets an error instead of throwing when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const { result } = renderHook(() => useRecentBattles('http://backend.example'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('failed to fetch battles: 500');
    expect(result.current.battles).toEqual([]);
  });
});
