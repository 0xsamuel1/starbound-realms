import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler, AppError } from './errorHandler';

function buildApp(error: AppError) {
  const app = express();
  app.get('/boom', (_req, _res, next) => next(error));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('errorHandler', () => {
  it('responds with 500 and the error message when no statusCode is set', async () => {
    const res = await request(buildApp(new Error('something broke'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'something broke' });
  });

  it('uses the statusCode carried by the error', async () => {
    const err: AppError = Object.assign(new Error('Invalid battle ID'), { statusCode: 400 });

    const res = await request(buildApp(err)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid battle ID' });
  });

  it('falls back to 500 when the error message is empty', async () => {
    const res = await request(buildApp(new Error(''))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  it('logs the status code and message to the console', async () => {
    await request(buildApp(Object.assign(new Error('Not here'), { statusCode: 404 }))).get('/boom');

    expect(console.error).toHaveBeenCalledWith('[Error] 404 — Not here');
  });

  it('omits the stack trace outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await request(buildApp(new Error('hidden'))).get('/boom');

    expect(res.body).not.toHaveProperty('stack');
  });

  it('includes the stack trace in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const err = new Error('visible');

    const res = await request(buildApp(err)).get('/boom');

    expect(res.body).toHaveProperty('stack', err.stack);
  });
});
