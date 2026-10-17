import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Route factories are replaced with stub routers so these tests only verify
// that index.ts mounts each path, not the behaviour of the routers themselves.
vi.mock('./api/routes/galaxy', async () => {
  const { Router } = await import('express');
  return {
    createGalaxyRouter: vi.fn(() => {
      const r = Router();
      r.get('/', (_req, res) => res.json({ route: 'galaxy' }));
      return r;
    }),
  };
});

vi.mock('./api/routes/player', async () => {
  const { Router } = await import('express');
  return {
    createPlayerRouter: vi.fn(() => {
      const r = Router();
      r.get('/', (_req, res) => res.json({ route: 'player' }));
      return r;
    }),
  };
});

vi.mock('./api/routes/battle', async () => {
  const { Router } = await import('express');
  return {
    createBattleRouter: vi.fn(() => {
      const r = Router();
      r.get('/', (_req, res) => res.json({ route: 'battles' }));
      return r;
    }),
  };
});

vi.mock('./api/routes/fleet', async () => {
  const { Router } = await import('express');
  return {
    createFleetRouter: vi.fn(() => {
      const r = Router();
      r.get('/', (_req, res) => res.json({ route: 'fleet' }));
      return r;
    }),
  };
});

vi.mock('./indexer/indexer', () => ({
  startIndexer: vi.fn(() => Promise.resolve()),
}));

vi.mock('./db/queries', () => ({
  fetchLeaderboard: vi.fn(() => Promise.resolve([{ address: 'GA', systems_owned: 2 }])),
}));

vi.mock('pg', () => ({
  Pool: vi.fn(function () {
    return {};
  }),
}));

// index.ts calls app.listen() on import; stub it so no real port is opened.
vi.mock('express', async (importOriginal) => {
  const mod = await importOriginal<typeof import('express')>();
  const wrapped = Object.assign(
    () => {
      const app = mod.default();
      app.listen = vi.fn(() => ({ close: vi.fn() })) as any;
      return app;
    },
    { json: mod.default.json, Router: mod.default.Router, static: mod.default.static }
  );
  return { ...mod, default: wrapped, Router: mod.default.Router };
});

import { createGalaxyRouter } from './api/routes/galaxy';
import { createPlayerRouter } from './api/routes/player';
import { createBattleRouter } from './api/routes/battle';
import { createFleetRouter } from './api/routes/fleet';
import { startIndexer } from './indexer/indexer';
import { Pool } from 'pg';

async function loadApp() {
  vi.resetModules();
  const mod = await import('./index');
  return mod.default;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('index.ts app wiring', () => {
  it('responds to GET /health with status ok and a timestamp', async () => {
    const app = await loadApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('mounts the galaxy, player, battles and fleet routers at their prefixes', async () => {
    const app = await loadApp();

    expect((await request(app).get('/galaxy')).body).toEqual({ route: 'galaxy' });
    expect((await request(app).get('/player')).body).toEqual({ route: 'player' });
    expect((await request(app).get('/battles')).body).toEqual({ route: 'battles' });
    expect((await request(app).get('/fleet')).body).toEqual({ route: 'fleet' });
  });

  it('passes a single shared Pool to every router', async () => {
    await loadApp();

    const pool = vi.mocked(Pool).mock.results[0].value;
    expect(vi.mocked(createGalaxyRouter).mock.calls[0][0]).toBe(pool);
    expect(vi.mocked(createPlayerRouter).mock.calls[0][0]).toBe(pool);
    expect(vi.mocked(createBattleRouter).mock.calls[0][0]).toBe(pool);
    expect(vi.mocked(createFleetRouter).mock.calls[0][0]).toBe(pool);
  });

  it('serves GET /leaderboard through the strict rate limiter and the database', async () => {
    const app = await loadApp();

    const res = await request(app).get('/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ players: [{ address: 'GA', systems_owned: 2 }] });
    expect(res.headers).toHaveProperty('ratelimit-limit', '10');
  });

  it('sends leaderboard failures through the central error handler', async () => {
    const { fetchLeaderboard } = await import('./db/queries');
    vi.mocked(fetchLeaderboard).mockRejectedValueOnce(
      Object.assign(new Error('leaderboard unavailable'), { statusCode: 503 })
    );
    const app = await loadApp();

    const res = await request(app).get('/leaderboard');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'leaderboard unavailable' });
  });

  it('does not start the indexer when SOROBAN_RPC_URL is missing', async () => {
    vi.stubEnv('SOROBAN_RPC_URL', '');
    vi.stubEnv('CONTRACT_GALAXY_MAP', 'CGALAXY');

    await loadApp();

    expect(startIndexer).not.toHaveBeenCalled();
  });

  it('does not start the indexer when no CONTRACT_* ids are configured', async () => {
    vi.stubEnv('SOROBAN_RPC_URL', 'https://rpc.example');
    vi.stubEnv('CONTRACT_GALAXY_MAP', '');
    vi.stubEnv('CONTRACT_RESOURCES', '');
    vi.stubEnv('CONTRACT_FLEET', '');
    vi.stubEnv('CONTRACT_BATTLE', '');

    await loadApp();

    expect(startIndexer).not.toHaveBeenCalled();
  });

  it('starts the indexer with configured contract ids when RPC and contracts are set', async () => {
    vi.stubEnv('SOROBAN_RPC_URL', 'https://rpc.example');
    vi.stubEnv('CONTRACT_GALAXY_MAP', 'CGALAXY');
    vi.stubEnv('CONTRACT_RESOURCES', '');
    vi.stubEnv('CONTRACT_FLEET', 'CFLEET');
    vi.stubEnv('CONTRACT_BATTLE', '');
    vi.stubEnv('INDEXER_POLL_INTERVAL_MS', '1000');

    await loadApp();

    expect(startIndexer).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcUrl: 'https://rpc.example',
        contractIds: ['CGALAXY', 'CFLEET'],
        pollIntervalMs: 1000,
      })
    );
  });
});
