/**
 * End-to-end testnet example for `@starbound-realms/sdk`.
 *
 * Demonstrates the full gameplay loop against the live Stellar testnet
 * deployment from `.env.testnet` using a plain `Keypair` signer (no Freighter
 * browser extension required):
 *
 *   1. Fund attacker & defender accounts via Testnet Friendbot (or reuse env keys)
 *   2. Establish classic Stellar trustlines for IRON, NRGY, PLSM (`ResourcesClient.establishTrustlines`)
 *   3. Claim unclaimed star systems on the galaxy map (`GalaxyClient.claimSystem`)
 *   4. Mine Iron & Energy from owned systems (`resources.mine`) once a 300s period elapses
 *   5. Build a fleet unit (`FleetClient.buildUnit`) and read back the fleet (`FleetClient.getFleet`)
 *   6. Attack the defender's system (`BattleClient.resolveBattle`) and inspect the result (`BattleClient.getBattle`)
 *
 * Usage (from repo root):
 *   pnpm --dir sdk build
 *   node sdk/examples/full-loop.ts
 *
 * Optional environment variables:
 *   ATTACKER_SECRET  - Reuse an existing funded testnet secret key for the attacker
 *   DEFENDER_SECRET  - Reuse an existing funded testnet secret key for the defender
 *   ADMIN_SECRET     - Deployer secret key; if set, mints resources directly instead of waiting for mining period
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
import {
  StarboundClient,
  GalaxyClient,
  ResourcesClient,
  FleetClient,
  BattleClient,
  type TransactionSigner,
} from '../dist/index.js';

// ── 1. Load contract IDs from .env.testnet (with fallback to the Oct 12 deployment) ──

function loadTestnetEnv(): Record<string, string> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname, '../../.env.testnet');
  const vars: Record<string, string> = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq !== -1) {
        vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
    }
  }
  return vars;
}

const envFile = loadTestnetEnv();

const CONTRACT_IDS = {
  galaxyMap: process.env.CONTRACT_GALAXY_MAP ?? envFile.CONTRACT_GALAXY_MAP ?? 'CBT7KWIY6VGJ7UO4H3EEEJEFEJGFYKBRMORLP6ZZHDIGJNWIIBERQHCD',
  resources: process.env.CONTRACT_RESOURCES ?? envFile.CONTRACT_RESOURCES ?? 'CCXFTWABMR2464IUGYSCSTHJSLRQY237BXCQLDOOYC7TZR7XGLH47FSL',
  fleet: process.env.CONTRACT_FLEET ?? envFile.CONTRACT_FLEET ?? 'CDN4HG6MEGVEON5OXLNBXVISLYA47EFDFI6DWBHS7GNLONGGNBMVXJNF',
  battle: process.env.CONTRACT_BATTLE ?? envFile.CONTRACT_BATTLE ?? 'CDOFURGGF2CCGEKUSWFRMNVA7T25VGOKCQDNJYEP52WYQJUNC65DJXCU',
};

const RESOURCE_ISSUER =
  process.env.RESOURCE_ISSUER ??
  envFile.RESOURCE_ISSUER ??
  'GC3BJ52UL6CBAJBSZRX5DIPHXUW6OGJFVWMQKV3GLBMXHEZ66BWLXZN6';

const MINING_PERIOD_SECONDS = 300;

/**
 * Creates a {@link TransactionSigner} backed by a raw `Keypair`.
 */
function createKeypairSigner(keypair: Keypair, networkPassphrase = Networks.TESTNET): TransactionSigner {
  return async (unsignedXdr: string): Promise<string> => {
    const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
    tx.sign(keypair);
    return tx.toXDR();
  };
}

