import { Pool } from 'pg';
import {
  upsertStarSystem,
  saveBattle,
  incrementPlayerSystemsOwned,
  decrementPlayerSystemsOwned,
  saveResourceEvent,
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
