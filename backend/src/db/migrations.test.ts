import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards the versioned migration setup (#139):
 * - migrations live in `backend/migrations/` as numbered files
 * - each migration exports `up`/`down`
 * - the initial migration covers every table the code queries
 * - schema changes are no longer ad hoc (`schema.ts` is reference-only)
 */
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

const REQUIRED_TABLES = [
  'star_systems',
  'players',
  'battles',
  'resource_events',
  'indexer_state',
  'fleet_snapshots',
  'alliances',
  'alliance_members',
];

describe('database migrations (#139)', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.js'));

  it('has at least the initial schema migration and the alliance migration', () => {
    expect(files).toContain('001-initial-schema.js');
    expect(files).toContain('002-alliances.js');
  });

  it('numbers migrations so a fresh database can be brought up in order', () => {
    const prefixes = files.map((f) => f.split('-')[0]);
    expect(prefixes).toEqual([...prefixes].sort());
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('every migration exports up and down', () => {
    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration = require(join(MIGRATIONS_DIR, file));
      expect(typeof migration.up).toBe('function');
      expect(typeof migration.down).toBe('function');
    }
  });

  it('the initial migration creates every base table the code queries', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '001-initial-schema.js'), 'utf8');
    for (const table of ['star_systems', 'players', 'battles', 'resource_events', 'indexer_state', 'fleet_snapshots']) {
      expect(sql).toContain(`createTable('${table}'`);
    }
  });

  it('the alliance migration creates the alliance tables', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '002-alliances.js'), 'utf8');
    expect(sql).toContain("createTable('alliances'");
    expect(sql).toContain("createTable('alliance_members'");
    expect(sql).toContain('idx_alliance_members_player');
  });

  it('covers every table the application layer references', () => {
    const combined = files
      .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      .join('\n');
    for (const table of REQUIRED_TABLES) {
      expect(combined).toContain(table);
    }
  });

  it('schema.ts is documented as reference-only, not the live schema', () => {
    const schema = readFileSync(join(__dirname, 'schema.ts'), 'utf8');
    expect(schema).toMatch(/reference only/i);
    expect(schema).toMatch(/migrate:up/);
  });
});
