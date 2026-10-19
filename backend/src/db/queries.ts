import { Pool } from 'pg';

// ── Star Systems ──────────────────────────────────────────────────────────────

export async function fetchAllStarSystems(db: Pool, limit?: number, offset = 0) {
  const pagination = limit == null ? '' : ' LIMIT $1 OFFSET $2';
  const result = await db.query(
    `SELECT * FROM star_systems ORDER BY system_id ASC${pagination}`,
    limit == null ? [] : [limit, offset]
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

// ── Fleet Snapshots ───────────────────────────────────────────────────────────

export async function fetchFleetSnapshot(db: Pool, address: string) {
  const result = await db.query(
    'SELECT * FROM fleet_snapshots WHERE address = $1',
    [address]
  );
  return result.rows[0] ?? null;
}

export async function upsertFleetSnapshot(
  db: Pool,
  address: string,
  unitType: string,
  count: number
) {
  const col = unitTypeToColumn(unitType);
  await db.query(
    `INSERT INTO fleet_snapshots (address, ${col})
     VALUES ($1, $2)
     ON CONFLICT (address)
     DO UPDATE SET ${col} = fleet_snapshots.${col} + $2, updated_at = NOW()`,
    [address, count]
  );
}

export async function applyFleetLosses(
  db: Pool,
  address: string,
  scouts: number,
  fighters: number,
  cruisers: number,
  dreadnoughts: number
) {
  await db.query(
    `UPDATE fleet_snapshots
     SET
       scouts       = GREATEST(scouts       - $2, 0),
       fighters     = GREATEST(fighters     - $3, 0),
       cruisers     = GREATEST(cruisers     - $4, 0),
       dreadnoughts = GREATEST(dreadnoughts - $5, 0),
       updated_at   = NOW()
     WHERE address = $1`,
    [address, scouts, fighters, cruisers, dreadnoughts]
  );
}

function unitTypeToColumn(unitType: string): string {
  switch (unitType) {
    case 'Scout':       return 'scouts';
    case 'Fighter':     return 'fighters';
    case 'Cruiser':     return 'cruisers';
    case 'Dreadnought': return 'dreadnoughts';
    default:
      throw new Error(`Unknown unit type: ${unitType}`);
  }
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

// ── Alliances (#82) ───────────────────────────────────────────────────────────

export async function createAlliance(
  db: Pool,
  allianceId: number,
  name: string,
  leader: string,
  ledgerSequence: number
) {
  await db.query(
    `INSERT INTO alliances (alliance_id, name, leader, member_count, ledger_sequence)
     VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (alliance_id) DO NOTHING`,
    [allianceId, name, leader, ledgerSequence]
  );
  await addAllianceMember(db, allianceId, leader, 'leader');
}

export async function addAllianceMember(
  db: Pool,
  allianceId: number,
  player: string,
  role: 'leader' | 'member' = 'member'
) {
  await db.query(
    `INSERT INTO alliance_members (alliance_id, player, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (player) DO UPDATE
       SET alliance_id = EXCLUDED.alliance_id,
           role = EXCLUDED.role,
           joined_at = NOW()`,
    [allianceId, player, role]
  );
  await db.query(
    `UPDATE alliances
     SET member_count = (
       SELECT COUNT(*) FROM alliance_members WHERE alliance_id = $1
     ), updated_at = NOW()
     WHERE alliance_id = $1`,
    [allianceId]
  );
}

export async function removeAllianceMember(db: Pool, player: string) {
  const existing = await db.query(
    `SELECT alliance_id FROM alliance_members WHERE player = $1`,
    [player]
  );
  const allianceId = existing.rows[0]?.alliance_id;
  if (allianceId === undefined) return;

  await db.query(`DELETE FROM alliance_members WHERE player = $1`, [player]);
  await db.query(
    `UPDATE alliances
     SET member_count = (
       SELECT COUNT(*) FROM alliance_members WHERE alliance_id = $1
     ), updated_at = NOW()
     WHERE alliance_id = $1`,
    [allianceId]
  );
}

/** The alliance a player currently belongs to, with its member list, or null. */
export async function fetchAllianceByPlayer(db: Pool, address: string) {
  const membership = await db.query(
    `SELECT alliance_id FROM alliance_members WHERE player = $1`,
    [address]
  );
  const allianceId = membership.rows[0]?.alliance_id;
  if (allianceId === undefined) return null;

  const alliance = await db.query(
    `SELECT * FROM alliances WHERE alliance_id = $1`,
    [allianceId]
  );
  if (!alliance.rows[0]) return null;

  const members = await db.query(
    `SELECT player, role, joined_at
     FROM alliance_members
     WHERE alliance_id = $1
     ORDER BY role = 'leader' DESC, joined_at ASC`,
    [allianceId]
  );

  return { ...alliance.rows[0], members: members.rows };
}

export async function fetchAllianceById(db: Pool, allianceId: number) {
  const alliance = await db.query(
    `SELECT * FROM alliances WHERE alliance_id = $1`,
    [allianceId]
  );
  if (!alliance.rows[0]) return null;

  const members = await db.query(
    `SELECT player, role, joined_at
     FROM alliance_members
     WHERE alliance_id = $1
     ORDER BY role = 'leader' DESC, joined_at ASC`,
    [allianceId]
  );

  return { ...alliance.rows[0], members: members.rows };
}
