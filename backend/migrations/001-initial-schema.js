/**
 * Initial schema — converts the previously ad hoc `CREATE TABLE IF NOT EXISTS`
 * statements in `src/db/schema.ts` into the first versioned migration (#139).
 *
 * Run with: `npm run migrate:up`
 */
exports.up = (pgm) => {
  pgm.createTable('star_systems', {
    system_id: { type: 'INTEGER', primaryKey: true },
    owner: { type: 'VARCHAR(56)' },
    coord_x: { type: 'INTEGER', notNull: true },
    coord_y: { type: 'INTEGER', notNull: true },
    resource_type: {
      type: 'VARCHAR(10)',
      notNull: true,
      check: `resource_type IN ('Iron', 'Energy', 'Plasma')`,
    },
    resource_yield: { type: 'INTEGER', notNull: true },
    defense_rating: { type: 'INTEGER', notNull: true },
    last_claimed: { type: 'BIGINT', notNull: true, default: 0 },
    updated_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('players', {
    address: { type: 'VARCHAR(56)', primaryKey: true },
    systems_owned: { type: 'INTEGER', notNull: true, default: 0 },
    battles_won: { type: 'INTEGER', notNull: true, default: 0 },
    battles_lost: { type: 'INTEGER', notNull: true, default: 0 },
    first_seen: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
    last_active: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('battles', {
    battle_id: { type: 'BIGINT', primaryKey: true },
    attacker: { type: 'VARCHAR(56)', notNull: true },
    defender: { type: 'VARCHAR(56)', notNull: true },
    system_id: { type: 'INTEGER', notNull: true },
    winner: { type: 'VARCHAR(56)', notNull: true },
    rounds: { type: 'INTEGER', notNull: true },
    ledger_sequence: { type: 'BIGINT', notNull: true },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('resource_events', {
    id: { type: 'BIGSERIAL', primaryKey: true },
    player: { type: 'VARCHAR(56)', notNull: true },
    resource_type: {
      type: 'VARCHAR(10)',
      notNull: true,
      check: `resource_type IN ('Iron', 'Energy', 'Plasma')`,
    },
    event_type: {
      type: 'VARCHAR(10)',
      notNull: true,
      check: `event_type IN ('mint', 'burn', 'mine')`,
    },
    amount: { type: 'NUMERIC', notNull: true },
    ledger_sequence: { type: 'BIGINT', notNull: true },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('indexer_state', {
    id: {
      type: 'SMALLINT',
      primaryKey: true,
      default: 1,
      check: 'id = 1',
    },
    last_ledger: { type: 'BIGINT', notNull: true, default: 0 },
    updated_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('fleet_snapshots', {
    address: { type: 'VARCHAR(56)', primaryKey: true },
    scouts: { type: 'INTEGER', notNull: true, default: 0 },
    fighters: { type: 'INTEGER', notNull: true, default: 0 },
    cruisers: { type: 'INTEGER', notNull: true, default: 0 },
    dreadnoughts: { type: 'INTEGER', notNull: true, default: 0 },
    location: { type: 'INTEGER' },
    last_moved: { type: 'BIGINT' },
    updated_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('fleet_snapshots');
  pgm.dropTable('indexer_state');
  pgm.dropTable('resource_events');
  pgm.dropTable('battles');
  pgm.dropTable('players');
  pgm.dropTable('star_systems');
};
