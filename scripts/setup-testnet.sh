#!/bin/bash
set -e

# ── Setup Stellar testnet and deploy all contracts ────────────────────────────
# Usage: ./scripts/setup-testnet.sh
# Requires: stellar CLI v26+, cargo, rustup wasm32 target
#
# Idempotent: deployed IDs are remembered in scripts/.deploy-state so a re-run
# reuses them rather than redeploying, and `initialize` is skipped on any
# contract that reports it is already initialized. The three resource asset
# contracts (IRON/NRGY/PLSM) are deployed once and their admin is handed to the
# resources contract, so a player can mine with only their own signature.

IDENTITY="deployer"
NETWORK="testnet"
WASM_DIR="target/wasm32-unknown-unknown/release"
STATE_FILE="scripts/.deploy-state"
GRID_SIZE="${GRID_SIZE:-8}"

echo "🌌 Starbound Realms — Testnet Setup"
echo "────────────────────────────────────"

# ── Step 1: Create identity if it doesn't exist ───────────────────────────────
create_identity_if_missing() {
  if stellar keys address "$IDENTITY" &>/dev/null; then
    echo "✅ Identity '$IDENTITY' already exists"
  else
    echo "🔑 Generating new identity: $IDENTITY"
    stellar keys generate "$IDENTITY" --network "$NETWORK"
  fi
}

# ── Step 2: Fund the account via Friendbot ────────────────────────────────────
fund_account() {
  echo "💸 Funding $IDENTITY via Friendbot..."
  stellar keys fund "$IDENTITY" --network "$NETWORK"
}

# ── Step 3: Build all contracts ───────────────────────────────────────────────
build_contracts() {
  echo "🔨 Building contracts..."
  cargo build --target wasm32-unknown-unknown --release --quiet
  echo "✅ Contracts built"
}

# ── Step 4: Remember deployed IDs across runs ─────────────────────────────────
load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
    echo "📄 Reusing deployment state from $STATE_FILE"
  fi
}

write_state() {
  cat > "$STATE_FILE" <<EOF
GALAXY_MAP=$GALAXY_MAP
RESOURCES=$RESOURCES
FLEET=$FLEET
BATTLE=$BATTLE
ASSET_IRON=$ASSET_IRON
ASSET_ENERGY=$ASSET_ENERGY
ASSET_PLASMA=$ASSET_PLASMA
RESOURCE_ISSUER=$RESOURCE_ISSUER
EOF
  echo "💾 Deployment state saved to $STATE_FILE"
}

# ── Step 5: Deploy (or reuse) a single contract ──────────────────────────────
# Prints the contract ID on stdout; all progress goes to stderr so callers can
# capture just the ID with $(...).
deploy_or_reuse() {
  local name=$1
  local wasm_file=$2
  local existing=$3

  if [[ -n "$existing" ]]; then
    echo "♻️  Reusing $name: $existing" >&2
    echo "$existing"
    return
  fi

  echo "🚀 Deploying $name..." >&2
  local contract_id
  contract_id=$(stellar contract deploy \
    --wasm "$wasm_file" \
    --source "$IDENTITY" \
    --network "$NETWORK" 2>/dev/null | tail -1)
  echo "✅ $name deployed: $contract_id" >&2
  echo "$contract_id"
}

# ── Step 6: Deploy (or reuse) a resource asset's Stellar Asset Contract ───────
deploy_asset_or_reuse() {
  local code=$1
  local issuer=$2
  local existing=$3

  if [[ -n "$existing" ]]; then
    echo "♻️  Reusing $code asset: $existing" >&2
    echo "$existing"
    return
  fi

  echo "🚀 Deploying $code asset (issuer $issuer)..." >&2
  local contract_id
  contract_id=$(stellar contract asset deploy \
    --asset "$code:$issuer" \
    --source "$IDENTITY" \
    --network "$NETWORK" 2>/dev/null | tail -1)
  echo "✅ $code asset deployed: $contract_id" >&2
  echo "$contract_id"
}

# ── Step 7: Invoke a contract function, returning any panic text on failure ───
invoke_contract() {
  local contract_id=$1
  shift
  stellar contract invoke \
    --id "$contract_id" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- "$@"
}

# ── Step 8: Initialize a contract, skipping one that is already initialized ───
initialize_if_needed() {
  local name=$1
  local contract_id=$2
  shift 2

  local output
  if output=$(invoke_contract "$contract_id" "$@" 2>&1); then
    echo "✅ $name initialized"
  elif [[ "$output" == *"already initialized"* ]]; then
    echo "♻️  $name already initialized — skipping"
  else
    echo "❌ $name initialization failed:" >&2
    echo "$output" >&2
    exit 1
  fi
}

# ── Step 9: Hand an asset's admin to the resources contract (once) ────────────
set_asset_admin_if_needed() {
  local name=$1
  local asset_id=$2
  local new_admin=$3

  local current
  current=$(invoke_contract "$asset_id" admin 2>/dev/null | tr -d '"[:space:]' || true)
  if [[ "$current" == "$new_admin" ]]; then
    echo "♻️  $name admin already belongs to the resources contract — skipping"
    return
  fi

  echo "🔐 Handing $name admin to the resources contract..."
  invoke_contract "$asset_id" set_admin --new_admin "$new_admin" >/dev/null
  echo "✅ $name admin handed to resources"
}

