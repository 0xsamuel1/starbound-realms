/**
 * Alliance tables for alliance event indexing (#82).
 *
 * `alliances` holds one row per on-chain alliance; `alliance_members` is the
 * current membership set (a player who leaves is deleted, matching the
 * contract's create/join/leave semantics).
 */
exports.up = (pgm) => {
  pgm.createTable('alliances', {
    alliance_id: { type: 'BIGINT', primaryKey: true },
    name: { type: 'VARCHAR(64)', notNull: true },
    leader: { type: 'VARCHAR(56)', notNull: true },
    member_count: { type: 'INTEGER', notNull: true, default: 1 },
    ledger_sequence: { type: 'BIGINT', notNull: true },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('alliance_members', {
    id: { type: 'BIGSERIAL', primaryKey: true },
    alliance_id: { type: 'BIGINT', notNull: true, references: 'alliances' },
    player: { type: 'VARCHAR(56)', notNull: true },
    role: { type: 'VARCHAR(16)', notNull: true, default: 'member' },
    joined_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createIndex('alliance_members', ['player'], { unique: true, name: 'idx_alliance_members_player' });
  pgm.createIndex('alliance_members', ['alliance_id'], { name: 'idx_alliance_members_alliance_id' });
};

exports.down = (pgm) => {
  pgm.dropTable('alliance_members');
  pgm.dropTable('alliances');
};
