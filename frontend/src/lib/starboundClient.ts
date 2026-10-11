import { StarboundClient, StarboundClientConfig } from '@starbound-realms/sdk';

const REQUIRED_KEYS = [
  'VITE_SOROBAN_RPC_URL',
  'VITE_NETWORK_PASSPHRASE',
  'VITE_CONTRACT_GALAXY_MAP',
  'VITE_CONTRACT_RESOURCES',
  'VITE_CONTRACT_FLEET',
  'VITE_CONTRACT_BATTLE',
] as const;

/** Reads one required env var, or throws a clear error naming which one is missing. */
function requireEnv(env: Record<string, string | undefined>, key: (typeof REQUIRED_KEYS)[number] | 'VITE_RESOURCE_ISSUER'): string {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is not set`);
  }
  return value;
}

/** Maps raw VITE_ env vars to a StarboundClientConfig, validating all are present. */
export function buildStarboundClientConfig(env: Record<string, string | undefined>): StarboundClientConfig {
  return {
    rpcUrl: requireEnv(env, 'VITE_SOROBAN_RPC_URL'),
    networkPassphrase: requireEnv(env, 'VITE_NETWORK_PASSPHRASE'),
    contractIds: {
      galaxyMap: requireEnv(env, 'VITE_CONTRACT_GALAXY_MAP'),
      resources: requireEnv(env, 'VITE_CONTRACT_RESOURCES'),
      fleet: requireEnv(env, 'VITE_CONTRACT_FLEET'),
      battle: requireEnv(env, 'VITE_CONTRACT_BATTLE'),
    },
  };
}

let cachedClient: StarboundClient | null = null;

/** Returns a shared StarboundClient instance, built from Vite's env vars on first use. */
export function getStarboundClient(): StarboundClient {
  if (!cachedClient) {
    cachedClient = new StarboundClient(buildStarboundClientConfig(import.meta.env));
  }
  return cachedClient;
}

/** Reads the address that issued the IRON/NRGY/PLSM assets, which trustlines must name. */
export function readResourceIssuer(env: Record<string, string | undefined>): string {
  return requireEnv(env, 'VITE_RESOURCE_ISSUER');
}

/** Returns the resource asset issuer from Vite's env vars. */
export function getResourceIssuer(): string {
  return readResourceIssuer(import.meta.env);
}
