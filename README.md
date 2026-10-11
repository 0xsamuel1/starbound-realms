# 🌌 Starbound Realms

> A fully on-chain strategy game built on the Stellar network. Conquer star systems, mine resources, build fleets, and battle other players — all on-chain, all verifiable, all yours.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-7B2D8B)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-blue)](https://soroban.stellar.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Good First Issues](https://img.shields.io/github/issues/OlaGreat/starbound-realms/good%20first%20issue)](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

---

## What is Starbound Realms?

Starbound Realms is a turn-based, on-chain strategy game where players compete for control of a procedurally generated galaxy. Every action — claiming a star system, mining resources, building a fleet, initiating a battle — is a transaction on the Stellar blockchain, executed by Soroban smart contracts.

There is no central server controlling game state. No admin key that can alter outcomes. No hidden logic. The galaxy is on-chain, open, and permanent.

**Game loop in one sentence:** Claim star systems → mine their resources → build fleets → conquer neighbors → dominate the galaxy.

---

## Why Stellar?

- **Speed** — Stellar finalizes transactions in ~5 seconds. Fast enough for a real game.
- **Cost** — Transaction fees are fractions of a cent. Players won't be priced out by gas.
- **Soroban** — A purpose-built smart contract platform with a clean auth model, predictable execution costs, and Rust-based contracts that compile to WASM.
- **Native assets** — In-game resources are real Stellar assets, not synthetic game tokens. They live on the Stellar DEX and can be traded freely.
- **Freighter** — Players connect with Freighter, the standard Stellar browser wallet. No new wallet to install for existing Stellar users.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│              Freighter Wallet  ·  Vite  ·  TypeScript            │
└──────────────────────┬──────────────────┬───────────────────────┘
                       │                  │
              Write Path                Read Path
                       │                  │
        ┌──────────────▼──┐    ┌──────────▼──────────────┐
        │  TypeScript SDK  │    │   Backend API (REST)     │
        │  (contract calls)│    │   Node.js · Express      │
        └──────────────┬──┘    └──────────┬───────────────┘
                       │                  │
        ┌──────────────▼──┐    ┌──────────▼───────────────┐
        │  Soroban RPC     │    │   PostgreSQL              │
        │  (Stellar node)  │    │   (indexed chain data)    │
        └──────────────┬──┘    └──────────▲───────────────┘
                       │                  │
        ┌──────────────▼──────────────────┴───────────────┐
        │              Soroban Smart Contracts              │
        │  galaxy-map · resources · fleet · battle          │
        └───────────────────────────────────────────────────┘
```

**Write path:** Frontend → TypeScript SDK → Soroban RPC → Contracts on-chain

**Read path:** Frontend → Backend REST API → PostgreSQL (data indexed from chain events)

All game-state mutations happen on-chain. The backend is read-only — it indexes contract events into Postgres for fast queries, leaderboards, and battle history, without the frontend hammering the RPC node.

---

## Smart Contracts

| Contract | Description |
|---|---|
| `galaxy-map` | Manages the galaxy grid. Tracks star system ownership, coordinates, and attributes. |
| `resources` | Issues and manages in-game resource tokens (Iron, Energy, Plasma) as Stellar assets. |
| `fleet` | Handles fleet composition, unit construction, and fleet movement between systems. |
| `battle` | Resolves combat between fleets using on-chain randomness via Soroban `Prng`. |

All contracts are written in Rust, compiled to WASM, and deployed to the Stellar network.

---

## Game Mechanics

### The Galaxy
The galaxy is a grid of star systems, each with:
- **Coordinates** (x, y) stored on-chain
- **Resource yield** — how much Iron, Energy, or Plasma it produces per cycle
- **Owner** — a Stellar address, or unclaimed (`None`)
- **Defense rating** — base defense value, modified by stationed fleet size

### Resources
Three resource types, each a native Stellar asset:
| Resource | Symbol | Use |
|---|---|---|
| Iron | `IRON` | Fleet construction |
| Energy | `NRGY` | Fleet movement & upkeep |
| Plasma | `PLSM` | Advanced units & upgrades |

Since they're real Stellar assets, players can trade them on the Stellar DEX, and each player sets up a one-time trustline to hold them (the app offers this after connecting a wallet). Today resources are created only by an admin mint; passive mining from owned systems is planned but not implemented yet.

### Fleets
Fleets are composed of units, each with attack and defense stats stored in the `fleet` contract. Players build units by spending resources, then move fleets between adjacent star systems.

### Battle
Battle is a separate action from moving — a player explicitly attacks a system owned by someone else by
calling `battle.resolve_battle`, naming that system's current owner as the defender. There's no location
requirement: an attacker's fleet doesn't need to be at the target system first. The `battle` contract:
1. Reads attacker and defender fleet stats
2. Applies combat modifiers (system defense rating, unit types)
3. Uses `Prng` for verifiable on-chain randomness
4. Writes the outcome — winner takes the system, loser fleet is reduced

All battle outcomes are emitted as contract events, indexed by the backend, and queryable via the REST API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust · Soroban SDK v25 |
| TypeScript SDK | TypeScript · `@stellar/stellar-sdk` v13 |
| Frontend | React 18 · Vite · TypeScript |
| Wallet | Freighter (browser extension) |
| Backend | Node.js · Express · TypeScript |
| Database | PostgreSQL |
| Indexer | Soroban event streaming |
| Infra | Docker · Docker Compose |
| CI | GitHub Actions |

---

## Project Structure

```
starbound-realms/
├── contracts/              # Soroban smart contracts (Rust)
│   ├── galaxy-map/
│   ├── resources/
│   ├── fleet/
│   └── battle/
├── sdk/                    # TypeScript SDK
│   └── src/
├── frontend/               # React + Vite frontend
│   └── src/
├── backend/                # Node.js indexer + REST API
│   └── src/
│       ├── indexer/        # Soroban event listener
│       ├── api/            # REST routes
│       └── db/             # Postgres schema & queries
├── scripts/                # Deploy & testnet setup scripts
├── docs/                   # Architecture & game mechanics docs
├── .github/                # CI workflows & issue templates
├── docker-compose.yml
├── Cargo.toml              # Rust workspace
└── README.md
```

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable, 1.75+)
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli) (`stellar` v26+)
- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v9+)
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)
- [Freighter wallet](https://freighter.app/) (browser extension)

### 1. Fork the repository

### 2. Install dependencies

```bash
# Install Node.js dependencies (SDK + frontend + backend)
pnpm install

# Install Rust Soroban target
rustup target add wasm32-unknown-unknown
```

### 3. Start local infrastructure

```bash
docker-compose up -d
```

This starts a local PostgreSQL instance. The Soroban contracts run on Stellar testnet.

### 4. Set up testnet & deploy contracts

```bash
# Fund a testnet account and deploy all contracts
./scripts/setup-testnet.sh
```

This script will:
- Create a testnet keypair
- Fund it via Friendbot
- Build and deploy all four Soroban contracts
- Write deployed contract IDs to `.env` files

### 5. Start the backend

```bash
cd backend
cp .env.example .env   # fill in your contract IDs
pnpm dev
```

### 6. Start the frontend

```bash
cd frontend
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173), connect Freighter, and start claiming star systems.

