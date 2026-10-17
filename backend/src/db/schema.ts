/**
 * PostgreSQL schema for Starbound Realms indexer.
 * Each table is defined as a CREATE TABLE IF NOT EXISTS statement.
 * Run via setup-testnet.sh or a migration tool.
 */

export const CREATE_STAR_SYSTEMS_TABLE = `
  CREATE TABLE IF NOT EXISTS star_systems (
    system_id       INTEGER PRIMARY KEY,
    owner           VARCHAR(56),
    coord_x         INTEGER NOT NULL,
    coord_y         INTEGER NOT NULL,
    resource_type   VARCHAR(10) NOT NULL CHECK (resource_type IN ('Iron', 'Energy', 'Plasma')),
    resource_yield  INTEGER NOT NULL,
    defense_rating  INTEGER NOT NULL,
    last_claimed    BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

export const CREATE_PLAYERS_TABLE = `
  CREATE TABLE IF NOT EXISTS players (
    address         VARCHAR(56) PRIMARY KEY,
    systems_owned   INTEGER NOT NULL DEFAULT 0,
    battles_won     INTEGER NOT NULL DEFAULT 0,
    battles_lost    INTEGER NOT NULL DEFAULT 0,
    first_seen      TIMESTAMP NOT NULL DEFAULT NOW(),
    last_active     TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

export const CREATE_BATTLES_TABLE = `
  CREATE TABLE IF NOT EXISTS battles (
    battle_id       BIGINT PRIMARY KEY,
    attacker        VARCHAR(56) NOT NULL,
    defender        VARCHAR(56) NOT NULL,
    system_id       INTEGER NOT NULL,
    winner          VARCHAR(56) NOT NULL,
    rounds          INTEGER NOT NULL,
    ledger_sequence BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

export const CREATE_RESOURCE_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS resource_events (
    id              BIGSERIAL PRIMARY KEY,
    player          VARCHAR(56) NOT NULL,
    resource_type   VARCHAR(10) NOT NULL CHECK (resource_type IN ('Iron', 'Energy', 'Plasma')),
    event_type      VARCHAR(10) NOT NULL CHECK (event_type IN ('mint', 'burn')),
    amount          NUMERIC NOT NULL,
    ledger_sequence BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

export const CREATE_INDEXER_STATE_TABLE = `
  CREATE TABLE IF NOT EXISTS indexer_state (
    id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_ledger     BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

export const ALL_TABLES = [
  CREATE_STAR_SYSTEMS_TABLE,
  CREATE_PLAYERS_TABLE,
  CREATE_BATTLES_TABLE,
  CREATE_RESOURCE_EVENTS_TABLE,
  CREATE_INDEXER_STATE_TABLE,
];
