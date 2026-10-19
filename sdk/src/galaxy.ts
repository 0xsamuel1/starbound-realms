import { Contract, nativeToScVal } from '@stellar/stellar-sdk';
import { StarboundClient, TransactionSigner } from './client.js';

export interface StarSystem {
  systemId: number;
  owner: string | null;
  coordX: number;
  coordY: number;
  resourceType: 'Iron' | 'Energy' | 'Plasma';
  resourceYield: number;
  defenseRating: number;
  lastClaimed: number;
  upgradeLevel: number;
}

/** The raw shape scValToNative produces for the contract's StarSystem struct. */
interface RawStarSystem {
  owner: string | null;
  coord_x: number;
  coord_y: number;
  resource_type: 'Iron' | 'Energy' | 'Plasma';
  resource_yield: number;
  defense_rating: number;
  last_claimed: bigint; // u64 decodes to bigint
  upgrade_level: number;
}

/**
 * Maps the contract's snake_case StarSystem fields to the SDK's camelCase shape.
 *
 * @param systemId - The on-chain numeric ID of the system.
 * @param raw - The raw object produced by `scValToNative` for a StarSystem.
 * @returns A camelCase {@link StarSystem} ready for use in application code.
 */
function toStarSystem(systemId: number, raw: RawStarSystem): StarSystem {
  return {
    systemId,
    owner: raw.owner,
    coordX: raw.coord_x,
    coordY: raw.coord_y,
    resourceType: raw.resource_type,
    resourceYield: raw.resource_yield,
    defenseRating: raw.defense_rating,
    lastClaimed: Number(raw.last_claimed),
    upgradeLevel: raw.upgrade_level,
  };
}

/** SDK client for the `galaxy-map` Soroban contract. */
export class GalaxyClient {
  /**
   * @param client - The underlying {@link StarboundClient} used for all RPC calls.
   */
  constructor(private readonly client: StarboundClient) {}

  /**
   * Fetch a single star system by ID from the chain.
   *
   * @param systemId - The numeric ID of the star system (0-indexed, within the grid).
   * @returns A {@link StarSystem} with the current on-chain state of the system.
   * @throws If the system ID is out of range or the simulation fails.
   */
  async getSystem(systemId: number): Promise<StarSystem> {
    const raw = await this.client.simulateReadCall(this.client.contractIds.galaxyMap, 'get_system', [
      nativeToScVal(systemId, { type: 'u32' }),
    ]);
    return toStarSystem(systemId, raw);
  }

  /**
   * Fetch all system IDs owned by a player address.
   *
   * @param playerAddress - The Stellar address of the player.
   * @returns An array of numeric system IDs currently owned by the player.
   *   Returns an empty array if the player owns no systems.
   */
  async getPlayerSystems(playerAddress: string): Promise<number[]> {
    return this.client.simulateReadCall(this.client.contractIds.galaxyMap, 'get_player_systems', [
      nativeToScVal(playerAddress, { type: 'address' }),
    ]);
  }

  /**
   * Fetch the galaxy grid size.
   *
   * @returns The `grid_size` the galaxy was initialized with. The total number
   *   of systems is `grid_size * grid_size`.
   */
  async getGridSize(): Promise<number> {
    return this.client.simulateReadCall(this.client.contractIds.galaxyMap, 'get_grid_size', []);
  }

  /**
   * Claim an unclaimed star system as the given player.
   *
   * @param playerAddress - The Stellar address of the player claiming the system.
   * @param systemId - The numeric ID of the unclaimed system to claim.
   * @param sign - A {@link TransactionSigner} that provides the player's signature.
   * @returns A promise that resolves when the claim transaction is confirmed on-chain.
   * @throws If the system is already owned, the system ID is out of range, or the
   *   transaction fails.
   */
  async claimSystem(playerAddress: string, systemId: number, sign: TransactionSigner): Promise<void> {
    const contract = new Contract(this.client.contractIds.galaxyMap);
    await this.client.submitTransaction({
      sourceAddress: playerAddress,
      operation: contract.call(
        'claim_system',
        nativeToScVal(playerAddress, { type: 'address' }),
        nativeToScVal(systemId, { type: 'u32' })
      ),
      sign,
    });
  }
}
