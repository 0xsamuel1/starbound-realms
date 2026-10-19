# Contributing to Starbound Realms

Thanks for your interest in contributing. Starbound Realms is open to contributors of all skill levels — whether you write Rust, TypeScript, or just want to improve docs.

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

---

## Where to Start

- [`good first issue`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — Scoped, beginner-friendly tasks
- [`help wanted`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) — Larger features open for contributors
- [`contracts`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3Acontracts) — Soroban / Rust
- [`frontend`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3Afrontend) — React / TypeScript
- [`backend`](https://github.com/OlaGreat/starbound-realms/issues?q=is%3Aissue+is%3Aopen+label%3Abackend) — Node.js / indexer

---

## Areas to Contribute

| Area | Language | Location |
|---|---|---|
| Smart Contracts | Rust | `contracts/` |
| TypeScript SDK | TypeScript | `sdk/` |
| Frontend | React / TypeScript | `frontend/` |
| Backend / Indexer | Node.js / TypeScript | `backend/` |
| Documentation | Markdown | `docs/` |
| Scripts | Bash | `scripts/` |

---

## Local Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/starbound-realms.git
cd starbound-realms

# Install Node dependencies
pnpm install

# Add Rust WASM target
rustup target add wasm32-unknown-unknown

# Start Postgres
docker-compose up -d postgres

# Backend
cd backend && cp .env.example .env && pnpm dev

# Frontend (separate terminal)
cd frontend && pnpm dev
```

Full setup instructions: [`docs/contributing.md`](docs/contributing.md)

---

## Branch Naming

| Type | Pattern |
|---|---|
| Feature | `feat/<short-description>` |
| Bug fix | `fix/<short-description>` |
| Docs | `docs/<short-description>` |
| Refactor | `refactor/<short-description>` |

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>
```

**Types:** `feat` `fix` `docs` `refactor` `test` `chore`  
**Scopes:** `contracts` `sdk` `frontend` `backend` `docs` `ci`

```bash
# Examples
feat(contracts): implement fleet contract unit building
fix(backend): handle missing systemId in galaxy route
docs(readme): update getting started steps
```

---

## Engineering Standards

All contributions must follow our engineering guidelines:

- **TDD** — write the test first, then the implementation
- **SOLID principles** — especially Single Responsibility
- **One function, one job** — every function does exactly one thing and is named after what it does

Read the full guide: [`docs/engineering-guidelines.md`](docs/engineering-guidelines.md)

---

## Pull Request Guidelines

- One feature or fix per PR
- Reference the issue your PR closes: `Closes #42`
- Write a clear description — what changed and why
- Ensure CI passes before requesting review (`cargo test` + `pnpm test`)
- Every new function must have a corresponding test — no exceptions

---

## Questions?

Open a [GitHub Discussion](https://github.com/OlaGreat/starbound-realms/discussions) or comment on the issue you're working on.
