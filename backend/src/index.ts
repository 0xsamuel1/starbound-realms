import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { createGalaxyRouter } from './api/routes/galaxy';
import { createPlayerRouter } from './api/routes/player';
import { createBattleRouter } from './api/routes/battle';
import { createFleetRouter } from './api/routes/fleet';
import { createLeaderboardRouter } from './api/routes/leaderboard';
import { standardLimiter, strictLimiter } from './api/middleware/rateLimit';
import { errorHandler } from './api/middleware/errorHandler';
import { startIndexer } from './indexer/indexer';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ──────────────────────────────────────────────────────────────────

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Middleware ────────────────────────────────────────────────────────────────

const corsOrigins = readCorsOrigins(process.env);

if (corsOrigins) {
  app.use(cors({ origin: corsOrigins }));
} else {
  // Without CORS_ORIGIN no Access-Control-Allow-Origin header is ever sent, so
  // browsers reject every cross-origin request (same-origin traffic is unaffected).
  console.log('CORS disabled: CORS_ORIGIN not configured — cross-origin requests will be rejected');
}

app.use(express.json());
app.use(standardLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', handleHealthCheck);
app.use('/galaxy', createGalaxyRouter(db));
app.use('/player', createPlayerRouter(db));
app.use('/battles', createBattleRouter(db));
app.use('/fleet', createFleetRouter(db));
app.use('/leaderboard', strictLimiter, createLeaderboardRouter(db));

// ── Error handler (must be last) ──────────────────────────────────────────────

app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Starbound Realms API running on port ${PORT}`);
});

startIndexerIfConfigured();

export default app;

// ── Indexer ───────────────────────────────────────────────────────────────────

/**
 * Reads the CORS_ORIGIN env var — a comma-separated list of frontend origins
 * (e.g. `http://localhost:5173,https://play.example.com`) — into an allow-list.
 * Returns null when unset or empty, which disables CORS entirely.
 */
function readCorsOrigins(env: Record<string, string | undefined>): string[] | null {
  const raw = env.CORS_ORIGIN;
  if (!raw) {
    return null;
  }
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : null;
}

/** Reads the CONTRACT_* env vars, dropping any that aren't set. */
function readIndexerContractIds(): string[] {
  return [
    process.env.CONTRACT_GALAXY_MAP,
    process.env.CONTRACT_RESOURCES,
    process.env.CONTRACT_FLEET,
    process.env.CONTRACT_BATTLE,
  ].filter((id): id is string => Boolean(id));
}

/** Starts the event listener when an RPC URL and at least one contract are configured. */
function startIndexerIfConfigured() {
  const rpcUrl = process.env.SOROBAN_RPC_URL;
  const contractIds = readIndexerContractIds();

  if (!rpcUrl || contractIds.length === 0) {
    console.log('Indexer disabled: SOROBAN_RPC_URL or CONTRACT_* not configured');
    return;
  }

  startIndexer({
    db,
    rpcUrl,
    contractIds,
    pollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS ?? 5000),
    onError: (err) => console.error('Indexer poll cycle failed:', err),
  }).catch((err) => console.error('Failed to start indexer:', err));
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleHealthCheck(_req: express.Request, res: express.Response) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}