async function ensureFunded(serverUrl: string, address: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    // Account may already be funded on testnet; ignore 400 "createAccountAlreadyExist".
    const text = await res.text();
    if (!text.includes('createAccountAlreadyExist')) {
      throw new Error(`Friendbot funding failed for ${address} (${ serverUrl }): ${res.status} ${text}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('=== Starbound Realms SDK — Full Testnet Loop ===');
  console.log('Contracts:', CONTRACT_IDS);
  console.log('Resource Issuer:', RESOURCE_ISSUER);

  const client = StarboundClient.testnet(CONTRACT_IDS);
  const galaxy = new GalaxyClient(client);
  const resources = new ResourcesClient(client);
  const fleet = new FleetClient(client);
  const battle = new BattleClient(client);

  // ── Step 1: Prepare & fund accounts ─────────────────────────────────────────
  const attacker = process.env.ATTACKER_SECRET
    ? Keypair.fromSecret(process.env.ATTACKER_SECRET)
    : Keypair.random();
  const defender = process.env.DEFENDER_SECRET
    ? Keypair.fromSecret(process.env.DEFENDER_SECRET)
    : Keypair.random();

  const signAttacker = createKeypairSigner(attacker);
  const signDefender = createKeypairSigner(defender);

  console.log(`\n[1/6] Funding accounts on Stellar Testnet...`);
  console.log(`  Attacker: ${attacker.publicKey()}`);
  console.log(`  Defender: ${defender.publicKey()}`);
  await Promise.all([
    ensureFunded(client.server.serverURL.toString(), attacker.publicKey()),
    ensureFunded(client.server.serverURL.toString(), defender.publicKey()),
  ]);

  // ── Step 2: Establish resource trustlines ───────────────────────────────────
  console.log(`\n[2/6] Checking & establishing resource trustlines (IRON, NRGY, PLSM)...`);
  const missingBefore = await resources.findMissingTrustlines(attacker.publicKey(), RESOURCE_ISSUER);
  console.log(`  Missing trustlines before: [${missingBefore.join(', ')}]`);
  await resources.establishTrustlines(attacker.publicKey(), RESOURCE_ISSUER, signAttacker);
  const missingAfter = await resources.findMissingTrustlines(attacker.publicKey(), RESOURCE_ISSUER);
  console.log(`  Missing trustlines after:  [${missingAfter.join(', ')}]`);

  // ── Step 3: Claim star systems ──────────────────────────────────────────────
  console.log(`\n[3/6] Scanning galaxy grid and claiming star systems...`);
  const gridSize = await galaxy.getGridSize();
  const totalSystems = gridSize * gridSize;

  let attackerIronSys: number | null = null;
  let attackerEnergySys: number | null = null;
  let defenderTargetSys: number | null = null;
  let unclaimedIronSys: number | null = null;
  let unclaimedEnergySys: number | null = null;
  let unclaimedDefenderSys: number | null = null;

  for (let id = 0; id < totalSystems; id++) {
    const sys = await galaxy.getSystem(id);
    const rType = Array.isArray(sys.resourceType) ? sys.resourceType[0] : sys.resourceType;
    if (sys.owner === attacker.publicKey()) {
      if (rType === 'Iron' && attackerIronSys === null) attackerIronSys = id;
      if (rType === 'Energy' && attackerEnergySys === null) attackerEnergySys = id;
    } else if (sys.owner === defender.publicKey()) {
      if (defenderTargetSys === null) defenderTargetSys = id;
    } else if (sys.owner === null) {
      if (rType === 'Iron' && unclaimedIronSys === null) unclaimedIronSys = id;
      else if (rType === 'Energy' && unclaimedEnergySys === null) unclaimedEnergySys = id;
      else if (unclaimedDefenderSys === null) unclaimedDefenderSys = id;
    }
    if (
      attackerIronSys !== null &&
      attackerEnergySys !== null &&
      defenderTargetSys !== null
    ) {
      break;
    }
  }

  if (attackerIronSys === null) {
    if (unclaimedIronSys === null) throw new Error('No unclaimed Iron system found on testnet');
    console.log(`  Attacker claiming Iron system #${unclaimedIronSys}...`);
    await galaxy.claimSystem(attacker.publicKey(), unclaimedIronSys, signAttacker);
    attackerIronSys = unclaimedIronSys;
  } else {
    console.log(`  Attacker already owns Iron system #${attackerIronSys}`);
  }

  if (attackerEnergySys === null) {
    if (unclaimedEnergySys === null) throw new Error('No unclaimed Energy system found on testnet');
    console.log(`  Attacker claiming Energy system #${unclaimedEnergySys}...`);
    await galaxy.claimSystem(attacker.publicKey(), unclaimedEnergySys, signAttacker);
    attackerEnergySys = unclaimedEnergySys;
  } else {
    console.log(`  Attacker already owns Energy system #${attackerEnergySys}`);
  }

  if (defenderTargetSys === null) {
    if (unclaimedDefenderSys === null) throw new Error('No unclaimed system found for defender');
    console.log(`  Defender claiming target system #${unclaimedDefenderSys}...`);
    await galaxy.claimSystem(defender.publicKey(), unclaimedDefenderSys, signDefender);
    defenderTargetSys = unclaimedDefenderSys;
  } else {
    console.log(`  Defender already owns target system #${defenderTargetSys}`);
  }

  const verifiedIron = await galaxy.getSystem(attackerIronSys);
  const verifiedTarget = await galaxy.getSystem(defenderTargetSys);
  console.log(`  Verified owner of #${attackerIronSys}: ${verifiedIron.owner}`);
  console.log(`  Verified owner of #${defenderTargetSys}: ${verifiedTarget.owner}`);

  // ── Step 4: Obtain Iron & Energy (via mine or admin mint) ───────────────────
  console.log(`\n[4/6] Ensuring attacker has resources to build a Scout (10 Iron, 5 Energy)...`);
  let balances = await resources.getAllBalances(attacker.publicKey());
  console.log(`  Current balances: Iron=${balances.Iron}, Energy=${balances.Energy}, Plasma=${balances.Plasma}`);

  if (balances.Iron < 10n || balances.Energy < 5n) {
    const resourcesContract = new Contract(CONTRACT_IDS.resources);
    const ironSysInfo = await galaxy.getSystem(attackerIronSys);
    const energySysInfo = await galaxy.getSystem(attackerEnergySys);
    const nowSec = Math.floor(Date.now() / 1000);
    const readyAt = Math.max(ironSysInfo.lastClaimed, energySysInfo.lastClaimed) + MINING_PERIOD_SECONDS;
    if (nowSec < readyAt + 5) {
      const waitSec = readyAt + 5 - nowSec;
      console.log(`  Waiting ${waitSec}s for one ${MINING_PERIOD_SECONDS}s mining period to elapse on-chain...`);
      await sleep(waitSec * 1000);
    }

    if (balances.Iron < 10n) {
      console.log(`  Mining Iron from system #${attackerIronSys}...`);
      const res = await client.submitTransaction({
        sourceAddress: attacker.publicKey(),
        operation: resourcesContract.call(
          'mine',
          nativeToScVal(attacker.publicKey(), { type: 'address' }),
          nativeToScVal(attackerIronSys, { type: 'u32' })
        ),
        sign: signAttacker,
      });
      console.log(`  Mined Iron: ${res.returnValue ? scValToNative(res.returnValue) : 'ok'}`);
    }

    if (balances.Energy < 5n) {
      console.log(`  Mining Energy from system #${attackerEnergySys}...`);
      const res = await client.submitTransaction({
        sourceAddress: attacker.publicKey(),
        operation: resourcesContract.call(
          'mine',
          nativeToScVal(attacker.publicKey(), { type: 'address' }),
          nativeToScVal(attackerEnergySys, { type: 'u32' })
        ),
        sign: signAttacker,
      });
      console.log(`  Mined Energy: ${res.returnValue ? scValToNative(res.returnValue) : 'ok'}`);
    }

    balances = await resources.getAllBalances(attacker.publicKey());
    console.log(`  Updated balances: Iron=${balances.Iron}, Energy=${balances.Energy}, Plasma=${balances.Plasma}`);
  }

  // ── Step 5: Build fleet unit ────────────────────────────────────────────────
  console.log(`\n[5/6] Building 1 Scout unit for attacker...`);
  await fleet.buildUnit(attacker.publicKey(), 'Scout', 1, signAttacker);
  const attackerFleet = await fleet.getFleet(attacker.publicKey());
  console.log(`  Attacker fleet on-chain:`, attackerFleet);

  // ── Step 6: Attack defender's system ────────────────────────────────────────
  console.log(`\n[6/6] Resolving battle at system #${defenderTargetSys}...`);
  const battleId = await battle.resolveBattle(
    attacker.publicKey(),
    defender.publicKey(),
    defenderTargetSys,
    signAttacker
  );
  const battleResult = await battle.getBattle(battleId);
  const postBattleSystem = await galaxy.getSystem(defenderTargetSys);

  console.log(`  Battle #${battleId} resolved in ${battleResult.rounds} round(s)!`);
  console.log(`  Battle result:`, battleResult);
  console.log(`  System #${defenderTargetSys} owner after battle: ${postBattleSystem.owner}`);
  console.log(`\n✅ Full testnet loop completed successfully.`);
}

main().catch((err) => {
  console.error('\n❌ Full loop failed:', err);
  process.exit(1);
});
