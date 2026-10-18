export { StarboundClient, withRetry, MIN_STELLAR_SDK_VERSION, assertCompatibleStellarSdk } from './client.js';
export type { StarboundClientConfig, ContractIds, TransactionSigner, WriteCallOptions, ClassicCallOptions, RetryOptions } from './client.js';

export { NetworkError, SimulationError, TransactionRejectedError, TransactionFailedError, isTransientNetworkError } from './errors.js';

export { GalaxyClient } from './galaxy.js';
export type { StarSystem } from './galaxy.js';

export { ResourcesClient, RESOURCE_ASSET_CODES, buildTrustlineKey } from './resources.js';
export type { ResourceType, ResourceBalance } from './resources.js';

export { FleetClient, getUnitCost, calculateFleetAttack, calculateFleetDefense, isFleetEmpty } from './fleet.js';
export type { Fleet, UnitType, UnitCost } from './fleet.js';

export { BattleClient, didAttackerWin, getBattleLoser, wasBattleDecisive } from './battle.js';
export type { BattleResult, BattleRecord } from './battle.js';
