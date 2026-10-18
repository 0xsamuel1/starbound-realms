import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBattleHistory } from './useBattleHistory';

const PLAYER_ADDRESS = 'G' + 'A'.repeat(55);
const ENEMY_ADDRESS = 'G' + 'B'.repeat(55);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

// Shape exactly as the backend's `SELECT * FROM battles` returns it: raw
// Postgres column names (snake_case), BIGINT columns as strings, TIMESTAMPs
// as ISO strings, per node-postgres's default type parsing.
function rawBattle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    battle_id: '12',
    attacker: PLAYER_ADDRESS,
    defender: ENEMY_ADDRESS,
    system_id: 4,
    winner: PLAYER_ADDRESS,
    rounds: 3,
    ledger_sequence: '5000',
    created_at: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

function mockBattlesResponse(battles: unknown[], status = 200) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => ({ battles }),
  } as Response);
}

describe('useBattleHistory', () => {
  it('fetches from /player/:address/battles and maps snake_case fields to camelCase', async () => {
    mockBattlesResponse([rawBattle()]);

    const { result } = renderHook(() =>
      useBattleHistory('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `http://backend.example/player/${PLAYER_ADDRESS}/battles`
    );
    expect(result.current.battles).toEqual([
      {
        battleId: 12,
        attacker: PLAYER_ADDRESS,
        defender: ENEMY_ADDRESS,
        systemId: 4,
        winner: PLAYER_ADDRESS,
        rounds: 3,
        ledgerSequence: 5000,
        createdAt: Date.parse('2026-10-01T12:00:00.000Z'),
      },
    ]);
  });

  it('returns every past battle, not just the most recent one', async () => {
    mockBattlesResponse([
      rawBattle({ battle_id: '14' }),
      rawBattle({ battle_id: '13', winner: ENEMY_ADDRESS }),
      rawBattle({ battle_id: '12' }),
    ]);

    const { result } = renderHook(() =>
      useBattleHistory('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.battles.map((b) => b.battleId)).toEqual([14, 13, 12]);
  });

  it('does not fetch when the address is null (no wallet connected)', () => {
    const { result } = renderHook(() => useBattleHistory('http://backend.example', null));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.battles).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an empty list for a player with no battles yet', async () => {
    mockBattlesResponse([]);

    const { result } = renderHook(() =>
      useBattleHistory('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.battles).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sets an error and stops loading when the backend responds with a non-OK status', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const { result } = renderHook(() =>
      useBattleHistory('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/500/);
    expect(result.current.battles).toEqual([]);
  });

  it('sets an error instead of throwing when the network request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() =>
      useBattleHistory('http://backend.example', PLAYER_ADDRESS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/network down/);
  });

  it('re-fetches the history when refetch is called', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ battles: [rawBattle()] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ battles: [rawBattle(), rawBattle({ battle_id: '11' })] }),
      } as Response);

    const { result } = renderHook(() =>
      useBattleHistory('http://backend.example', PLAYER_ADDRESS)
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.battles).toHaveLength(1);

    await result.current.refetch();
    expect(fetch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.battles).toHaveLength(2));
  });
});
