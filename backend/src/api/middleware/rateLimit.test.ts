import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { standardLimiter, strictLimiter } from './rateLimit';

function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.get('/ping', limiter, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('standardLimiter', () => {
  it('allows requests under the 100-per-minute limit', async () => {
    const app = buildApp(standardLimiter);

    const res = await request(app).get('/ping');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('exposes RateLimit headers and not the legacy X-RateLimit headers', async () => {
    const res = await request(buildApp(standardLimiter)).get('/ping');

    expect(res.headers).toHaveProperty('ratelimit-limit', '100');
    expect(res.headers).not.toHaveProperty('x-ratelimit-limit');
  });

  it('returns 429 with a JSON error once the limit is exceeded', async () => {
    const app = buildApp(standardLimiter);
    for (let i = 0; i < 100; i++) {
      await request(app).get('/ping');
    }

    const res = await request(app).get('/ping');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests, please try again later.' });
  });
});

describe('strictLimiter', () => {
  it('allows requests under the 10-per-minute limit', async () => {
    const res = await request(buildApp(strictLimiter)).get('/ping');

    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty('ratelimit-limit', '10');
  });

  it('returns 429 once more than 10 requests are made within the window', async () => {
    const app = buildApp(strictLimiter);
    for (let i = 0; i < 10; i++) {
      await request(app).get('/ping');
    }

    const res = await request(app).get('/ping');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests, please try again later.' });
  });
});
