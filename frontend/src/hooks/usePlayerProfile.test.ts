import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePlayerProfile } from './usePlayerProfile';

const PLAYER_ADDRESS = 'G' + 'A'.repeat(55);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// Shape exactly as the backend's `SELECT * FROM players` returns it: raw
// Postgres column names (snake_case) plus TIMESTAMP columns as ISO strings.
function rawPlayer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    address: PLAYER_ADDRESS,
    systems_owned: 3,
    battles_won: 5,
    battles_lost: 2,
    first_seen: '2026-10-01T12:00:00.000Z',
    last_active: '2026-10-02T12:00:00.000Z',
    ...overrides,
  };
}

function mockProfileResponse(player: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => ({ player }),
  } as Response);
}

describe('usePlayerProfile', () => {
  it('fetches from /player/:address and maps snake_case fields to the camelCase shape', async () => {
    mockProfileResponse(rawPlayer());

    const { result } = renderHook(() =>
      usePlayerProfile('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`http://backend.example/player/${PLAYER_ADDRESS}`);
    expect(result.current.profile).toEqual({
      address: PLAYER_ADDRESS,
      systemsOwned: 3,
      battlesWon: 5,
      battlesLost: 2,
    });
  });

  it('does not fetch when the address is null (no wallet connected)', () => {
    const { result } = renderHook(() => usePlayerProfile('http://backend.example', null));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('re-fetches when the address changes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ player: rawPlayer() }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          player: rawPlayer({ address: 'G' + 'B'.repeat(55), systems_owned: 9 }),
        }),
      } as Response);

    const { result, rerender } = renderHook(
      ({ address }: { address: string | null }) =>
        usePlayerProfile('http://backend.example', address),
      { initialProps: { address: PLAYER_ADDRESS as string | null } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profile?.systemsOwned).toBe(3);

    rerender({ address: 'G' + 'B'.repeat(55) });
    await waitFor(() => expect(result.current.profile?.address).toBe('G' + 'B'.repeat(55)));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces the backend message for a 404 (unknown player)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Player not found' }),
    } as Response);

    const { result } = renderHook(() =>
      usePlayerProfile('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBe('Player not found');
  });

  it('sets an error and stops loading when the backend responds with a non-OK status', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() =>
      usePlayerProfile('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/500/);
    expect(result.current.profile).toBeNull();
  });

  it('sets an error instead of throwing when the network request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() =>
      usePlayerProfile('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/network down/);
  });
});
