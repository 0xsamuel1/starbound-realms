# Changelog

All notable changes to `@starbound-realms/sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Runtime `@stellar/stellar-sdk` compatibility check** (`assertCompatibleStellarSdk`, `MIN_STELLAR_SDK_VERSION = '17.2.1'`): `StarboundClient` now verifies at construction time that `xdr.TransactionMeta.v4` is present and throws a descriptive error if an incompatible `<17` SDK is resolved.
- **Runnable end-to-end testnet example** (`sdk/examples/full-loop.ts`): Plain Node script using a `Keypair` signer (no Freighter needed) that establishes resource trustlines, claims systems, mines/obtains resources, builds a fleet unit, and resolves an on-chain battle against the live testnet deployment.
- **Typed error hierarchy and automatic retry-with-backoff** (`NetworkError`, `SimulationError`, `TransactionRejectedError`, `TransactionFailedError`, `isTransientNetworkError`, `withRetry`):
  - `StarboundClient` throws specific error subclasses instead of generic `Error` instances so callers can branch with `instanceof`.
  - Read calls (`simulateReadCall`) and pre-submission RPC calls (`getAccount`, `prepareTransaction`) automatically retry transient network failures (such as `"client error (SendRequest)"`) up to 3 times with exponential backoff.
- **Full TSDoc / JSDoc coverage** across `StarboundClient`, `GalaxyClient`, `ResourcesClient`, `FleetClient`, and `BattleClient` (`@param`, `@returns`, `@throws`), plus package documentation in `sdk/README.md`.
- **Resource trustline helpers** (`ResourcesClient.findMissingTrustlines`, `ResourcesClient.establishTrustlines`, `buildTrustlineKey`, `RESOURCE_ASSET_CODES`) and **`StarboundClient.submitClassicTransaction`** (#14):
  - In-game resources (`IRON`, `NRGY`, `PLSM`) are classic Stellar assets wrapped as Stellar Asset Contracts (SAC), requiring a classic `ChangeTrust` trustline before a player can hold or mine them.
  - `findMissingTrustlines` queries `getLedgerEntries` in a single batch to detect missing trustlines; `establishTrustlines` submits `ChangeTrust` operations only for missing assets in one transaction (and is a no-op if all three exist).
  - `submitClassicTransaction` builds, signs, submits, and polls classic non-Soroban operations directly without calling `prepareTransaction` (which rejects classic operations with `"unsupported operation type: OperationTypeChangeTrust"`).
- **Write methods across domain clients**:
  - `StarboundClient.submitTransaction` with the wallet-agnostic `TransactionSigner` (`(xdr: string) => Promise<string>`) abstraction.
  - `GalaxyClient.claimSystem` (`claim_system`).
  - `FleetClient.buildUnit` (`build_unit`), `FleetClient.moveFleet` (`move_fleet`), and `unitTypeToScVal`.
  - `BattleClient.resolveBattle` (`resolve_battle`), decoding and returning the on-chain `u64` battle ID as a `number`.

### Changed

- **BREAKING (dependency): Upgrade and pin `@stellar/stellar-sdk` from `^13.0.0` to `17.2.1` (peer `^17.2.1`)** (#15):
  - `@stellar/stellar-sdk` 13 cannot parse `TransactionMeta` v4, which Stellar testnet returns since Protocol 23 — causing every write transaction (`establishTrustlines`, `claimSystem`, `buildUnit`, `resolveBattle`) to land on-chain and then throw `Bad union switch: 4` while reading its own confirmation.
  - Note for callers inspecting raw XDR: `@stellar/stellar-sdk` 17 represents decoded XDR union/struct values as plain data properties (`op.body.invokeHostFunctionOp...`) rather than the method accessors (`op.body().invokeHostFunctionOp()...`) used in v13.
- **BREAKING: `BattleClient.getBattle` now returns `Promise<BattleResult>` instead of `Promise<BattleRecord>`**:
  - `BattleRecord` includes off-chain indexer metadata (`ledgerSequence`, `createdAt`) that is not stored in Soroban contract storage and cannot be populated by an on-chain read call (`get_battle`). `BattleClient.getBattle` now returns the on-chain `BattleResult` (`battleId`, `attacker`, `defender`, `systemId`, `winner`, `rounds`).
- **ESM / `NodeNext` module resolution** (`c69f6f6`):
  - Switched `sdk/tsconfig.json` from `"moduleResolution": "bundler"` to `"module": "NodeNext"` / `"moduleResolution": "NodeNext"` with explicit `.js` relative import specifiers so that compiled output in `dist/` can be imported directly by plain Node.js scripts and backend services, not only bundlers like Vite.
- **Package exports & build hygiene** (`2f15c56`):
  - Re-exported `TransactionSigner` and `WriteCallOptions` from the root `sdk/src/index.ts` entrypoint.
  - Excluded `*.test.ts` and `*.testutil.ts` from `tsconfig.json` build output so test files are not emitted into `dist/`.
  - Converted on-chain `u64` fields (`lastClaimed`, `lastMoved`, `battleId`) from `bigint` to `number` in `GalaxyClient.getSystem`, `FleetClient.getFleet`, and `BattleClient.getBattle`.