# ── Step 10: Write contract IDs and config to .env files ─────────────────────
write_env_files() {
  cat > backend/.env <<EOF
DATABASE_URL=postgres://postgres:postgres@localhost:5432/starbound
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
CONTRACT_GALAXY_MAP=$GALAXY_MAP
CONTRACT_RESOURCES=$RESOURCES
CONTRACT_FLEET=$FLEET
CONTRACT_BATTLE=$BATTLE
ASSET_IRON=$ASSET_IRON
ASSET_ENERGY=$ASSET_ENERGY
ASSET_PLASMA=$ASSET_PLASMA
RESOURCE_ISSUER=$RESOURCE_ISSUER
INDEXER_POLL_INTERVAL_MS=5000
PORT=3000
EOF

  cat > frontend/.env <<EOF
VITE_BACKEND_URL=http://localhost:3000
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_CONTRACT_GALAXY_MAP=$GALAXY_MAP
VITE_CONTRACT_RESOURCES=$RESOURCES
VITE_CONTRACT_FLEET=$FLEET
VITE_CONTRACT_BATTLE=$BATTLE
VITE_RESOURCE_ISSUER=$RESOURCE_ISSUER
EOF

  echo "✅ .env files written"
}

# ── Main ──────────────────────────────────────────────────────────────────────
load_state

create_identity_if_missing
fund_account
build_contracts

RESOURCE_ISSUER=$(stellar keys address "$IDENTITY")

GALAXY_MAP=$(deploy_or_reuse "galaxy-map" "$WASM_DIR/galaxy_map.wasm" "${GALAXY_MAP:-}")
RESOURCES=$(deploy_or_reuse  "resources"  "$WASM_DIR/resources.wasm"  "${RESOURCES:-}")
FLEET=$(deploy_or_reuse      "fleet"      "$WASM_DIR/fleet.wasm"      "${FLEET:-}")
BATTLE=$(deploy_or_reuse     "battle"     "$WASM_DIR/battle.wasm"     "${BATTLE:-}")

ASSET_IRON=$(deploy_asset_or_reuse  "IRON" "$RESOURCE_ISSUER" "${ASSET_IRON:-}")
ASSET_ENERGY=$(deploy_asset_or_reuse "NRGY" "$RESOURCE_ISSUER" "${ASSET_ENERGY:-}")
ASSET_PLASMA=$(deploy_asset_or_reuse "PLSM" "$RESOURCE_ISSUER" "${ASSET_PLASMA:-}")

# Contracts must be initialized in dependency order: galaxy-map first, then
# resources (reads from galaxy-map), then fleet and battle (which hold each
# other's addresses).
initialize_if_needed "galaxy-map" "$GALAXY_MAP" initialize \
  --admin "$RESOURCE_ISSUER" --grid_size "$GRID_SIZE"
initialize_if_needed "resources" "$RESOURCES" initialize \
  --admin "$RESOURCE_ISSUER" \
  --iron_token "$ASSET_IRON" --energy_token "$ASSET_ENERGY" --plasma_token "$ASSET_PLASMA"
initialize_if_needed "fleet" "$FLEET" initialize \
  --admin "$RESOURCE_ISSUER" \
  --resources_contract "$RESOURCES" --galaxy_map_contract "$GALAXY_MAP"
initialize_if_needed "battle" "$BATTLE" initialize \
  --admin "$RESOURCE_ISSUER" \
  --galaxy_map_contract "$GALAXY_MAP" --fleet_contract "$FLEET"

# Register the resources contract with galaxy-map so `mine` can read ownership.
echo "🔗 Registering galaxy-map with resources..."
invoke_contract "$RESOURCES" set_galaxy_map \
  --caller "$RESOURCE_ISSUER" --galaxy_map "$GALAXY_MAP" >/dev/null
echo "✅ galaxy-map registered"

# Register the battle contract with fleet and galaxy-map so battles can settle.
echo "🔗 Registering battle contract..."
invoke_contract "$FLEET" set_battle_contract \
  --caller "$RESOURCE_ISSUER" --battle_contract "$BATTLE" >/dev/null
invoke_contract "$GALAXY_MAP" set_battle_contract \
  --caller "$RESOURCE_ISSUER" --battle_contract "$BATTLE" >/dev/null
echo "✅ battle contract registered"

# Give the resources contract control of the assets so players can mine without
# the deployer's signature. This is one-way: the admin role cannot be handed back.
set_asset_admin_if_needed "IRON" "$ASSET_IRON" "$RESOURCES"
set_asset_admin_if_needed "NRGY" "$ASSET_ENERGY" "$RESOURCES"
set_asset_admin_if_needed "PLSM" "$ASSET_PLASMA" "$RESOURCES"

write_env_files
write_state

echo ""
echo "────────────────────────────────────"
echo "🎉 Deployment complete!"
echo "   grid size  : ${GRID_SIZE}x${GRID_SIZE}"
echo "   galaxy-map : $GALAXY_MAP"
echo "   resources  : $RESOURCES"
echo "   fleet      : $FLEET"
echo "   battle     : $BATTLE"
echo "   IRON       : $ASSET_IRON"
echo "   NRGY       : $ASSET_ENERGY"
echo "   PLSM       : $ASSET_PLASMA"
echo "   issuer     : $RESOURCE_ISSUER"
echo ""
echo "Next: pnpm dev (backend) && pnpm dev (frontend)"
