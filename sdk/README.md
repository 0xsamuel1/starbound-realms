# @starbound-realms/sdk

TypeScript SDK for interacting with the Starbound Realms Soroban smart contracts.

---

## Installation

The SDK is a workspace package — it is not published to npm yet. To use it inside this monorepo, reference it as a workspace dependency:

```json
{
  "dependencies": {
    "@starbound-realms/sdk": "workspace:*"
  }
}
```

Then build the SDK before any package that depends on it:

```bash
cd sdk
pnpm run build
```

### `@stellar/stellar-sdk` version requirement (`>=17.2.1 <18.0.0`)

This SDK is tested and pinned against **`@stellar/stellar-sdk` `17.2.1`** (peer range `^17.2.1`). Do **not** downgrade to `13.x` or earlier:

- **Why `<17` breaks against live testnet:** Since Stellar Protocol 23, Soroban RPC returns `TransactionMeta` v4 on confirmed transactions. `@stellar/stellar-sdk` 13 does not know union switch `4` on `xdr.TransactionMeta`, so every write call (`establishTrustlines`, `claimSystem`, `buildUnit`, `moveFleet`, `resolveBattle`) lands on-chain and then throws `Bad union switch: 4` while parsing its own confirmation in `pollTransaction` (fixed in PR #15).
- **Why major upgrades require care:** `@stellar/stellar-sdk` 17 represents decoded XDR union/struct values as plain data properties (e.g. `op.body.invokeHostFunctionOp...`) rather than the method accessors (`op.body().invokeHostFunctionOp()...`) used in v13.
- **Runtime guard:** `StarboundClient` performs a lightweight check at construction time (`assertCompatibleStellarSdk`) to verify `xdr.TransactionMeta.v4` is present and fails fast with a descriptive error if an older SDK is resolved.

---

## Quick start

```ts
import {
  StarboundClient,
  GalaxyClient,
  FleetClient,
  ResourcesClient,
  BattleClient,
} from '@starbound-realms/sdk';

// 1. Create a client pointing at Stellar testnet.
//    Contract IDs come from your .env after running scripts/setup-testnet.sh.
const client = StarboundClient.testnet({
  galaxyMap: 'C...', // GALAXY_MAP_CONTRACT_ID
  resources:  'C...', // RESOURCES_CONTRACT_ID
  fleet:      'C...', // FLEET_CONTRACT_ID
  battle:     'C...', // BATTLE_CONTRACT_ID
});

// 2. Wrap it in domain clients.
const galaxy    = new GalaxyClient(client);
const fleet     = new FleetClient(client);
const resources = new ResourcesClient(client);
const battle    = new BattleClient(client);
```

---

## Read calls vs. write calls

**Read calls** (`simulate*`) never submit a transaction. They use Soroban's
`simulateTransaction` endpoint to execute a contract function locally and
return its value. No account needs to be funded and no fee is charged.

```ts
// Fetch a star system — no wallet required.
const system = await galaxy.getSystem(42);
console.log(system.owner, system.resourceType, system.resourceYield);

// Fetch the grid size.
const size = await galaxy.getGridSize(); // e.g. 20

// Fetch a player's fleet.
const myFleet = await fleet.getFleet('G...');

// Get a single resource balance.
const iron = await resources.getBalance('G...', 'Iron');

// Get all three balances at once.
const balances = await resources.getAllBalances('G...');
// => { Iron: 100n, Energy: 50n, Plasma: 10n }
```

**Write calls** build, simulate, sign, submit, and confirm a transaction. They
require a funded source account and a signer function — see the [signer
abstraction](#the-transactionsigner-abstraction) below.

```ts
// Claim an unclaimed star system.
await galaxy.claimSystem(playerAddress, systemId, sign);

// Build fleet units.
await fleet.buildUnit(playerAddress, 'Fighter', 5, sign);

// Move your fleet.
await fleet.moveFleet(playerAddress, targetSystemId, sign);

// Resolve a battle.
const battleId = await battle.resolveBattle(
  attackerAddress,
  defenderAddress,
  systemId,
  sign
);
```

---

## The `TransactionSigner` abstraction

```ts
type TransactionSigner = (xdr: string) => Promise<string>;
```

A `TransactionSigner` receives an **unsigned** transaction XDR string and must
return a **signed** XDR string. The SDK never holds or sees a private key — the
caller decides how signing happens:

**In the frontend** (Freighter wallet):

```ts
import { signTransaction } from '@stellar/freighter-api';

const sign: TransactionSigner = (xdr) =>
  signTransaction(xdr, { networkPassphrase: Networks.TESTNET });
```

**In scripts / tests** (Keypair):

```ts
import { Keypair, TransactionBuilder, Networks } from '@stellar/stellar-sdk';

const keypair = Keypair.fromSecret('S...');
const sign: TransactionSigner = async (xdr) => {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  tx.sign(keypair);
  return tx.toXDR();
};
```

This separation means the same SDK works in a browser (where the private key
lives in Freighter) and in Node.js scripts (where a funded keypair is used
directly) without any code changes.

---

## Trustlines

In-game resources are real Stellar assets. A player must hold a trustline to
each one before they can receive any. The SDK exposes helpers:

```ts
// Check which trustlines are missing.
const missing = await resources.findMissingTrustlines(playerAddress, issuerAddress);

// Establish all missing trustlines in one transaction.
// Safe to call on every wallet connect — does nothing if all are already set.
await resources.establishTrustlines(playerAddress, issuerAddress, sign);
```

---

## Error handling

The SDK throws typed errors so callers can branch on failure mode with
`instanceof` rather than string matching:

| Class | When thrown |
|---|---|
| `SimulationError` | Soroban simulation failed (contract panic, bad args, etc.) |
| `TransactionRejectedError` | Network rejected the transaction before processing |
| `TransactionFailedError` | Transaction was processed but failed on-chain |
| `NetworkError` | Transient RPC network failure after all retries exhausted |

```ts
import {
  SimulationError,
  TransactionFailedError,
  TransactionRejectedError,
  NetworkError,
} from '@starbound-realms/sdk';

try {
  await galaxy.claimSystem(playerAddress, systemId, sign);
} catch (err) {
  if (err instanceof SimulationError) {
    // Contract rejected the call (e.g. system already claimed).
  } else if (err instanceof TransactionFailedError) {
    // On-chain failure — look at err.message for the status.
  } else if (err instanceof TransactionRejectedError) {
    // Network refused the transaction.
  } else if (err instanceof NetworkError) {
    // All retries exhausted — RPC node is unreachable.
  }
}
```

Transient RPC errors (e.g. `"client error (SendRequest)"`, which Stellar
testnet occasionally emits) are **automatically retried** up to 3 times with
exponential backoff before throwing `NetworkError`. Genuine contract failures
are never retried.

---

## Advanced: `StarboundClient` directly

All domain clients (`GalaxyClient`, `FleetClient`, etc.) are thin wrappers
around `StarboundClient`. You can use it directly for calls that don't have a
dedicated client method:

```ts
import { nativeToScVal } from '@stellar/stellar-sdk';

// Raw read call.
const raw = await client.simulateReadCall(
  client.contractIds.galaxyMap,
  'get_system',
  [nativeToScVal(42, { type: 'u32' })]
);
```

---

## Custom network / mainnet

`StarboundClient.testnet(contractIds)` is a convenience factory. For mainnet or
a custom RPC node, use the constructor directly:

```ts
import { StarboundClient, Networks } from '@starbound-realms/sdk';
import { Networks as StellarNetworks } from '@stellar/stellar-sdk';

const client = new StarboundClient({
  rpcUrl: 'https://mainnet.stellar.validationcloud.io/v1/<key>',
  networkPassphrase: StellarNetworks.PUBLIC,
  contractIds: { galaxyMap: 'C...', resources: 'C...', fleet: 'C...', battle: 'C...' },
});
```

---

## End-to-end testnet example (`sdk/examples/full-loop.ts`)

To run the complete gameplay flow (`establishTrustlines` → `claimSystem` → `mine` → `buildUnit` → `resolveBattle` → `getBattle`) against the live Stellar testnet deployment in `.env.testnet` using a plain `Keypair` signer (no Freighter required):

```bash
pnpm --dir sdk build
node sdk/examples/full-loop.ts
```

You can optionally pass `ATTACKER_SECRET` and `DEFENDER_SECRET` environment variables to reuse existing funded testnet accounts across runs.

