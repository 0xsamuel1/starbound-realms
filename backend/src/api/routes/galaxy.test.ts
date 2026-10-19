import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db/queries', () => ({
  fetchAllStarSystems: vi.fn(),
  fetchStarSystemById: vi.fn(),
}));

import { fetchAllStarSystems, fetchStarSystemById } from '../../db/queries';
import { createGalaxyRouter } from './galaxy';

const db = {} as any;

function buildApp() {
  const app = express();
  app.use('/galaxy', createGalaxyRouter(db));
  // minimal error handler that uses statusCode thrown by the route
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });
  return app;
}

beforeEach(() => {
  vi.mocked(fetchAllStarSystems).mockClear();
  vi.mocked(fetchStarSystemById).mockClear();
});

describe('GET /galaxy', () => {
  it('returns { systems } with all star systems', async () => {
    const systems = [{ system_id: 1 }, { system_id: 2 }];
    vi.mocked(fetchAllStarSystems).mockResolvedValue(systems);

    const res = await request(buildApp()).get('/galaxy');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      systems,
      pagination: { limit: 100, offset: 0, count: 2, hasMore: false, nextOffset: null },
    });
    expect(vi.mocked(fetchAllStarSystems)).toHaveBeenCalledWith(db, 100, 0);
  });

  it('applies bounded limit and offset pagination', async () => {
    vi.mocked(fetchAllStarSystems).mockResolvedValue([{ system_id: 21 }]);

    const res = await request(buildApp()).get('/galaxy?limit=25&offset=50');

    expect(res.status).toBe(200);
    expect(vi.mocked(fetchAllStarSystems)).toHaveBeenCalledWith(db, 25, 50);
    expect(res.body.pagination).toMatchObject({ limit: 25, offset: 50, count: 1, hasMore: false });
  });

  it('rejects invalid pagination parameters', async () => {
    const res = await request(buildApp()).get('/galaxy?limit=-1');
    expect(res.status).toBe(400);
  });
});

describe('GET /galaxy/:systemId', () => {
  it('returns the system for a known id', async () => {
    const system = { system_id: 5, owner: null };
    vi.mocked(fetchStarSystemById).mockResolvedValue(system);

    const res = await request(buildApp()).get('/galaxy/5');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ system });
    expect(vi.mocked(fetchStarSystemById)).toHaveBeenCalledWith(db, 5);
  });

  it('returns 404 for an unknown system id', async () => {
    vi.mocked(fetchStarSystemById).mockResolvedValue(null);

    const res = await request(buildApp()).get('/galaxy/999');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for a non-numeric system id', async () => {
    const res = await request(buildApp()).get('/galaxy/abc');

    expect(res.status).toBe(400);
    expect(fetchStarSystemById).not.toHaveBeenCalled();
  });
});
