/**
 * Typed error hierarchy for the Starbound SDK.
 *
 * Callers can branch on error type with `instanceof`, while the message text
 * is kept identical to what plain `Error` objects previously carried so any
 * code matching error messages via regex continues to work.
 */

/**
 * Thrown when the Soroban RPC node itself is unreachable or returns a
 * transient network-level failure (e.g. "client error (SendRequest)").
 * These errors are safe to retry.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
    // Maintain proper prototype chain for `instanceof` in environments that
    // transpile to ES5.
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Thrown when the Soroban simulation of a read-only or write call fails.
 * The simulation never touched the ledger — no fee was charged.
 */
export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulationError';
    Object.setPrototypeOf(this, SimulationError.prototype);
  }
}

/**
 * Thrown when the network rejected the transaction before it could be
 * processed (i.e. `sendTransaction` returned a non-PENDING/non-DUPLICATE
 * status).
 */
export class TransactionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionRejectedError';
    Object.setPrototypeOf(this, TransactionRejectedError.prototype);
  }
}

/**
 * Thrown when a transaction was accepted and processed but failed on-chain
 * (e.g. a contract panic, insufficient funds, or authorisation failure).
 * The transaction was included in a ledger; its failure is permanent.
 */
export class TransactionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionFailedError';
    Object.setPrototypeOf(this, TransactionFailedError.prototype);
  }
}

/**
 * Returns true when the given error message matches the pattern that Soroban
 * testnet RPC emits for transient, retryable network conditions.
 *
 * The canonical string seen in practice is "client error (SendRequest)".
 * We match liberally so that similar wording from different SDK versions is
 * also caught.
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('sendrequest') ||
    msg.includes('network error') ||
    msg.includes('connect error') ||
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up')
  );
}
