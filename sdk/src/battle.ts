import { Contract, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { StarboundClient, TransactionSigner } from './client.js';

export interface BattleResult {
  battleId: number;
  attacker: string;
  defender: string;
  systemId: number;
  winner: string;
  rounds: number;
}

export interface BattleRecord extends BattleResult {
  ledgerSequence: number;
  createdAt: number;
}

/**
 * Returns true if the attacker won the battle.
 *
 * @param result - The battle result to inspect.
 * @returns `true` if the winner's address matches the attacker's address.
 */
export function didAttackerWin(result: BattleResult): boolean {
  return result.winner === result.attacker;
}

/**
 * Returns the loser's address from a battle result.
 *
 * @param result - The battle result to inspect.
 * @returns The Stellar address of the player who lost the battle.
 */
export function getBattleLoser(result: BattleResult): string {
  return result.winner === result.attacker ? result.defender : result.attacker;
}

/**
 * Returns true if the battle was decisive (finished before max rounds).
 *
 * @param result - The battle result to inspect.
 * @param maxRounds - The maximum number of rounds before the battle is considered
 *   a draw. Defaults to `20`.
 * @returns `true` if the battle ended before `maxRounds` were played.
 */
export function wasBattleDecisive(result: BattleResult, maxRounds = 20): boolean {
  return result.rounds < maxRounds;
}

/** The raw shape scValToNative produces for the contract's BattleResult struct. */
interface RawBattleResult {
  battle_id: bigint; // u64 decodes to bigint
  attacker: string;
  defender: string;
  system_id: number;
  winner: string;
  rounds: number;
}

/**
 * Maps the contract's snake_case BattleResult to the SDK's camelCase shape.
 *
 * @param raw - The raw object produced by `scValToNative` for a BattleResult.
 * @returns A camelCase {@link BattleResult} ready for use in application code.
 */
function toBattleResult(raw: RawBattleResult): BattleResult {
  return {
    battleId: Number(raw.battle_id),
    attacker: raw.attacker,
    defender: raw.defender,
    systemId: raw.system_id,
    winner: raw.winner,
    rounds: raw.rounds,
  };
}

/** SDK client for the `battle` Soroban contract. */
export class BattleClient {
  /**
   * @param client - The underlying {@link StarboundClient} used for all RPC calls.
   */
  constructor(private readonly client: StarboundClient) {}

  /**
   * Fetch a single battle result by ID from the chain.
   *
   * Returns a {@link BattleResult}, not a {@link BattleRecord}: `ledgerSequence`
   * and `createdAt` aren't stored on-chain — they only exist in the indexer's
   * database.
   *
   * @param battleId - The numeric ID of the battle to fetch.
   * @returns The {@link BattleResult} for the given battle ID.
   * @throws If no battle with the given ID exists or the simulation fails.
   */
  async getBattle(battleId: number): Promise<BattleResult> {
    const raw = await this.client.simulateReadCall(this.client.contractIds.battle, 'get_battle', [
      nativeToScVal(BigInt(battleId), { type: 'u64' }),
    ]);
    return toBattleResult(raw);
  }

  /**
   * Resolve combat between the attacker's fleet and the current owner of
   * `systemId`. Returns the id of the newly created battle record.
   *
   * @param attackerAddress - The Stellar address of the attacking player.
   * @param defenderAddress - The Stellar address of the player who owns the
   *   target system (the defender).
   * @param systemId - The numeric ID of the star system being contested.
   * @param sign - A {@link TransactionSigner} that provides the attacker's signature.
   * @returns The numeric ID of the newly created on-chain battle record.
   * @throws If either player has no fleet, the transaction is rejected, or the
   *   transaction fails on-chain.
   */
  async resolveBattle(
    attackerAddress: string,
    defenderAddress: string,
    systemId: number,
    sign: TransactionSigner
  ): Promise<number> {
    const contract = new Contract(this.client.contractIds.battle);
    const result = await this.client.submitTransaction({
      sourceAddress: attackerAddress,
      operation: contract.call(
        'resolve_battle',
        nativeToScVal(attackerAddress, { type: 'address' }),
        nativeToScVal(defenderAddress, { type: 'address' }),
        nativeToScVal(systemId, { type: 'u32' })
      ),
      sign,
    });
    return Number(scValToNative(result.returnValue!));
  }
}
