#![no_std]

use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, symbol_short, token, Address, Env,
};

// ── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    IronToken,
    EnergyToken,
    PlasmaToken,
    Initialized,
    GalaxyMap,
    LastMined(u32),
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ResourceType {
    Iron,
    Energy,
    Plasma,
}

/// Mirrors galaxy_map::StarSystem field-for-field. Its ResourceType has the
/// same variants in the same order as ours, so it encodes identically.
#[contracttype]
#[derive(Clone, Debug)]
pub struct StarSystem {
    pub owner: Option<Address>,
    pub coord_x: u32,
    pub coord_y: u32,
    pub resource_type: ResourceType,
    pub resource_yield: u32,
    pub defense_rating: u32,
    pub last_claimed: u64,
}

/// The slice of the galaxy-map contract this contract depends on.
#[contractclient(name = "GalaxyMapClient")]
pub trait GalaxyMapInterface {
    fn get_system(env: Env, system_id: u32) -> StarSystem;
}

/// Each full period a system is held pays its `resource_yield` once.
pub const MINING_PERIOD_SECONDS: u64 = 300;

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ResourcesContract;

#[contractimpl]
impl ResourcesContract {
    /// Initialize with addresses of the three Stellar Asset Contract (SAC) tokens.
    pub fn initialize(
        env: Env,
        admin: Address,
        iron_token: Address,
        energy_token: Address,
        plasma_token: Address,
    ) {
        admin.require_auth();

        let already_init: bool = env
            .storage()
            .instance()
            .get(&DataKey::Initialized)
            .unwrap_or(false);

        if already_init {
            panic!("already initialized");
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::IronToken, &iron_token);
        env.storage().instance().set(&DataKey::EnergyToken, &energy_token);
        env.storage().instance().set(&DataKey::PlasmaToken, &plasma_token);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// Mint resources to a player. Only callable by the admin.
    pub fn mint(env: Env, to: Address, resource: ResourceType, amount: i128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");

        admin.require_auth();

        let token_addr = Self::token_addr(&env, &resource);
        let client = token::StellarAssetClient::new(&env, &token_addr);
        client.mint(&to, &amount);

        env.events()
            .publish((symbol_short!("minted"), to), (resource, amount));
    }

    /// Registers the galaxy-map contract `mine` reads ownership and yield from. Admin only.
    pub fn set_galaxy_map(env: Env, caller: Address, galaxy_map: Address) {
        caller.require_auth();
        verify_caller_is_admin(&env, &caller);
        env.storage().instance().set(&DataKey::GalaxyMap, &galaxy_map);
    }

    /// Pays the owner of `system_id` its yield for every full period since it
    /// was last mined, or since they acquired it, whichever is later. Needs
    /// only the player's signature, provided this contract administers the
    /// asset contracts. Returns the amount minted.
    pub fn mine(env: Env, player: Address, system_id: u32) -> i128 {
        player.require_auth();

        let system = fetch_galaxy_map_client(&env).get_system(&system_id);
        verify_player_owns_system(&system, &player);

        let now = env.ledger().timestamp();
        let start = mining_start(&env, system_id, system.last_claimed);
        let periods = now.saturating_sub(start) / MINING_PERIOD_SECONDS;
        if periods == 0 {
            panic!("nothing to mine yet");
        }

        let amount = periods as i128 * system.resource_yield as i128;
        let token_addr = Self::token_addr(&env, &system.resource_type);
        token::StellarAssetClient::new(&env, &token_addr).mint(&player, &amount);

        // Advance by whole periods only, so a partial period carries over.
        env.storage()
            .persistent()
            .set(&DataKey::LastMined(system_id), &(start + periods * MINING_PERIOD_SECONDS));

        env.events().publish(
            (symbol_short!("mined"), player),
            (system_id, system.resource_type, amount),
        );
        amount
    }

    /// Burn resources from a player.
    pub fn burn(env: Env, from: Address, resource: ResourceType, amount: i128) {
        from.require_auth();

        let token_addr = Self::token_addr(&env, &resource);
        let client = token::TokenClient::new(&env, &token_addr);
        client.burn(&from, &amount);

        env.events()
            .publish((symbol_short!("burned"), from), (resource, amount));
    }

    /// Get a player's resource balance.
    pub fn balance(env: Env, player: Address, resource: ResourceType) -> i128 {
        let token_addr = Self::token_addr(&env, &resource);
        let client = token::TokenClient::new(&env, &token_addr);
        client.balance(&player)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn token_addr(env: &Env, resource: &ResourceType) -> Address {
        match resource {
            ResourceType::Iron => env
                .storage()
                .instance()
                .get(&DataKey::IronToken)
                .expect("not initialized"),
            ResourceType::Energy => env
                .storage()
                .instance()
                .get(&DataKey::EnergyToken)
                .expect("not initialized"),
            ResourceType::Plasma => env
                .storage()
                .instance()
                .get(&DataKey::PlasmaToken)
                .expect("not initialized"),
        }
    }
}

// ── Mining helpers ────────────────────────────────────────────────────────────

fn verify_caller_is_admin(env: &Env, caller: &Address) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("not initialized");
    if *caller != admin {
        panic!("caller is not the admin");
    }
}

fn fetch_galaxy_map_client(env: &Env) -> GalaxyMapClient<'_> {
    let addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::GalaxyMap)
        .expect("galaxy map not set");
    GalaxyMapClient::new(env, &addr)
}

