import { Pool } from 'pg';

// ── Star Systems ──────────────────────────────────────────────────────────────

export async function fetchAllStarSystems(db: Pool) {
  const result = await db.query(
    'SELECT * FROM star_systems ORDER BY system_id ASC'
  );
  return result.rows;
}

export async function fetchStarSystemById(db: Pool, systemId: number) {
  const result = await db.query(
    'SELECT * FROM star_systems WHERE system_id = $1',
    [systemId]
  );
  return result.rows[0] ?? null;
}

export async function upsertStarSystem(
  db: Pool,
  systemId: number,
  owner: string | null,
  lastClaimed: number
) {
  await db.query(
    `UPDATE star_systems
     SET owner = $2, last_claimed = $3, updated_at = NOW()
     WHERE system_id = $1`,
    [systemId, owner, lastClaimed]
  );
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function fetchPlayerByAddress(db: Pool, address: string) {
  const result = await db.query(
    'SELECT * FROM players WHERE address = $1',
    [address]
  );
  return result.rows[0] ?? null;
}

export async function fetchLeaderboard(db: Pool, limit = 20) {
  const result = await db.query(
    'SELECT * FROM players ORDER BY systems_owned DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

export async function incrementPlayerSystemsOwned(db: Pool, address: string) {
  await db.query(
    `INSERT INTO players (address, systems_owned)
     VALUES ($1, 1)
     ON CONFLICT (address)
     DO UPDATE SET systems_owned = players.systems_owned + 1, last_active = NOW()`,
    [address]
  );
}

export async function decrementPlayerSystemsOwned(db: Pool, address: string) {
  await db.query(
    `UPDATE players
     SET systems_owned = GREATEST(systems_owned - 1, 0), last_active = NOW()
     WHERE address = $1`,
    [address]
  );
}

// ── Battles ───────────────────────────────────────────────────────────────────

export async function fetchRecentBattles(db: Pool, limit = 20, offset = 0) {
  const result = await db.query(
    'SELECT * FROM battles ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
}

export async function fetchBattleById(db: Pool, battleId: number) {
  const result = await db.query(
    'SELECT * FROM battles WHERE battle_id = $1',
    [battleId]
  );
  return result.rows[0] ?? null;
}

export async function fetchBattlesByPlayer(db: Pool, address: string) {
  const result = await db.query(
    `SELECT * FROM battles
     WHERE attacker = $1 OR defender = $1
     ORDER BY created_at DESC`,
    [address]
  );
  return result.rows;
}

// ── Resource Events ───────────────────────────────────────────────────────────

export async function saveResourceEvent(
  db: Pool,
  player: string,
  resourceType: string,
  eventType: 'mint' | 'burn' | 'mine',
  amount: bigint,
  ledgerSequence: number
) {
  await db.query(
    `INSERT INTO resource_events
       (player, resource_type, event_type, amount, ledger_sequence)
     VALUES ($1, $2, $3, $4, $5)`,
    [player, resourceType, eventType, amount.toString(), ledgerSequence]
  );
}

// ── Indexer State ─────────────────────────────────────────────────────────────

export async function fetchIndexerCursor(db: Pool): Promise<number> {
  const result = await db.query(
    'SELECT last_ledger FROM indexer_state WHERE id = 1'
  );
  return result.rows[0] ? Number(result.rows[0].last_ledger) : 0;
}

export async function saveIndexerCursor(db: Pool, ledger: number) {
  await db.query(
    `INSERT INTO indexer_state (id, last_ledger, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id)
     DO UPDATE SET last_ledger = EXCLUDED.last_ledger, updated_at = NOW()`,
    [ledger]
  );
}

export async function saveBattle(
  db: Pool,
  battleId: number,
  attacker: string,
  defender: string,
  systemId: number,
  winner: string,
  rounds: number,
  ledgerSequence: number
) {
  await db.query(
    `INSERT INTO battles
       (battle_id, attacker, defender, system_id, winner, rounds, ledger_sequence)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (battle_id) DO NOTHING`,
    [battleId, attacker, defender, systemId, winner, rounds, ledgerSequence]
  );
}
