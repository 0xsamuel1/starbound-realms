import { rpc, xdr, scValToNative } from '@stellar/stellar-sdk';
import { Pool } from 'pg';
import { processEvent, ContractEvent } from './processor';

// ── Decoding ──────────────────────────────────────────────────────────────────

/** Converts a raw XDR event topic into its native string values */
function decodeEventTopic(topic: xdr.ScVal[]): string[] {
  return topic.map((scVal) => String(scValToNative(scVal)));
}

/** Converts a raw XDR event value into its native JS representation */
function decodeEventValue(value: xdr.ScVal): any {
  return scValToNative(value);
}

/** Converts one raw Soroban RPC event into the ContractEvent shape the processor expects */
function decodeContractEvent(raw: rpc.Api.EventResponse): ContractEvent {
  return {
    contractId: raw.contractId?.contractId() ?? '',
    topic: decodeEventTopic(raw.topic),
    value: decodeEventValue(raw.value),
    ledgerSequence: raw.ledger,
  };
}

/** Converts a batch of raw Soroban RPC events into ContractEvent records */
export function decodeContractEvents(rawEvents: rpc.Api.EventResponse[]): ContractEvent[] {
  return rawEvents.map(decodeContractEvent);
}

// ── Fetching ──────────────────────────────────────────────────────────────────

/** Fetches contract events for the given contracts starting at a ledger */
export async function fetchContractEvents(
  server: rpc.Server,
  contractIds: string[],
  startLedger: number
): Promise<rpc.Api.GetEventsResponse> {
  // NOTE: the RPC default page size (100 events) applies here — a poll cycle
  // that falls behind by more than that will miss events. Paginating via the
  // response `cursor` until it's caught up is left as a follow-up.
  return server.getEvents({
    startLedger,
    filters: [{ type: 'contract', contractIds }],
  });
}

// ── Persisting ────────────────────────────────────────────────────────────────

/** Hands each decoded event to the processor, in order, so DB writes stay sequential */
async function persistContractEvents(db: Pool, events: ContractEvent[]): Promise<void> {
  for (const event of events) {
    await processEvent(db, event);
  }
}

// ── Poll cycle ────────────────────────────────────────────────────────────────

/**
 * Runs one indexer poll cycle: fetch new events since `startLedger`, decode
 * them, persist them, and return the ledger to resume from on the next cycle.
 */
export async function runIndexerPollCycle(
  server: rpc.Server,
  db: Pool,
  contractIds: string[],
  startLedger: number
): Promise<number> {
  const response = await fetchContractEvents(server, contractIds, startLedger);
  const events = decodeContractEvents(response.events);

  await persistContractEvents(db, events);

  return response.latestLedger + 1;
}

// ── Listener loop ─────────────────────────────────────────────────────────────

export interface EventListenerHandle {
  stop: () => void;
}

export interface EventListenerOptions {
  runPollCycle: (startLedger: number) => Promise<number>;
  startLedger: number;
  pollIntervalMs: number;
  onError?: (err: unknown) => void;
}

/**
 * Starts polling for new contract events on a fixed interval. Depends only on
 * an injected `runPollCycle`, so it doesn't need a live RPC server or DB pool
 * to be tested.
 */
export function startEventListener(options: EventListenerOptions): EventListenerHandle {
  let cursor = options.startLedger;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      cursor = await options.runPollCycle(cursor);
    } catch (err) {
      options.onError?.(err);
    }
  };

  const timer = setInterval(tick, options.pollIntervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

// The cursor this loop advances is persisted to Postgres by `startIndexer`
// (see ./indexer.ts), which reads the last processed ledger on startup and
// writes it back after each successful cycle. `startEventListener` itself
// stays in-memory so it can be tested without a DB.