---

## Contributing

Starbound Realms is actively looking for contributors. Whether you write Rust, TypeScript, or just want to improve documentation — there's a place for you here.

**Engineering standards we follow:**
- **TDD** — write the failing test first, then the implementation
- **SOLID principles** — Single Responsibility above all else
- **One function, one job** — every function does exactly one thing and its name must describe that thing precisely

Full details in [`docs/engineering-guidelines.md`](docs/engineering-guidelines.md)

**Good places to start:**

- [`good first issue`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — Beginner-friendly issues across all layers
- [`help wanted`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) — Larger features open for contributors
- [`contracts`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3Acontracts) — Soroban/Rust issues
- [`frontend`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3Afrontend) — React/TypeScript issues
- [`backend`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3Abackend) — Node.js/indexer issues

Read the full [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

---

## Roadmap

- [x] Project architecture & design
- [x] `galaxy-map` contract — core world state (types, storage, `claim_system`)
- [x] `resources` contract — resource token issuance (mint, burn, balance)
- [ ] `fleet` contract — unit management
- [ ] `battle` contract — combat resolution
- [x] TypeScript SDK — `StarboundClient` RPC setup
- [ ] SDK — galaxy, fleet, battle, resources modules
- [ ] Backend indexer — Soroban event listener
- [ ] Backend REST API — full implementation (galaxy, player, fleet, battle)
- [ ] Frontend — galaxy map renderer
- [ ] Frontend — fleet builder UI
- [ ] Frontend — battle log & wallet integration
- [ ] Testnet deployment
- [ ] Mainnet launch

---

## License

[MIT](LICENSE) — free to use, fork, and build on.

---

## Acknowledgements

Built on [Stellar](https://stellar.org) and [Soroban](https://soroban.stellar.org).  
Wallet integration via [Freighter](https://freighter.app).  
Inspired by the vision of a truly on-chain game economy where players own everything.
