import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLeaderboard } from './useLeaderboard';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// Shape exactly as the backend's `SELECT * FROM players` returns it: raw
// Postgres column names (snake_case) plus TIMESTAMP columns as ISO strings.
function rawPlayer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    address: 'GTOPPLAYER',
    systems_owned: 7,
    battles_won: 4,
    battles_lost: 1,
    first_seen: '2026-10-01T12:00:00.000Z',
    last_active: '2026-10-02T12:00:00.000Z',
    ...overrides,
  };
}

function mockLeaderboardResponse(players: unknown[]) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ players }),
  } as Response);
}

describe('useLeaderboard', () => {
  it('fetches from /leaderboard and maps snake_case fields to the camelCase shape', async () => {
    mockLeaderboardResponse([rawPlayer()]);

    const { result } = renderHook(() => useLeaderboard('http://backend.example'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://backend.example/leaderboard');
    expect(result.current.players).toEqual([
      {
        address: 'GTOPPLAYER',
        systemsOwned: 7,
        battlesWon: 4,
        battlesLost: 1,
      },
    ]);
  });

  it('keeps the players in the backend order (systems owned, descending)', async () => {
    mockLeaderboardResponse([
      rawPlayer({ address: 'GSECOND', systems_owned: 3 }),
      rawPlayer({ address: 'GTOP', systems_owned: 9 }),
      rawPlayer({ address: 'GTHIRD', systems_owned: 1 }),
    ]);

    const { result } = renderHook(() => useLeaderboard('http://backend.example'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.players.map((p) => p.address)).toEqual(['GSECOND', 'GTOP', 'GTHIRD']);
    expect(result.current.players.map((p) => p.systemsOwned)).toEqual([3, 9, 1]);
  });

  it('starts with isLoading true and no error', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLeaderboard('http://backend.example'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.players).toEqual([]);
  });

  it('sets an error and stops loading when the backend responds with a non-OK status', async () => {
    // e.g. the strict rate limiter answering 429 on the leaderboard route
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response);

    const { result } = renderHook(() => useLeaderboard('http://backend.example'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/429/);
    expect(result.current.players).toEqual([]);
  });

  it('sets an error instead of throwing when the network request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useLeaderboard('http://backend.example'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/network down/);
  });

  it('fetches exactly once — no retry storm against the rate-limited endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response);

    const { result } = renderHook(() => useLeaderboard('http://backend.example'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Give any (buggy) retry timer a chance to fire before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.error).toMatch(/429/);
  });
});
