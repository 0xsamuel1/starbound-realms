# Why Stellar and Soroban?

Starbound Realms uses Stellar as its settlement layer and Soroban as its smart-contract runtime. This is a deliberate choice for a game that needs frequent, inexpensive state changes without giving a central server control over ownership or combat outcomes.

## Why Stellar?

- **Fast finality:** claims, fleet movements, and resource actions settle quickly enough for an interactive game.
- **Low predictable fees:** players can experiment and transact without gas costs dominating gameplay.
- **Built-in assets:** resources can use Stellar's asset and trustline model instead of inventing a second token system.
- **Mature wallets and tooling:** Freighter and the Stellar SDK make signing explicit and keep keys in the player's wallet.

## Why Soroban?

Soroban gives us deterministic Rust contracts for the rules that matter: claiming systems, moving fleets, resolving battles, and tracking resources. A contract can be inspected and tested independently of the frontend and backend, so the API is an index and convenience layer—not an authority that can rewrite game state.

## What stays off-chain?

The backend indexes contract events and serves read-optimized pages. It does not custody keys or decide who owns a system. The frontend can therefore remain responsive while the chain remains the source of truth.

## Is a blockchain required for every feature?

No. Presentation, caching, matchmaking UX, and analytics belong off-chain. Stellar/Soroban is reserved for scarce state and actions where verifiable ownership, settlement, and transparent rules are valuable.
