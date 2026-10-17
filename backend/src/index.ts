import express from 'express';
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
