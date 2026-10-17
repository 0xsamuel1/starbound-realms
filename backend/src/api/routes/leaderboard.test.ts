import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db/queries', () => ({
  fetchLeaderboard: vi.fn(),
}));

import { fetchLeaderboard } from '../../db/queries';
import { createLeaderboardRouter } from './leaderboard';

const db = {} as any;

function buildApp() {
  const app = express();
  app.use('/leaderboard', createLeaderboardRouter(db));
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return app;
}

beforeEach(() => {
  vi.mocked(fetchLeaderboard).mockClear();
});

describe('GET /leaderboard', () => {
  it('returns { players } with the leaderboard rows', async () => {
    const players = [
      { address: 'GAAA', systems_owned: 5 },
      { address: 'GBBB', systems_owned: 3 },
    ];
    vi.mocked(fetchLeaderboard).mockResolvedValue(players);

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ players });
    expect(vi.mocked(fetchLeaderboard)).toHaveBeenCalledWith(db);
  });

  it('returns an empty players array when no players exist', async () => {
    vi.mocked(fetchLeaderboard).mockResolvedValue([]);

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ players: [] });
  });

  it('forwards errors to the error handler', async () => {
    vi.mocked(fetchLeaderboard).mockRejectedValue(new Error('db down'));

    const res = await request(buildApp()).get('/leaderboard');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'db down');
  });
});
