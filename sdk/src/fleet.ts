import { Contract, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { StarboundClient, TransactionSigner } from './client.js';

export type UnitType = 'Scout' | 'Fighter' | 'Cruiser' | 'Dreadnought';

export interface Fleet {
  scouts: number;
  fighters: number;
  cruisers: number;
  dreadnoughts: number;
  location: number;
  lastMoved: number;
}

export interface UnitCost {
  iron: bigint;
  energy: bigint;
}

/**
 * Returns the resource cost for a given unit type.
 *
 * @param unit - The type of unit to look up costs for.
 * @returns A {@link UnitCost} with the IRON and NRGY required to build one unit.
 */
export function getUnitCost(unit: UnitType): UnitCost {
  const costs: Record<UnitType, UnitCost> = {
    Scout:        { iron: 10n,  energy: 5n  },
    Fighter:      { iron: 25n,  energy: 15n },
    Cruiser:      { iron: 60n,  energy: 40n },
    Dreadnought:  { iron: 150n, energy: 100n },
  };
  return costs[unit];
}

/**
 * Returns total attack power of a fleet.
 *
 * @param fleet - The fleet whose attack power to calculate.
 * @returns The sum of each unit type's count multiplied by its attack stat.
 */
export function calculateFleetAttack(fleet: Fleet): number {
  return (
    fleet.scouts * 2 +
    fleet.fighters * 5 +
    fleet.cruisers * 12 +
    fleet.dreadnoughts * 30
  );
}

/**
 * Returns total defense power of a fleet.
 *
 * @param fleet - The fleet whose defense power to calculate.
 * @returns The sum of each unit type's count multiplied by its defense stat.
 */
export function calculateFleetDefense(fleet: Fleet): number {
  return (
    fleet.scouts * 1 +
    fleet.fighters * 3 +
    fleet.cruisers * 8 +
    fleet.dreadnoughts * 20
  );
}

/**
 * Returns true if a fleet has no units.
 *
 * @param fleet - The fleet to inspect.
 * @returns `true` if all unit counts are zero; `false` otherwise.
 */
export function isFleetEmpty(fleet: Fleet): boolean {
  return (
    fleet.scouts === 0 &&
    fleet.fighters === 0 &&
    fleet.cruisers === 0 &&
    fleet.dreadnoughts === 0
  );
}

/** The raw shape scValToNative produces for the contract's Fleet struct. */
interface RawFleet {
  scouts: number;
  fighters: number;
  cruisers: number;
  dreadnoughts: number;
  location: number;
  last_moved: bigint; // u64 decodes to bigint
}

/**
 * Maps the contract's snake_case Fleet fields to the SDK's camelCase shape.
 *
 * @param raw - The raw object produced by `scValToNative` for a Fleet.
 * @returns A camelCase {@link Fleet} ready for use in application code.
 */
function toFleet(raw: RawFleet): Fleet {
  return {
    scouts: raw.scouts,
    fighters: raw.fighters,
    cruisers: raw.cruisers,
    dreadnoughts: raw.dreadnoughts,
    location: raw.location,
    lastMoved: Number(raw.last_moved),
  };
}

/**
 * Encodes a unit type as Soroban does a unit enum variant: a vec holding the
 * variant name as a symbol.
 *
 * @param unit - The unit type to encode.
 * @returns An `xdr.ScVal` that the Soroban contract will decode as the
 *   corresponding `UnitType` enum variant.
 */
export function unitTypeToScVal(unit: UnitType): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(unit)]);
}

/** SDK client for the `fleet` Soroban contract. */
export class FleetClient {
  /**
   * @param client - The underlying {@link StarboundClient} used for all RPC calls.
   */
  constructor(private readonly client: StarboundClient) {}

  /**
   * Fetch a player's current fleet from the chain.
   *
   * @param playerAddress - The Stellar address of the player.
   * @returns A {@link Fleet} with the player's current unit counts, location,
   *   and last-moved timestamp.
   * @throws If the player has no fleet on-chain or the simulation fails.
   */
  async getFleet(playerAddress: string): Promise<Fleet> {
    const raw = await this.client.simulateReadCall(this.client.contractIds.fleet, 'get_fleet', [
      nativeToScVal(playerAddress, { type: 'address' }),
    ]);
    return toFleet(raw);
  }

  /**
   * Build `count` units of `unitType`, paying their cost in resources.
   *
   * @param playerAddress - The Stellar address of the player building units.
   * @param unitType - The type of unit to build.
   * @param count - The number of units to build in this transaction.
   * @param sign - A {@link TransactionSigner} that provides the player's signature.
   * @returns A promise that resolves when the build transaction is confirmed on-chain.
   * @throws If the player has insufficient resources or the transaction fails.
   */
  async buildUnit(playerAddress: string, unitType: UnitType, count: number, sign: TransactionSigner): Promise<void> {
    const contract = new Contract(this.client.contractIds.fleet);
    await this.client.submitTransaction({
      sourceAddress: playerAddress,
      operation: contract.call(
        'build_unit',
        nativeToScVal(playerAddress, { type: 'address' }),
        unitTypeToScVal(unitType),
        nativeToScVal(count, { type: 'u32' })
      ),
      sign,
    });
  }

  /**
   * Move your fleet to an adjacent system, at most once per cooldown period.
   *
   * @param playerAddress - The Stellar address of the player moving their fleet.
   * @param targetSystemId - The numeric ID of the destination star system.
   * @param sign - A {@link TransactionSigner} that provides the player's signature.
   * @returns A promise that resolves when the move transaction is confirmed on-chain.
   * @throws If the cooldown period has not elapsed, the target system is not
   *   adjacent, or the transaction fails.
   */
  async moveFleet(playerAddress: string, targetSystemId: number, sign: TransactionSigner): Promise<void> {
    const contract = new Contract(this.client.contractIds.fleet);
    await this.client.submitTransaction({
      sourceAddress: playerAddress,
      operation: contract.call(
        'move_fleet',
        nativeToScVal(playerAddress, { type: 'address' }),
        nativeToScVal(targetSystemId, { type: 'u32' })
      ),
      sign,
    });
  }
}
