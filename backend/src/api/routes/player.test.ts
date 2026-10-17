import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db/queries', () => ({
  fetchPlayerByAddress: vi.fn(),
  fetchBattlesByPlayer: vi.fn(),
}));

import { fetchPlayerByAddress, fetchBattlesByPlayer } from '../../db/queries';
import { createPlayerRouter } from './player';

const db = {} as any;

/** A syntactically valid 56-char Stellar address starting with G */
const VALID_ADDRESS = 'G' + 'A'.repeat(55);
/** A well-formed but unknown address — same length/prefix, different content */
const UNKNOWN_ADDRESS = 'G' + 'B'.repeat(55);

function buildApp() {
  const app = express();
  app.use('/player', createPlayerRouter(db));
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return app;
}

beforeEach(() => {
  vi.mocked(fetchPlayerByAddress).mockClear();
  vi.mocked(fetchBattlesByPlayer).mockClear();
});

// ── GET /player/:address ──────────────────────────────────────────────────────

describe('GET /player/:address', () => {
  it('returns 400 for a malformed address without querying the database', async () => {
    const res = await request(buildApp()).get('/player/not-a-valid-address');

    expect(res.status).toBe(400);
    expect(fetchPlayerByAddress).not.toHaveBeenCalled();
  });

  it('returns 400 for an address that is the right prefix but wrong length', async () => {
    const res = await request(buildApp()).get('/player/GSHORT');

    expect(res.status).toBe(400);
    expect(fetchPlayerByAddress).not.toHaveBeenCalled();
  });

  it('returns 404 for a well-formed but unknown address', async () => {
    vi.mocked(fetchPlayerByAddress).mockResolvedValue(null);

    const res = await request(buildApp()).get(`/player/${UNKNOWN_ADDRESS}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(fetchPlayerByAddress).toHaveBeenCalledWith(db, UNKNOWN_ADDRESS);
  });

  it('returns the player profile for a known address', async () => {
    const player = { address: VALID_ADDRESS, systems_owned: 3, battles_won: 1, battles_lost: 0 };
    vi.mocked(fetchPlayerByAddress).mockResolvedValue(player);

    const res = await request(buildApp()).get(`/player/${VALID_ADDRESS}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ player });
  });
});

// ── GET /player/:address/battles ──────────────────────────────────────────────

describe('GET /player/:address/battles', () => {
  it('returns 400 for a malformed address without querying the database', async () => {
    const res = await request(buildApp()).get('/player/BADADDR/battles');

    expect(res.status).toBe(400);
    expect(fetchBattlesByPlayer).not.toHaveBeenCalled();
  });

  it('returns an empty battle history for a valid address with no battles', async () => {
    vi.mocked(fetchBattlesByPlayer).mockResolvedValue([]);

    const res = await request(buildApp()).get(`/player/${VALID_ADDRESS}/battles`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ battles: [] });
  });

  it('returns the battle history for a known address', async () => {
    const battles = [
      { battle_id: 1, attacker: VALID_ADDRESS, defender: UNKNOWN_ADDRESS, winner: VALID_ADDRESS },
    ];
    vi.mocked(fetchBattlesByPlayer).mockResolvedValue(battles);

    const res = await request(buildApp()).get(`/player/${VALID_ADDRESS}/battles`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ battles });
    expect(fetchBattlesByPlayer).toHaveBeenCalledWith(db, VALID_ADDRESS);
  });
});
