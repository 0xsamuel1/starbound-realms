import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  NetworkError,
  SimulationError,
  TransactionFailedError,
  TransactionRejectedError,
  isTransientNetworkError,
} from './errors.js';

/** Signs an unsigned transaction XDR string and returns the signed XDR string. */
export type TransactionSigner = (xdr: string) => Promise<string>;

export interface WriteCallOptions {
  sourceAddress: string;
  operation: xdr.Operation;
  sign: TransactionSigner;
}

export interface ClassicCallOptions {
  sourceAddress: string;
  operations: xdr.Operation[];
  sign: TransactionSigner;
}

export interface ContractIds {
  galaxyMap: string;
  resources: string;
  fleet: string;
  battle: string;
}

export interface StarboundClientConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractIds: ContractIds;
}

export interface RetryOptions {
  /** Maximum number of attempts (default: 3). */
  maxAttempts?: number;
  /** Base delay in milliseconds between attempts, doubled on each retry (default: 500). */
  baseDelayMs?: number;
}

/**
 * Retries `fn` up to `maxAttempts` times, using exponential backoff, but ONLY
 * when the thrown error is a transient network error. Any other error is
 * re-thrown immediately without retrying.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientNetworkError(err)) {
        // Not a transient error — fail immediately, no retry.
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  // All attempts exhausted — wrap in NetworkError.
  const originalMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new NetworkError(originalMessage);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class StarboundClient {
  public readonly server: rpc.Server;
  public readonly networkPassphrase: string;
  public readonly contractIds: ContractIds;

  constructor(config: StarboundClientConfig) {
    this.server = new rpc.Server(config.rpcUrl, { allowHttp: false });
    this.networkPassphrase = config.networkPassphrase;
    this.contractIds = config.contractIds;
  }

  /** Returns a pre-configured testnet client. */
  static testnet(contractIds: ContractIds): StarboundClient {
    return new StarboundClient({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: Networks.TESTNET,
      contractIds,
    });
  }

  /**
   * Simulates a read-only contract call and returns its decoded native
   * result. Never submits a transaction — no account needs to be funded.
   *
   * Transient network errors are retried up to 3 times with exponential
   * backoff. A genuine simulation error (contract panic, bad args, etc.)
   * fails immediately — it would not succeed on a retry.
   */
  async simulateReadCall(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<any> {
    const tx = buildReadCallTransaction(this.networkPassphrase, contractId, method, args);
    const simulation = await withRetry(() => this.server.simulateTransaction(tx));
    return decodeSimulationResult(method, simulation);
  }

  /**
   * Builds, simulates, signs, submits, and confirms a write call. `sign`
   * never sees a private key here — it's the caller's job to actually sign
   * (Freighter in the frontend, a Keypair in a script), keeping this client
   * signer-agnostic.
   *
   * The account-fetch and prepare steps are retried on transient network
   * errors. `sendTransaction` itself is NOT blindly retried: re-submitting an
   * already-accepted transaction would be a no-op at best (DUPLICATE) but
   * could cause confusion, so we let the caller decide how to handle that.
   */
  async submitTransaction(options: WriteCallOptions): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
    const account = await withRetry(() => this.server.getAccount(options.sourceAddress));
    const unprepared = buildUnpreparedTransaction(this.networkPassphrase, account, [options.operation]);
    const prepared = await withRetry(() => this.server.prepareTransaction(unprepared));
    return this.signAndConfirm(prepared, options.sign);
  }

  /**
   * Signs, submits, and confirms a transaction of classic (non-Soroban)
   * operations, such as trustlines. Skips simulation entirely: RPC's
   * prepareTransaction rejects classic operations outright
   * ("unsupported operation type"), verified against testnet.
   *
   * The account-fetch step is retried on transient network errors.
   */
  async submitClassicTransaction(options: ClassicCallOptions): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
    const account = await withRetry(() => this.server.getAccount(options.sourceAddress));
    const tx = buildUnpreparedTransaction(this.networkPassphrase, account, options.operations);
    return this.signAndConfirm(tx, options.sign);
  }

  /** Hands a built transaction to the signer, submits it, and waits for its final status. */
  private async signAndConfirm(
    tx: Transaction,
    sign: TransactionSigner
  ): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
    const signedXdr = await sign(tx.toXDR());
    const signedTx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase) as Transaction;

    const sendResult = await this.server.sendTransaction(signedTx);
    verifySendWasAccepted(sendResult);

    const finalResult = await this.server.pollTransaction(sendResult.hash);
    return verifyTransactionSucceeded(finalResult);
  }
}

/** Builds an unprepared (unsimulated) transaction holding the given operations. */
function buildUnpreparedTransaction(networkPassphrase: string, account: Account, operations: xdr.Operation[]): Transaction {
  const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase });
  for (const operation of operations) {
    builder.addOperation(operation);
  }
  return builder.setTimeout(30).build();
}

/** Throws if the network didn't accept the transaction for processing. */
function verifySendWasAccepted(send: rpc.Api.SendTransactionResponse): void {
  if (send.status !== 'PENDING' && send.status !== 'DUPLICATE') {
    throw new TransactionRejectedError(`transaction rejected: ${send.status}`);
  }
}

/** Throws if the confirmed transaction failed on-chain; otherwise returns it. */
function verifyTransactionSucceeded(
  result: rpc.Api.GetTransactionResponse
): rpc.Api.GetSuccessfulTransactionResponse {
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new TransactionFailedError(`transaction failed: ${result.status}`);
  }
  return result;
}

/** Builds a throwaway, never-submitted transaction for simulating a read call. */
function buildReadCallTransaction(
  networkPassphrase: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): ReturnType<TransactionBuilder['build']> {
  const contract = new Contract(contractId);
  // Simulation doesn't touch this account's balance or require its signature,
  // so a fresh throwaway keypair is enough — no funded account needed.
  const readOnlySource = new Account(Keypair.random().publicKey(), '0');

  return new TransactionBuilder(readOnlySource, { fee: BASE_FEE, networkPassphrase })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
}

/** Extracts and decodes a simulated read call's return value, or throws its error. */
function decodeSimulationResult(method: string, simulation: rpc.Api.SimulateTransactionResponse): any {
  if (rpc.Api.isSimulationError(simulation)) {
    throw new SimulationError(`${method}: simulation failed — ${simulation.error}`);
  }
  if (!simulation.result) {
    throw new SimulationError(`${method}: simulation returned no result`);
  }
  return scValToNative(simulation.result.retval);
}
