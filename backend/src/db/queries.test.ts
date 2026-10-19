import { describe, it, expect, vi } from 'vitest';
import {
  fetchAllStarSystems,
  fetchStarSystemById,
  upsertStarSystem,
  fetchPlayerByAddress,
  fetchLeaderboard,
  incrementPlayerSystemsOwned,
  decrementPlayerSystemsOwned,
  fetchRecentBattles,
  fetchBattleById,
  fetchBattlesByPlayer,
  saveBattle,
  fetchIndexerCursor,
  saveIndexerCursor,
  createAlliance,
  addAllianceMember,
  removeAllianceMember,
  fetchAllianceByPlayer,
} from './queries';

function fakeDb(rows: any[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as any;
}

describe('fetchIndexerCursor', () => {
  it('returns the last processed ledger as a number', async () => {
    const db = fakeDb([{ last_ledger: '123' }]);

    await expect(fetchIndexerCursor(db)).resolves.toBe(123);
  });

  it('returns 0 when no cursor has been stored yet', async () => {
    const db = fakeDb([]);

    await expect(fetchIndexerCursor(db)).resolves.toBe(0);
  });
});

describe('saveIndexerCursor', () => {
  it('upserts the ledger as the single indexer_state row', async () => {
    const db = fakeDb();

    await saveIndexerCursor(db, 500);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO indexer_state');
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual([500]);
  });
});

// ── Star Systems ──────────────────────────────────────────────────────────────

describe('fetchAllStarSystems', () => {
  it('returns every row ordered by system_id ascending', async () => {
    const rows = [{ system_id: 1 }, { system_id: 2 }];
    const db = fakeDb(rows);

    await expect(fetchAllStarSystems(db)).resolves.toEqual(rows);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('FROM star_systems');
    expect(sql).toContain('ORDER BY system_id ASC');
  });

  it('adds LIMIT and OFFSET when a page is requested', async () => {
    const db = fakeDb([{ system_id: 4 }]);
    await expect(fetchAllStarSystems(db, 10, 20)).resolves.toEqual([{ system_id: 4 }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('LIMIT $1 OFFSET $2');
    expect(params).toEqual([10, 20]);
  });
});

describe('fetchStarSystemById', () => {
  it('selects the row for the requested system id', async () => {
    const db = fakeDb([{ system_id: 7 }]);

    await expect(fetchStarSystemById(db, 7)).resolves.toEqual({ system_id: 7 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('FROM star_systems');
    expect(sql).toContain('WHERE system_id = $1');
    expect(params).toEqual([7]);
  });

  it('returns null when the system does not exist', async () => {
    const db = fakeDb([]);

    await expect(fetchStarSystemById(db, 999)).resolves.toBeNull();
  });
});

describe('upsertStarSystem', () => {
  it('updates owner and last_claimed for the system and bumps updated_at', async () => {
    const db = fakeDb();

    await upsertStarSystem(db, 3, 'GAAAAAAA', 1_500);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('UPDATE star_systems');
    expect(sql).toContain('SET owner = $2, last_claimed = $3');
    expect(sql).toContain('updated_at = NOW()');
    expect(sql).toContain('WHERE system_id = $1');
    expect(params).toEqual([3, 'GAAAAAAA', 1_500]);
  });

  it('accepts a null owner to clear ownership', async () => {
    const db = fakeDb();

    await upsertStarSystem(db, 3, null, 0);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([3, null, 0]);
  });
});

// ── Players ───────────────────────────────────────────────────────────────────

describe('fetchPlayerByAddress', () => {
  it('selects the player for the given address', async () => {
    const db = fakeDb([{ address: 'GAAA' }]);

    await expect(fetchPlayerByAddress(db, 'GAAA')).resolves.toEqual({ address: 'GAAA' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('FROM players');
    expect(sql).toContain('WHERE address = $1');
    expect(params).toEqual(['GAAA']);
  });

  it('returns null for an unknown address', async () => {
    const db = fakeDb([]);

    await expect(fetchPlayerByAddress(db, 'GAAA')).resolves.toBeNull();
  });
});

describe('fetchLeaderboard', () => {
  it('orders players by systems owned, descending', async () => {
    const db = fakeDb([{ address: 'A', systems_owned: 5 }]);

    await fetchLeaderboard(db);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('FROM players');
    expect(sql).toContain('ORDER BY systems_owned DESC');
    expect(sql).toContain('LIMIT $1');
    expect(params).toEqual([20]);
  });

  it('honours a custom limit', async () => {
    const db = fakeDb();

    await fetchLeaderboard(db, 5);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([5]);
  });
});

describe('incrementPlayerSystemsOwned', () => {
  it('inserts a new player with one system and increments on conflict', async () => {
    const db = fakeDb();

    await incrementPlayerSystemsOwned(db, 'GAAA');

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO players');
    expect(sql).toContain('ON CONFLICT (address)');
    expect(sql).toContain('players.systems_owned + 1');
    expect(params).toEqual(['GAAA']);
  });
});

describe('decrementPlayerSystemsOwned', () => {
  it('never drops systems_owned below zero', async () => {
    const db = fakeDb();

    await decrementPlayerSystemsOwned(db, 'GAAA');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('UPDATE players');
    expect(sql).toContain('GREATEST(systems_owned - 1, 0)');
    expect(sql).toContain('WHERE address = $1');
    expect(params).toEqual(['GAAA']);
  });
});

// ── Battles ───────────────────────────────────────────────────────────────────

describe('fetchRecentBattles', () => {
  it('returns the newest battles first with limit and offset', async () => {
    const db = fakeDb([{ battle_id: 9 }]);

    await fetchRecentBattles(db, 10, 20);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('FROM battles');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql).toContain('LIMIT $1 OFFSET $2');
    expect(params).toEqual([10, 20]);
  });

  it('defaults to the first page of twenty', async () => {
    const db = fakeDb();

    await fetchRecentBattles(db);

    const [, params] = db.query.mock.calls[0];
    expect(params).toEqual([20, 0]);
  });
});

describe('fetchBattleById', () => {
  it('selects the battle for the given id', async () => {
    const db = fakeDb([{ battle_id: 42 }]);

    await expect(fetchBattleById(db, 42)).resolves.toEqual({ battle_id: 42 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('FROM battles');
    expect(sql).toContain('WHERE battle_id = $1');
    expect(params).toEqual([42]);
  });

  it('returns null for an unknown battle', async () => {
    const db = fakeDb([]);

    await expect(fetchBattleById(db, 1)).resolves.toBeNull();
  });
});

describe('fetchBattlesByPlayer', () => {
  it('matches battles where the player was attacker or defender', async () => {
    const db = fakeDb([{ battle_id: 1 }]);

    await fetchBattlesByPlayer(db, 'GAAA');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('FROM battles');
    expect(sql).toContain('attacker = $1 OR defender = $1');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual(['GAAA']);
  });
});

describe('saveBattle', () => {
  it('inserts the battle and ignores duplicates by battle id', async () => {
    const db = fakeDb();

    await saveBattle(db, 42, 'ATK', 'DEF', 3, 'ATK', 5, 100);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO battles');
    expect(sql).toContain('ON CONFLICT (battle_id) DO NOTHING');
    expect(params).toEqual([42, 'ATK', 'DEF', 3, 'ATK', 5, 100]);
  });
});

// ── Alliances (#82) ───────────────────────────────────────────────────────────

describe('createAlliance', () => {
  it('inserts the alliance and seeds the leader as a member', async () => {
    const db = fakeDb();

    await createAlliance(db, 42, 'Star League', 'GLEADER', 100);

    expect(db.query).toHaveBeenCalledTimes(3);
    const [insertSql, insertParams] = db.query.mock.calls[0];
    expect(insertSql).toContain('INSERT INTO alliances');
    expect(insertSql).toContain('ON CONFLICT (alliance_id) DO NOTHING');
    expect(insertParams).toEqual([42, 'Star League', 'GLEADER', 100]);

    const [memberSql, memberParams] = db.query.mock.calls[1];
    expect(memberSql).toContain('INSERT INTO alliance_members');
    expect(memberParams).toEqual([42, 'GLEADER', 'leader']);
  });
});

describe('addAllianceMember', () => {
  it('upserts membership and refreshes the member count', async () => {
    const db = fakeDb();

    await addAllianceMember(db, 42, 'GMEMBER', 'member');

    expect(db.query).toHaveBeenCalledTimes(2);
    const [memberSql, memberParams] = db.query.mock.calls[0];
    expect(memberSql).toContain('INSERT INTO alliance_members');
    expect(memberSql).toContain('ON CONFLICT (player) DO UPDATE');
    expect(memberParams).toEqual([42, 'GMEMBER', 'member']);

    const [countSql, countParams] = db.query.mock.calls[1];
    expect(countSql).toContain('member_count');
    expect(countParams).toEqual([42]);
  });
});

describe('removeAllianceMember', () => {
  it('deletes the membership and refreshes the member count', async () => {
    const db = fakeDb([{ alliance_id: 42 }]);

    await removeAllianceMember(db, 'GMEMBER');

    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[1][0]).toContain('DELETE FROM alliance_members');
    expect(db.query.mock.calls[1][1]).toEqual(['GMEMBER']);
    expect(db.query.mock.calls[2][0]).toContain('member_count');
  });

  it('is a no-op when the player is not in an alliance', async () => {
    const db = fakeDb([]);

    await removeAllianceMember(db, 'GUNKNOWN');

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('SELECT alliance_id FROM alliance_members');
  });
});

describe('fetchAllianceByPlayer', () => {
  it('returns null when the player has no membership', async () => {
    const db = fakeDb([]);

    await expect(fetchAllianceByPlayer(db, 'GNONE')).resolves.toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('returns the alliance with its members', async () => {
    const db = fakeDb();
    db.query
      .mockResolvedValueOnce({ rows: [{ alliance_id: 42 }] })
      .mockResolvedValueOnce({
        rows: [{ alliance_id: 42, name: 'Star League', leader: 'GLEADER', member_count: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { player: 'GLEADER', role: 'leader', joined_at: '2026-01-01T00:00:00Z' },
          { player: 'GMEMBER', role: 'member', joined_at: '2026-01-02T00:00:00Z' },
        ],
      });

    const result = await fetchAllianceByPlayer(db, 'GMEMBER');

    expect(result).toEqual({
      alliance_id: 42,
      name: 'Star League',
      leader: 'GLEADER',
      member_count: 2,
      members: [
        { player: 'GLEADER', role: 'leader', joined_at: '2026-01-01T00:00:00Z' },
        { player: 'GMEMBER', role: 'member', joined_at: '2026-01-02T00:00:00Z' },
      ],
    });
    expect(db.query).toHaveBeenCalledTimes(3);
  });
});
