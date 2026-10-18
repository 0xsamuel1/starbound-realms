import { describe, it, expect } from 'vitest';
import {
  NetworkError,
  SimulationError,
  TransactionRejectedError,
  TransactionFailedError,
  isTransientNetworkError,
} from './errors.js';

// ── instanceof checks ────────────────────────────────────────────────────────

describe('NetworkError', () => {
  it('is instanceof NetworkError and Error', () => {
    const err = new NetworkError('rpc down');
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).toBeInstanceOf(Error);
  });

  it('carries the provided message', () => {
    const err = new NetworkError('client error (SendRequest)');
    expect(err.message).toBe('client error (SendRequest)');
  });

  it('has name NetworkError', () => {
    expect(new NetworkError('').name).toBe('NetworkError');
  });
});

describe('SimulationError', () => {
  it('is instanceof SimulationError and Error', () => {
    const err = new SimulationError('get_system: simulation failed — contract panicked');
    expect(err).toBeInstanceOf(SimulationError);
    expect(err).toBeInstanceOf(Error);
  });

  it('carries the provided message', () => {
    const msg = 'get_system: simulation failed — system not found';
    expect(new SimulationError(msg).message).toBe(msg);
  });

  it('has name SimulationError', () => {
    expect(new SimulationError('').name).toBe('SimulationError');
  });
});

describe('TransactionRejectedError', () => {
  it('is instanceof TransactionRejectedError and Error', () => {
    const err = new TransactionRejectedError('transaction rejected: ERROR');
    expect(err).toBeInstanceOf(TransactionRejectedError);
    expect(err).toBeInstanceOf(Error);
  });

  it('message matches /rejected/', () => {
    expect(new TransactionRejectedError('transaction rejected: TRY_AGAIN_LATER').message).toMatch(/rejected/i);
  });

  it('has name TransactionRejectedError', () => {
    expect(new TransactionRejectedError('').name).toBe('TransactionRejectedError');
  });
});

describe('TransactionFailedError', () => {
  it('is instanceof TransactionFailedError and Error', () => {
    const err = new TransactionFailedError('transaction failed: FAILED');
    expect(err).toBeInstanceOf(TransactionFailedError);
    expect(err).toBeInstanceOf(Error);
  });

  it('message matches /failed/', () => {
    expect(new TransactionFailedError('transaction failed: FAILED').message).toMatch(/failed/i);
  });

  it('has name TransactionFailedError', () => {
    expect(new TransactionFailedError('').name).toBe('TransactionFailedError');
  });
});

// ── Distinct error types for each failure mode ───────────────────────────────

describe('error type hierarchy', () => {
  it('SimulationError is not a TransactionFailedError', () => {
    expect(new SimulationError('sim')).not.toBeInstanceOf(TransactionFailedError);
  });

  it('TransactionRejectedError is not a SimulationError', () => {
    expect(new TransactionRejectedError('rej')).not.toBeInstanceOf(SimulationError);
  });

  it('TransactionFailedError is not a TransactionRejectedError', () => {
    expect(new TransactionFailedError('fail')).not.toBeInstanceOf(TransactionRejectedError);
  });

  it('NetworkError is not a SimulationError', () => {
    expect(new NetworkError('net')).not.toBeInstanceOf(SimulationError);
  });
});

// ── isTransientNetworkError ──────────────────────────────────────────────────

describe('isTransientNetworkError', () => {
  it('returns true for a "client error (SendRequest)" message', () => {
    expect(isTransientNetworkError(new Error('client error (SendRequest)'))).toBe(true);
  });

  it('is case-insensitive for SendRequest', () => {
    expect(isTransientNetworkError(new Error('Client Error (SENDREQUEST)'))).toBe(true);
  });

  it('returns true for "network error"', () => {
    expect(isTransientNetworkError(new Error('network error'))).toBe(true);
  });

  it('returns true for fetch failed', () => {
    expect(isTransientNetworkError(new Error('fetch failed'))).toBe(true);
  });

  it('returns true for ECONNREFUSED', () => {
    expect(isTransientNetworkError(new Error('ECONNREFUSED'))).toBe(true);
  });

  it('returns false for a contract panic message', () => {
    expect(isTransientNetworkError(new Error('contract panicked: system not found'))).toBe(false);
  });

  it('returns false for a plain simulation error', () => {
    expect(isTransientNetworkError(new SimulationError('get_system: simulation failed — bad args'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientNetworkError('some string')).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError(42)).toBe(false);
  });
});