fn verify_player_owns_system(system: &StarSystem, player: &Address) {
    if system.owner.as_ref() != Some(player) {
        panic!("player does not own this system");
    }
}

/// Yield accrues from the later of the last mine and when the current owner
/// acquired the system, so a new owner can't collect a previous owner's yield.
fn mining_start(env: &Env, system_id: u32, acquired_at: u64) -> u64 {
    let last_mined: u64 = env
        .storage()
        .persistent()
        .get(&DataKey::LastMined(system_id))
        .unwrap_or(0);
    last_mined.max(acquired_at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events};
    use soroban_sdk::{Env, IntoVal};

    struct Fixture<'a> {
        client: ResourcesContractClient<'a>,
        admin: Address,
    }

    fn setup_resources(env: &Env) -> Fixture<'_> {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let iron = env.register_stellar_asset_contract_v2(admin.clone());
        let energy = env.register_stellar_asset_contract_v2(admin.clone());
        let plasma = env.register_stellar_asset_contract_v2(admin.clone());

        let contract_id = env.register(ResourcesContract, ());
        let client = ResourcesContractClient::new(env, &contract_id);
        client.initialize(&admin, &iron.address(), &energy.address(), &plasma.address());

        Fixture { client, admin }
    }

    #[test]
    fn balance_is_zero_for_new_player() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);

        assert_eq!(fx.client.balance(&player, &ResourceType::Iron), 0);
    }

    #[test]
    fn mint_increases_balance_of_that_resource() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);

        fx.client.mint(&player, &ResourceType::Iron, &100);

        assert_eq!(fx.client.balance(&player, &ResourceType::Iron), 100);
    }

    #[test]
    fn mint_does_not_change_other_resource_balances() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);

        fx.client.mint(&player, &ResourceType::Iron, &100);

        assert_eq!(fx.client.balance(&player, &ResourceType::Energy), 0);
        assert_eq!(fx.client.balance(&player, &ResourceType::Plasma), 0);
    }

    #[test]
    fn each_resource_is_backed_by_its_own_token() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);

        fx.client.mint(&player, &ResourceType::Iron, &1);
        fx.client.mint(&player, &ResourceType::Energy, &20);
        fx.client.mint(&player, &ResourceType::Plasma, &300);

        assert_eq!(fx.client.balance(&player, &ResourceType::Iron), 1);
        assert_eq!(fx.client.balance(&player, &ResourceType::Energy), 20);
        assert_eq!(fx.client.balance(&player, &ResourceType::Plasma), 300);
    }

    #[test]
    fn mint_accumulates_across_calls() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);

        fx.client.mint(&player, &ResourceType::Plasma, &40);
        fx.client.mint(&player, &ResourceType::Plasma, &2);

        assert_eq!(fx.client.balance(&player, &ResourceType::Plasma), 42);
    }

    #[test]
    fn mint_requires_admin_authorization() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);

        fx.client.mint(&player, &ResourceType::Iron, &1);

        let (authorizer, _) = env.auths().into_iter().next().unwrap();
        assert_eq!(authorizer, fx.admin);
    }

    #[test]
    fn mint_emits_minted_event() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);

        fx.client.mint(&player, &ResourceType::Energy, &7);

        let (contract, topics, data) = env
            .events()
            .all()
            .into_iter()
            .filter(|(c, _, _)| *c == fx.client.address)
            .last()
            .unwrap();
        assert_eq!(contract, fx.client.address);
        assert_eq!(topics, (symbol_short!("minted"), player).into_val(&env));
        let payload: (ResourceType, i128) = data.into_val(&env);
        assert_eq!(payload, (ResourceType::Energy, 7));
    }

    #[test]
    fn burn_decreases_balance() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);
        fx.client.mint(&player, &ResourceType::Iron, &100);

        fx.client.burn(&player, &ResourceType::Iron, &30);

        assert_eq!(fx.client.balance(&player, &ResourceType::Iron), 70);
    }

    #[test]
    #[should_panic]
    fn burn_panics_when_balance_is_insufficient() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);
        fx.client.mint(&player, &ResourceType::Iron, &10);

        fx.client.burn(&player, &ResourceType::Iron, &11);
    }

    #[test]
    fn burn_emits_burned_event() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);
        fx.client.mint(&player, &ResourceType::Iron, &10);

        fx.client.burn(&player, &ResourceType::Iron, &4);

        let (contract, topics, data) = env
            .events()
            .all()
            .into_iter()
            .filter(|(c, _, _)| *c == fx.client.address)
            .last()
            .unwrap();
        assert_eq!(contract, fx.client.address);
        assert_eq!(topics, (symbol_short!("burned"), player).into_val(&env));
        let payload: (ResourceType, i128) = data.into_val(&env);
        assert_eq!(payload, (ResourceType::Iron, 4));
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn initialize_panics_when_called_twice() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let token = Address::generate(&env);

        fx.client.initialize(&fx.admin, &token, &token, &token);
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn mint_panics_before_initialization() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ResourcesContract, ());
        let client = ResourcesContractClient::new(&env, &contract_id);
        let player = Address::generate(&env);

        client.mint(&player, &ResourceType::Iron, &1);
    }

    // ── mining ────────────────────────────────────────────────────────────────

    use soroban_sdk::testutils::{Ledger as _, MockAuth, MockAuthInvoke};
    use soroban_sdk::{contract, contractimpl};

    /// Stand-in for galaxy-map: one configurable system.
    #[contract]
    struct MockGalaxy;

    #[contractimpl]
    impl MockGalaxy {
        pub fn seed_system(env: Env, owner: Address, resource_type: ResourceType, resource_yield: u32, last_claimed: u64) {
            let system = StarSystem {
                owner: Some(owner),
                coord_x: 0,
                coord_y: 0,
                resource_type,
                resource_yield,
                defense_rating: 5,
                last_claimed,
            };
            env.storage().instance().set(&symbol_short!("system"), &system);
        }

        pub fn get_system(env: Env, _system_id: u32) -> StarSystem {
            env.storage().instance().get(&symbol_short!("system")).unwrap()
        }
    }

    struct MiningFixture<'a> {
        client: ResourcesContractClient<'a>,
        galaxy: MockGalaxyClient<'a>,
        admin: Address,
    }

    /// The production setup mining requires: the resources contract, not the
    /// deployer, administers the three asset contracts, so it can mint on a
    /// player's behalf without anyone else signing.
    fn setup_mining(env: &Env) -> MiningFixture<'_> {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let contract_id = env.register(ResourcesContract, ());
        let iron = env.register_stellar_asset_contract_v2(contract_id.clone());
        let energy = env.register_stellar_asset_contract_v2(contract_id.clone());
        let plasma = env.register_stellar_asset_contract_v2(contract_id.clone());
        let client = ResourcesContractClient::new(env, &contract_id);
        client.initialize(&admin, &iron.address(), &energy.address(), &plasma.address());

        let galaxy_id = env.register(MockGalaxy, ());
        client.set_galaxy_map(&admin, &galaxy_id);

        MiningFixture { client, galaxy: MockGalaxyClient::new(env, &galaxy_id), admin }
    }

    const YIELD: u32 = 25;

    fn owned_system(env: &Env, fx: &MiningFixture<'_>, resource: ResourceType, acquired_at: u64) -> Address {
        let player = Address::generate(env);
        fx.galaxy.seed_system(&player, &resource, &YIELD, &acquired_at);
        player
    }

    #[test]
    fn mine_pays_one_periods_yield_after_one_period() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let player = owned_system(&env, &fx, ResourceType::Iron, 1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);

        let amount = fx.client.mine(&player, &3);

        assert_eq!(amount, YIELD as i128);
        assert_eq!(fx.client.balance(&player, &ResourceType::Iron), YIELD as i128);
    }

    #[test]
    fn mine_pays_every_full_period_elapsed() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let player = owned_system(&env, &fx, ResourceType::Iron, 1_000);
        env.ledger().set_timestamp(1_000 + 3 * MINING_PERIOD_SECONDS + 100);

        assert_eq!(fx.client.mine(&player, &3), 3 * YIELD as i128);
    }

    #[test]
    fn mine_carries_over_a_partial_period_instead_of_losing_it() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let player = owned_system(&env, &fx, ResourceType::Iron, 1_000);
        env.ledger().set_timestamp(1_000 + 3 * MINING_PERIOD_SECONDS + 100);
        fx.client.mine(&player, &3);

        // 100s were left over; one more full period completes at 4 periods in.
        env.ledger().set_timestamp(1_000 + 4 * MINING_PERIOD_SECONDS);
        assert_eq!(fx.client.mine(&player, &3), YIELD as i128);
    }

    #[test]
    #[should_panic(expected = "nothing to mine yet")]
    fn mine_cannot_claim_the_same_period_twice() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let player = owned_system(&env, &fx, ResourceType::Iron, 1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);
        fx.client.mine(&player, &3);

        fx.client.mine(&player, &3);
    }

    #[test]
    #[should_panic(expected = "nothing to mine yet")]
    fn mine_pays_nothing_before_a_full_period() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let player = owned_system(&env, &fx, ResourceType::Iron, 1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS - 1);

        fx.client.mine(&player, &3);
    }

    #[test]
    #[should_panic(expected = "player does not own this system")]
    fn mine_panics_for_a_system_the_player_does_not_own() {
        let env = Env::default();
        let fx = setup_mining(&env);
        owned_system(&env, &fx, ResourceType::Iron, 1_000);
        let stranger = Address::generate(&env);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);

        fx.client.mine(&stranger, &3);
    }

    #[test]
    fn mine_pays_in_the_systems_own_resource() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let player = owned_system(&env, &fx, ResourceType::Energy, 1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);

        fx.client.mine(&player, &3);

        assert_eq!(fx.client.balance(&player, &ResourceType::Energy), YIELD as i128);
        assert_eq!(fx.client.balance(&player, &ResourceType::Iron), 0);
    }

    #[test]
    fn a_new_owner_mines_only_from_when_they_acquired_the_system() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let first = owned_system(&env, &fx, ResourceType::Iron, 1_000);
        env.ledger().set_timestamp(1_000 + 2 * MINING_PERIOD_SECONDS);
        fx.client.mine(&first, &3);

        // Conquered much later: galaxy-map resets last_claimed to the conquest time.
        let conquered_at = 1_000 + 20 * MINING_PERIOD_SECONDS;
        let second = Address::generate(&env);
        fx.galaxy.seed_system(&second, &ResourceType::Iron, &YIELD, &conquered_at);
        env.ledger().set_timestamp(conquered_at + MINING_PERIOD_SECONDS);

        assert_eq!(fx.client.mine(&second, &3), YIELD as i128);
    }

    #[test]
    fn mine_needs_only_the_players_signature() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let player = owned_system(&env, &fx, ResourceType::Iron, 1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);

        env.mock_auths(&[MockAuth {
            address: &player,
            invoke: &MockAuthInvoke {
                contract: &fx.client.address,
                fn_name: "mine",
                args: (player.clone(), 3u32).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        assert_eq!(fx.client.mine(&player, &3), YIELD as i128);
    }

    #[test]
    #[should_panic(expected = "Error(Auth, InvalidAction)")]
    fn mining_fails_if_the_deployer_still_administers_the_asset_contracts() {
        // Documents the deployment requirement: with the original setup, where
        // the deployer account is each asset's admin, a player alone can't mine.
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let iron = env.register_stellar_asset_contract_v2(admin.clone());
        let energy = env.register_stellar_asset_contract_v2(admin.clone());
        let plasma = env.register_stellar_asset_contract_v2(admin.clone());
        let contract_id = env.register(ResourcesContract, ());
        let client = ResourcesContractClient::new(&env, &contract_id);
        client.initialize(&admin, &iron.address(), &energy.address(), &plasma.address());
        let galaxy_id = env.register(MockGalaxy, ());
        client.set_galaxy_map(&admin, &galaxy_id);
        let player = Address::generate(&env);
        MockGalaxyClient::new(&env, &galaxy_id).seed_system(&player, &ResourceType::Iron, &YIELD, &1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);

        env.mock_auths(&[MockAuth {
            address: &player,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "mine",
                args: (player.clone(), 3u32).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        client.mine(&player, &3);
    }

    #[test]
    fn mine_emits_mined_event() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let player = owned_system(&env, &fx, ResourceType::Plasma, 1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);

        fx.client.mine(&player, &3);

        let (_, topics, data) = env
            .events()
            .all()
            .into_iter()
            .filter(|(c, _, _)| *c == fx.client.address)
            .last()
            .unwrap();
        assert_eq!(topics, (symbol_short!("mined"), player).into_val(&env));
        let payload: (u32, ResourceType, i128) = data.into_val(&env);
        assert_eq!(payload, (3, ResourceType::Plasma, YIELD as i128));
    }

    #[test]
    #[should_panic(expected = "caller is not the admin")]
    fn set_galaxy_map_panics_for_non_admin_caller() {
        let env = Env::default();
        let fx = setup_mining(&env);
        let stranger = Address::generate(&env);

        fx.client.set_galaxy_map(&stranger, &stranger);
    }

    #[test]
    #[should_panic(expected = "galaxy map not set")]
    fn mine_panics_before_a_galaxy_map_is_registered() {
        let env = Env::default();
        let fx = setup_resources(&env);
        let player = Address::generate(&env);

        fx.client.mine(&player, &3);
    }

    #[test]
    fn set_galaxy_map_requires_admin_authorization() {
        let env = Env::default();
        let fx = setup_mining(&env);
        fx.client.set_galaxy_map(&fx.admin, &fx.galaxy.address);

        let (authorizer, _) = env.auths().into_iter().last().unwrap();
        assert_eq!(authorizer, fx.admin);
    }

    // ── resource_yield = 0 (#71) ──────────────────────────────────────────────

    /// Issue #71: when a system has resource_yield = 0, mine() should mint 0
    /// tokens (periods * 0 = 0) but still advance last_mined so the clock
    /// moves forward. Calling mine again immediately after should panic with
    /// "nothing to mine yet", confirming last_mined was updated.
    #[test]
    fn mine_mints_zero_and_advances_last_mined_when_yield_is_zero() {
        let env = Env::default();
        let fx = setup_mining(&env);
        env.mock_all_auths();

        let player = Address::generate(&env);
        // Seed a system with resource_yield = 0 — not reachable via normal
        // initialize (which always assigns 10–50), but plausible after a future
        // contract upgrade or a direct storage write during an attack scenario.
        fx.galaxy.seed_system(&player, &ResourceType::Iron, &0u32, &1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);

        let amount = fx.client.mine(&player, &3);

        // amount = periods * resource_yield = 1 * 0 = 0
        assert_eq!(amount, 0);
        // Balance stays at zero — nothing was minted.
        assert_eq!(fx.client.balance(&player, &ResourceType::Iron), 0);
    }

    #[test]
    #[should_panic(expected = "nothing to mine yet")]
    fn mine_advances_last_mined_even_when_yield_is_zero() {
        // Confirm that last_mined was advanced: a second mine immediately after
        // the first must see periods = 0 and panic, not pay out again.
        let env = Env::default();
        let fx = setup_mining(&env);
        env.mock_all_auths();

        let player = Address::generate(&env);
        fx.galaxy.seed_system(&player, &ResourceType::Iron, &0u32, &1_000);
        env.ledger().set_timestamp(1_000 + MINING_PERIOD_SECONDS);
        fx.client.mine(&player, &3); // first mine — mints 0 but advances clock

        // Timestamp has not advanced past another full period, so this must panic.
        fx.client.mine(&player, &3);
    }
}
