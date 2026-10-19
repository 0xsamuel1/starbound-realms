import { Pool } from 'pg';
import {
  upsertStarSystem,
  saveBattle,
  incrementPlayerSystemsOwned,
  decrementPlayerSystemsOwned,
  saveResourceEvent,
  upsertFleetSnapshot,
  applyFleetLosses,
  createAlliance,
  addAllianceMember,
  removeAllianceMember,
} from '../db/queries';

export interface ContractEvent {
  contractId: string;
  topic: string[];
  value: any;
  ledgerSequence: number;
}

/** Routes a contract event to the correct handler based on its topic */
export async function processEvent(db: Pool, event: ContractEvent): Promise<void> {
  const topic = event.topic[0];

  switch (topic) {
    case 'claimed':
      await processSystemClaimed(db, event);
      break;
    case 'transfer':
      await processOwnershipTransferred(db, event);
      break;
    case 'battle_resolved':
      await processBattleResolved(db, event);
      break;
    case 'minted':
      await processResourceMinted(db, event);
      break;
    case 'burned':
      await processResourceBurned(db, event);
      break;
    case 'mined':
      await processResourceMined(db, event);
      break;
    case 'built':
      await processUnitsBuilt(db, event);
      break;
    case 'losses':
      await processFleetLosses(db, event);
      break;
    case 'alliance_created':
      await processAllianceCreated(db, event);
      break;
    case 'alliance_joined':
      await processAllianceJoined(db, event);
      break;
    case 'alliance_left':
      await processAllianceLeft(db, event);
      break;
    default:
      // Unknown event — skip silently
      break;
  }
}

/** Handles system_claimed event — updates star_systems and player stats */
async function processSystemClaimed(db: Pool, event: ContractEvent): Promise<void> {
  const player = event.topic[1];
  const systemId = event.value;

  await upsertStarSystem(db, systemId, player, event.ledgerSequence);
  await incrementPlayerSystemsOwned(db, player);
}

/** Handles ownership_transferred event — updates both old and new owner stats */
async function processOwnershipTransferred(db: Pool, event: ContractEvent): Promise<void> {
  const systemId = Number(event.topic[1]);
  const [oldOwner, newOwner] = event.value;

  await upsertStarSystem(db, systemId, newOwner, event.ledgerSequence);

  if (oldOwner) {
    await decrementPlayerSystemsOwned(db, oldOwner);
  }

  await incrementPlayerSystemsOwned(db, newOwner);
}

/** Handles battle_resolved event — saves battle record and updates player win/loss counts */
async function processBattleResolved(db: Pool, event: ContractEvent): Promise<void> {
  // Field names match the Rust BattleResult struct's actual encoding
  // (snake_case), not a JS naming convention.
  const { battle_id, attacker, defender, system_id, winner, rounds } = event.value;

  await saveBattle(db, battle_id, attacker, defender, system_id, winner, rounds, event.ledgerSequence);
}

/** Handles minted event — topic: ["minted", player], value: [ResourceType, amount] */
async function processResourceMinted(db: Pool, event: ContractEvent): Promise<void> {
  const player = event.topic[1];
  const [resourceType, amount] = event.value;

  await saveResourceEvent(db, player, resourceType, 'mint', BigInt(amount), event.ledgerSequence);
}

/** Handles burned event — topic: ["burned", player], value: [ResourceType, amount] */
async function processResourceBurned(db: Pool, event: ContractEvent): Promise<void> {
  const player = event.topic[1];
  const [resourceType, amount] = event.value;

  await saveResourceEvent(db, player, resourceType, 'burn', BigInt(amount), event.ledgerSequence);
}

/** Handles mined event — topic: ["mined", player], value: [system_id, ResourceType, amount] */
async function processResourceMined(db: Pool, event: ContractEvent): Promise<void> {
  const player = event.topic[1];
  const [, resourceType, amount] = event.value;

  await saveResourceEvent(db, player, resourceType, 'mine', BigInt(amount), event.ledgerSequence);
}

/**
 * Handles built event — topic: ["built", player], value: [UnitType, count]
 * Upserts the player's fleet_snapshot, incrementing the built unit type's count.
 */
async function processUnitsBuilt(db: Pool, event: ContractEvent): Promise<void> {
  const player = event.topic[1];
  const [unitType, count] = event.value;

  await upsertFleetSnapshot(db, player, unitType, Number(count));
}

/**
 * Handles losses event — topic: ["losses", player], value: Fleet struct
 * Subtracts lost units from the stored snapshot, clamped at zero.
 */
async function processFleetLosses(db: Pool, event: ContractEvent): Promise<void> {
  const player = event.topic[1];
  const { scouts, fighters, cruisers, dreadnoughts } = event.value;

  await applyFleetLosses(
    db,
    player,
    Number(scouts),
    Number(fighters),
    Number(cruisers),
    Number(dreadnoughts)
  );
}

/**
 * Handles alliance_created — topic: ["alliance_created", leader],
 * value: [alliance_id, name]
 */
async function processAllianceCreated(db: Pool, event: ContractEvent): Promise<void> {
  const leader = event.topic[1];
  const [allianceId, name] = event.value;

  await createAlliance(db, Number(allianceId), String(name), leader, event.ledgerSequence);
}

/**
 * Handles alliance_joined — topic: ["alliance_joined", player],
 * value: alliance_id
 */
async function processAllianceJoined(db: Pool, event: ContractEvent): Promise<void> {
  const player = event.topic[1];
  const allianceId = Array.isArray(event.value) ? event.value[0] : event.value;

  await addAllianceMember(db, Number(allianceId), player, 'member');
}

/**
 * Handles alliance_left — topic: ["alliance_left", player], value: alliance_id
 * Removes the player from their alliance and refreshes the member count.
 */
async function processAllianceLeft(db: Pool, event: ContractEvent): Promise<void> {
  const player = event.topic[1];

  await removeAllianceMember(db, player);
}
