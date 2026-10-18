import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const findMissingTrustlines = vi.fn();
const establishTrustlines = vi.fn();

vi.mock('@starbound-realms/sdk', () => ({
  ResourcesClient: vi.fn().mockImplementation(() => ({ findMissingTrustlines, establishTrustlines })),
}));
vi.mock('../lib/starboundClient', () => ({
  getStarboundClient: vi.fn().mockReturnValue({ networkPassphrase: 'Test SDF Network ; September 2015' }),
  getResourceIssuer: vi.fn().mockReturnValue('GISSUER'),
}));

import { useTrustlines } from './useTrustlines';

const signTransaction = vi.fn().mockResolvedValue('SIGNED');

beforeEach(() => {
  findMissingTrustlines.mockReset();
  establishTrustlines.mockReset();
});

describe('useTrustlines', () => {
  it('reports nothing and checks nothing when no wallet is connected', () => {
    const { result } = renderHook(() => useTrustlines(null, signTransaction));

    expect(result.current.missing).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(findMissingTrustlines).not.toHaveBeenCalled();
  });

  it("checks the connected player's trustlines against the resource issuer", async () => {
    findMissingTrustlines.mockResolvedValue(['PLSM']);

    const { result } = renderHook(() => useTrustlines('GPLAYER', signTransaction));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.missing).toEqual(['PLSM']));
    expect(result.current.isLoading).toBe(false);
    expect(findMissingTrustlines).toHaveBeenCalledWith('GPLAYER', 'GISSUER');
  });

  it('reports an empty list when every trustline already exists', async () => {
    findMissingTrustlines.mockResolvedValue([]);

    const { result } = renderHook(() => useTrustlines('GPLAYER', signTransaction));

    await waitFor(() => expect(result.current.missing).toEqual([]));
  });

  it('does not ask for a signature on its own, only when setUpTrustlines is called', async () => {
    findMissingTrustlines.mockResolvedValue(['IRON', 'NRGY', 'PLSM']);

    const { result } = renderHook(() => useTrustlines('GPLAYER', signTransaction));
    await waitFor(() => expect(result.current.missing).toHaveLength(3));

    expect(establishTrustlines).not.toHaveBeenCalled();
  });

  it('setUpTrustlines establishes them with the player as signer, then re-checks', async () => {
    findMissingTrustlines.mockResolvedValueOnce(['IRON']).mockResolvedValueOnce([]);
    establishTrustlines.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTrustlines('GPLAYER', signTransaction));
    await waitFor(() => expect(result.current.missing).toEqual(['IRON']));

    await act(async () => {
      await result.current.setUpTrustlines();
    });

    expect(establishTrustlines).toHaveBeenCalledWith('GPLAYER', 'GISSUER', expect.any(Function));
    const signer = establishTrustlines.mock.calls[0][2];
    await signer('UNSIGNED');
    expect(signTransaction).toHaveBeenCalledWith('UNSIGNED', 'Test SDF Network ; September 2015');
    expect(result.current.missing).toEqual([]);
  });

  it('surfaces a failed setup as an error and keeps the missing list', async () => {
    findMissingTrustlines.mockResolvedValue(['IRON']);
    establishTrustlines.mockRejectedValue(new Error('User declined'));
    const { result } = renderHook(() => useTrustlines('GPLAYER', signTransaction));
    await waitFor(() => expect(result.current.missing).toEqual(['IRON']));

    await act(async () => {
      await result.current.setUpTrustlines();
    });

    expect(result.current.error).toMatch(/declined/);
    expect(result.current.missing).toEqual(['IRON']);
    expect(result.current.isSettingUp).toBe(false);
  });

  it('surfaces a failed check as an error instead of throwing', async () => {
    findMissingTrustlines.mockRejectedValue(new Error('fetch failed'));

    const { result } = renderHook(() => useTrustlines('GPLAYER', signTransaction));

    await waitFor(() => expect(result.current.error).toMatch(/fetch failed/));
    expect(result.current.missing).toBeNull();
  });
});
