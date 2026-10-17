#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, contracttype, symbol_short, Address, Env};

// ── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    ResourcesContract,
    GalaxyMapContract,
    BattleContract,
    Fleet(Address),
    Deployed(Address),
    Initialized,
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum UnitType {
    Scout,
    Fighter,
    Cruiser,
    Dreadnought,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Fleet {
    pub scouts: u32,
    pub fighters: u32,
    pub cruisers: u32,
    pub dreadnoughts: u32,
    pub location: u32,
    pub last_moved: u64,
}

/// Mirrors the resources contract's enum so it encodes identically over the wire.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ResourceType {
    Iron,
    Energy,
    Plasma,
}

/// The slice of the resources contract this contract depends on.
#[contractclient(name = "ResourcesClient")]
pub trait ResourcesInterface {
    fn burn(env: Env, from: Address, resource: ResourceType, amount: i128);
}

/// Mirrors galaxy_map::StarSystem field-for-field. Only `owner` is read here,
/// but the whole struct is decoded so the encoding matches the galaxy-map
/// contract exactly.
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
    fn get_grid_size(env: Env) -> u32;
    fn get_system(env: Env, system_id: u32) -> StarSystem;
}

/// Minimum seconds between two fleet moves.
pub const MOVE_COOLDOWN_SECONDS: u64 = 60;

/// Resource cost, denominated in whole units of each resource token.
#[derive(Clone, Debug, PartialEq)]
pub struct UnitCost {
    pub iron: i128,
    pub energy: i128,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FleetContract;

#[contractimpl]
impl FleetContract {
    /// Initialize with the resources and galaxy-map contract addresses. Must be called once.
    pub fn initialize(
        env: Env,
        admin: Address,
        resources_contract: Address,
        galaxy_map_contract: Address,
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
        env.storage()
            .instance()
            .set(&DataKey::ResourcesContract, &resources_contract);
        env.storage()
            .instance()
            .set(&DataKey::GalaxyMapContract, &galaxy_map_contract);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// Build `count` units of `unit_type`, paying their cost in resources.
    pub fn build_unit(env: Env, player: Address, unit_type: UnitType, count: u32) {
        player.require_auth();
        verify_count_is_positive(count);

        burn_build_cost(&env, &player, &total_build_cost(&unit_type, count));

        let mut fleet = get_stored_fleet(&env, &player);
        add_units_to_fleet(&mut fleet, &unit_type, count);
        save_fleet(&env, &player, &fleet);

        env.events()
            .publish((symbol_short!("built"), player), (unit_type, count));
    }

    /// Give a fleet its first location, at a system the player owns. Works
    /// once per player; after that the fleet moves with `move_fleet`.
    pub fn deploy_fleet(env: Env, player: Address, system_id: u32) {
        player.require_auth();
        verify_fleet_is_not_deployed(&env, &player);

        let system = fetch_system(&env, system_id);
        verify_player_owns_system(&system.owner, &player);

        let mut fleet = get_stored_fleet(&env, &player);
        fleet.location = system_id;
        fleet.last_moved = env.ledger().timestamp();
        save_fleet(&env, &player, &fleet);
        set_fleet_deployed(&env, &player);

        env.events()
            .publish((symbol_short!("deployed"), player), system_id);
    }

    /// Move your fleet to an adjacent system, at most once per cooldown period.
    pub fn move_fleet(env: Env, player: Address, target_system_id: u32) {
        player.require_auth();

        let mut fleet = get_stored_fleet(&env, &player);
        verify_fleet_is_not_empty(&fleet);
        verify_fleet_is_deployed(&env, &player);
        verify_cooldown_has_elapsed(&fleet, env.ledger().timestamp());

        let grid_size = fetch_grid_size(&env);
        verify_system_is_in_grid(grid_size, target_system_id);
        verify_systems_are_adjacent(grid_size, fleet.location, target_system_id);

        let from = fleet.location;
        fleet.location = target_system_id;
        fleet.last_moved = env.ledger().timestamp();
        save_fleet(&env, &player, &fleet);

        env.events()
            .publish((symbol_short!("moved"), player), (from, target_system_id));
    }

    /// Registers the battle contract allowed to call `apply_battle_losses`. Admin only.
    pub fn set_battle_contract(env: Env, caller: Address, battle_contract: Address) {
        caller.require_auth();
        verify_caller_is_admin(&env, &caller);

        env.storage()
            .instance()
            .set(&DataKey::BattleContract, &battle_contract);
    }

    /// Reduces a player's fleet by the given per-unit losses, clamped at zero.
    /// Callable only by the registered battle contract.
    pub fn apply_battle_losses(env: Env, caller: Address, player: Address, losses: Fleet) {
        caller.require_auth();
        verify_caller_is_battle_contract(&env, &caller);

        let mut fleet = get_stored_fleet(&env, &player);
        fleet.scouts = fleet.scouts.saturating_sub(losses.scouts);
        fleet.fighters = fleet.fighters.saturating_sub(losses.fighters);
        fleet.cruisers = fleet.cruisers.saturating_sub(losses.cruisers);
        fleet.dreadnoughts = fleet.dreadnoughts.saturating_sub(losses.dreadnoughts);
        save_fleet(&env, &player, &fleet);

        env.events()
            .publish((symbol_short!("losses"), player), losses);
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// Returns a player's total attack power (0 for a player with no fleet).
    pub fn get_fleet_attack(env: Env, player: Address) -> u32 {
        calculate_fleet_attack(&get_stored_fleet(&env, &player))
    }

    /// Returns a player's total defense power (0 for a player with no fleet).
    pub fn get_fleet_defense(env: Env, player: Address) -> u32 {
        calculate_fleet_defense(&get_stored_fleet(&env, &player))
    }

    /// Returns a player's fleet, or an empty fleet if they have none.
    pub fn get_fleet(env: Env, player: Address) -> Fleet {
        get_stored_fleet(&env, &player)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Returns the fleet's total attack power (sum of each unit's attack stat).
pub fn calculate_fleet_attack(fleet: &Fleet) -> u32 {
    fleet.scouts * 2 + fleet.fighters * 5 + fleet.cruisers * 12 + fleet.dreadnoughts * 30
}

/// Returns the fleet's total defense power (sum of each unit's defense stat).
pub fn calculate_fleet_defense(fleet: &Fleet) -> u32 {
    fleet.scouts * 1 + fleet.fighters * 3 + fleet.cruisers * 8 + fleet.dreadnoughts * 20
}

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

fn verify_caller_is_battle_contract(env: &Env, caller: &Address) {
    let battle_contract: Address = env
        .storage()
        .instance()
        .get(&DataKey::BattleContract)
        .expect("battle contract not set");
    if *caller != battle_contract {
        panic!("caller is not the registered battle contract");
    }
}

fn is_fleet_empty(fleet: &Fleet) -> bool {
    fleet.scouts == 0 && fleet.fighters == 0 && fleet.cruisers == 0 && fleet.dreadnoughts == 0
}

fn verify_fleet_is_not_empty(fleet: &Fleet) {
    if is_fleet_empty(fleet) {
        panic!("fleet is empty");
    }
}

fn verify_cooldown_has_elapsed(fleet: &Fleet, now: u64) {
    if now < fleet.last_moved + MOVE_COOLDOWN_SECONDS {
        panic!("fleet is on cooldown");
    }
}

fn verify_system_is_in_grid(grid_size: u32, system_id: u32) {
    if system_id >= grid_size * grid_size {
        panic!("target system is outside the galaxy");
    }
}

fn verify_systems_are_adjacent(grid_size: u32, from: u32, to: u32) {
    if !are_systems_adjacent(grid_size, from, to) {
        panic!("target system is not adjacent");
    }
}

/// Systems are adjacent when they share an edge on the grid (no diagonals).
fn are_systems_adjacent(grid_size: u32, a: u32, b: u32) -> bool {
    let (ax, ay) = (a % grid_size, a / grid_size);
    let (bx, by) = (b % grid_size, b / grid_size);
    ax.abs_diff(bx) + ay.abs_diff(by) == 1
}

fn fetch_grid_size(env: &Env) -> u32 {
    let galaxy_addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::GalaxyMapContract)
        .expect("not initialized");
    GalaxyMapClient::new(env, &galaxy_addr).get_grid_size()
}

fn fetch_system(env: &Env, system_id: u32) -> StarSystem {
    let galaxy_addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::GalaxyMapContract)
        .expect("not initialized");
    GalaxyMapClient::new(env, &galaxy_addr).get_system(&system_id)
}

fn verify_player_owns_system(owner: &Option<Address>, player: &Address) {
    if owner.as_ref() != Some(player) {
        panic!("player does not own this system");
    }
}

/// A fleet is "deployed" once it has been given a real location. Tracked
/// separately from `location` so system 0 is not mistaken for "unset".
fn is_fleet_deployed(env: &Env, player: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Deployed(player.clone()))
        .unwrap_or(false)
}

fn set_fleet_deployed(env: &Env, player: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::Deployed(player.clone()), &true);
}

fn verify_fleet_is_not_deployed(env: &Env, player: &Address) {
    if is_fleet_deployed(env, player) {
        panic!("fleet already deployed");
    }
}

fn verify_fleet_is_deployed(env: &Env, player: &Address) {
    if !is_fleet_deployed(env, player) {
        panic!("fleet is not deployed");
    }
}

fn verify_count_is_positive(count: u32) {
    if count == 0 {
        panic!("count must be positive");
    }
}

fn get_stored_fleet(env: &Env, player: &Address) -> Fleet {
    env.storage()
        .persistent()
        .get(&DataKey::Fleet(player.clone()))
        .unwrap_or(empty_fleet())
}

fn save_fleet(env: &Env, player: &Address, fleet: &Fleet) {
    env.storage()
        .persistent()
        .set(&DataKey::Fleet(player.clone()), fleet);
}

fn add_units_to_fleet(fleet: &mut Fleet, unit: &UnitType, count: u32) {
    match unit {
        UnitType::Scout => fleet.scouts += count,
        UnitType::Fighter => fleet.fighters += count,
        UnitType::Cruiser => fleet.cruisers += count,
        UnitType::Dreadnought => fleet.dreadnoughts += count,
    }
}

/// Burns the iron then energy cost from the player via the resources contract.
fn burn_build_cost(env: &Env, player: &Address, cost: &UnitCost) {
    let resources_addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::ResourcesContract)
        .expect("not initialized");
    let resources = ResourcesClient::new(env, &resources_addr);

    resources.burn(player, &ResourceType::Iron, &cost.iron);
    resources.burn(player, &ResourceType::Energy, &cost.energy);
}

/// Cost of building a single unit of the given type.
fn unit_cost(unit: &UnitType) -> UnitCost {
    match unit {
        UnitType::Scout => UnitCost { iron: 10, energy: 5 },
        UnitType::Fighter => UnitCost { iron: 25, energy: 15 },
        UnitType::Cruiser => UnitCost { iron: 60, energy: 40 },
        UnitType::Dreadnought => UnitCost { iron: 150, energy: 100 },
    }
}

/// Cost of building `count` units of the given type.
fn total_build_cost(unit: &UnitType, count: u32) -> UnitCost {
    let single = unit_cost(unit);
    UnitCost {
        iron: single.iron * count as i128,
        energy: single.energy * count as i128,
    }
}

fn empty_fleet() -> Fleet {
    Fleet {
        scouts: 0,
        fighters: 0,
        cruisers: 0,
        dreadnoughts: 0,
        location: 0,
        last_moved: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger as _};
    use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, IntoVal, Vec};

    /// Stand-in for a trusted battle contract, used to prove the caller-
    /// restriction on `apply_battle_losses` behaves as intended.
    #[contract]
    struct MockBattle;

    #[contractimpl]
    impl MockBattle {
        /// Calls back into the real fleet contract as *this* contract's own
        /// address, the way the real battle contract will.
        pub fn trigger_losses(env: Env, fleet_contract: Address, player: Address, losses: Fleet) {
            FleetContractClient::new(&env, &fleet_contract).apply_battle_losses(
                &env.current_contract_address(),
                &player,
                &losses,
            );
        }
    }

    /// Stand-in for the resources contract that records every burn it receives.
    #[contract]
    struct MockResources;

    #[contractimpl]
    impl MockResources {
        pub fn burn(env: Env, from: Address, resource: ResourceType, amount: i128) {
            from.require_auth();
            let mut burns: Vec<(Address, ResourceType, i128)> = env
                .storage()
                .instance()
                .get(&symbol_short!("burns"))
                .unwrap_or(Vec::new(&env));
            burns.push_back((from, resource, amount));
            env.storage().instance().set(&symbol_short!("burns"), &burns);
        }

        pub fn burns(env: Env) -> Vec<(Address, ResourceType, i128)> {
            env.storage()
                .instance()
                .get(&symbol_short!("burns"))
                .unwrap_or(Vec::new(&env))
        }
    }

    /// Stand-in for the galaxy-map contract: a fixed 4x4 grid whose systems can
    /// be seeded with an owner, so `deploy_fleet` can read ownership.
    #[contract]
    struct MockGalaxy;

    #[contractimpl]
    impl MockGalaxy {
        pub fn get_grid_size(_env: Env) -> u32 {
            4
        }

        pub fn seed_system(env: Env, system_id: u32, owner: Address) {
            env.storage().persistent().set(&system_id, &owner);
        }

        pub fn get_system(env: Env, system_id: u32) -> StarSystem {
            let owner: Address = env
                .storage()
                .persistent()
                .get(&system_id)
                .expect("system not found");
            StarSystem {
                owner: Some(owner),
                coord_x: 0,
                coord_y: 0,
                resource_type: ResourceType::Iron,
                resource_yield: 0,
                defense_rating: 0,
                last_claimed: 0,
            }
        }
    }

    struct Fixture<'a> {
        client: FleetContractClient<'a>,
        resources: MockResourcesClient<'a>,
        galaxy: MockGalaxyClient<'a>,
        admin: Address,
    }

    fn setup_fleet(env: &Env) -> Fixture<'_> {
        env.mock_all_auths();
        let resources_id = env.register(MockResources, ());
        let galaxy_id = env.register(MockGalaxy, ());
        let contract_id = env.register(FleetContract, ());
        let client = FleetContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin, &resources_id, &galaxy_id);
        Fixture {
            client,
            resources: MockResourcesClient::new(env, &resources_id),
            galaxy: MockGalaxyClient::new(env, &galaxy_id),
            admin,
        }
    }

    /// Registers a mock battle contract on an already-initialized fixture and
    /// returns a client for it.
    fn register_battle_contract<'a>(env: &'a Env, fx: &Fixture<'a>) -> MockBattleClient<'a> {
        let battle_id = env.register(MockBattle, ());
        fx.client.set_battle_contract(&fx.admin, &battle_id);
        MockBattleClient::new(env, &battle_id)
    }

    #[test]
    fn get_fleet_returns_empty_fleet_for_new_player() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        let fleet = fx.client.get_fleet(&player);

        assert_eq!(
            fleet,
            Fleet { scouts: 0, fighters: 0, cruisers: 0, dreadnoughts: 0, location: 0, last_moved: 0 }
        );
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn initialize_panics_when_called_twice() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let admin = Address::generate(&env);

        fx.client.initialize(&admin, &fx.resources.address, &fx.resources.address);
    }

    #[test]
    fn unit_cost_matches_the_game_mechanics_table() {
        assert_eq!(unit_cost(&UnitType::Scout), UnitCost { iron: 10, energy: 5 });
        assert_eq!(unit_cost(&UnitType::Fighter), UnitCost { iron: 25, energy: 15 });
        assert_eq!(unit_cost(&UnitType::Cruiser), UnitCost { iron: 60, energy: 40 });
        assert_eq!(unit_cost(&UnitType::Dreadnought), UnitCost { iron: 150, energy: 100 });
    }

    #[test]
    fn total_build_cost_multiplies_unit_cost_by_count() {
        assert_eq!(
            total_build_cost(&UnitType::Fighter, 4),
            UnitCost { iron: 100, energy: 60 }
        );
    }

    #[test]
    fn build_unit_adds_units_to_the_players_fleet() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        fx.client.build_unit(&player, &UnitType::Scout, &3);

        assert_eq!(fx.client.get_fleet(&player).scouts, 3);
    }

    #[test]
    fn build_unit_increments_the_matching_unit_counter() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        fx.client.build_unit(&player, &UnitType::Scout, &1);
        fx.client.build_unit(&player, &UnitType::Fighter, &2);
        fx.client.build_unit(&player, &UnitType::Cruiser, &3);
        fx.client.build_unit(&player, &UnitType::Dreadnought, &4);

        let fleet = fx.client.get_fleet(&player);
        assert_eq!(
            (fleet.scouts, fleet.fighters, fleet.cruisers, fleet.dreadnoughts),
            (1, 2, 3, 4)
        );
    }

    #[test]
    fn build_unit_accumulates_across_calls() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        fx.client.build_unit(&player, &UnitType::Fighter, &2);
        fx.client.build_unit(&player, &UnitType::Fighter, &5);

        assert_eq!(fx.client.get_fleet(&player).fighters, 7);
    }

    #[test]
    fn build_unit_burns_iron_then_energy_cost_from_the_player() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        fx.client.build_unit(&player, &UnitType::Fighter, &4);

        assert_eq!(
            fx.resources.burns(),
            soroban_sdk::vec![
                &env,
                (player.clone(), ResourceType::Iron, 100i128),
                (player, ResourceType::Energy, 60i128),
            ]
        );
    }

    #[test]
    fn build_unit_requires_player_authorization() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        fx.client.build_unit(&player, &UnitType::Scout, &1);

        let (authorizer, _) = env.auths().into_iter().next().unwrap();
        assert_eq!(authorizer, player);
    }

    #[test]
    fn build_unit_keeps_players_fleets_separate() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        fx.client.build_unit(&alice, &UnitType::Scout, &2);

        assert_eq!(fx.client.get_fleet(&bob).scouts, 0);
    }

    #[test]
    #[should_panic(expected = "count must be positive")]
    fn build_unit_panics_when_count_is_zero() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        fx.client.build_unit(&player, &UnitType::Scout, &0);
    }

    #[test]
    fn build_unit_emits_built_event() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        fx.client.build_unit(&player, &UnitType::Cruiser, &2);

        let (contract, topics, data) = env
            .events()
            .all()
            .into_iter()
            .filter(|(c, _, _)| *c == fx.client.address)
            .last()
            .unwrap();
        assert_eq!(contract, fx.client.address);
        assert_eq!(topics, (symbol_short!("built"), player).into_val(&env));
        let payload: (UnitType, u32) = data.into_val(&env);
        assert_eq!(payload, (UnitType::Cruiser, 2));
    }

    // ── adjacency ─────────────────────────────────────────────────────────────

    #[test]
    fn systems_next_to_each_other_in_a_row_are_adjacent() {
        assert!(are_systems_adjacent(4, 0, 1));
        assert!(are_systems_adjacent(4, 1, 0));
    }

    #[test]
    fn systems_above_and_below_each_other_are_adjacent() {
        assert!(are_systems_adjacent(4, 0, 4));
        assert!(are_systems_adjacent(4, 4, 0));
    }

    #[test]
    fn diagonal_systems_are_not_adjacent() {
        assert!(!are_systems_adjacent(4, 0, 5));
    }

    #[test]
    fn a_system_is_not_adjacent_to_itself() {
        assert!(!are_systems_adjacent(4, 5, 5));
    }

    #[test]
    fn ids_that_wrap_across_a_row_edge_are_not_adjacent() {
        // 3 is the last column of row 0, 4 is the first column of row 1
        assert!(!are_systems_adjacent(4, 3, 4));
    }

    #[test]
    fn empty_fleet_is_detected() {
        assert!(is_fleet_empty(&empty_fleet()));
        assert!(!is_fleet_empty(&Fleet { dreadnoughts: 1, ..empty_fleet() }));
    }

    // ── deploy_fleet ──────────────────────────────────────────────────────────

    #[test]
    fn deploy_fleet_sets_the_initial_location() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.client.build_unit(&player, &UnitType::Scout, &1);
        fx.galaxy.seed_system(&3, &player);
        env.ledger().set_timestamp(500);

        fx.client.deploy_fleet(&player, &3);

        assert_eq!(fx.client.get_fleet(&player).location, 3);
    }

    #[test]
    fn deploy_fleet_allows_an_empty_fleet() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.galaxy.seed_system(&2, &player);

        fx.client.deploy_fleet(&player, &2);

        assert_eq!(fx.client.get_fleet(&player).location, 2);
    }

    #[test]
    fn deploy_fleet_records_move_timestamp() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.galaxy.seed_system(&1, &player);
        env.ledger().set_timestamp(777);

        fx.client.deploy_fleet(&player, &1);

        assert_eq!(fx.client.get_fleet(&player).last_moved, 777);
    }

    #[test]
    fn deploy_fleet_requires_player_authorization() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.galaxy.seed_system(&1, &player);

        fx.client.deploy_fleet(&player, &1);

        let (authorizer, _) = env.auths().into_iter().next().unwrap();
        assert_eq!(authorizer, player);
    }

    #[test]
    fn deploy_fleet_emits_deployed_event() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.galaxy.seed_system(&2, &player);

        fx.client.deploy_fleet(&player, &2);

        let (contract, topics, data) = env
            .events()
            .all()
            .into_iter()
            .filter(|(c, _, _)| *c == fx.client.address)
            .last()
            .unwrap();
        assert_eq!(contract, fx.client.address);
        assert_eq!(topics, (symbol_short!("deployed"), player).into_val(&env));
        let system_id: u32 = data.into_val(&env);
        assert_eq!(system_id, 2);
    }

    #[test]
    #[should_panic(expected = "player does not own this system")]
    fn deploy_fleet_panics_for_a_system_the_player_does_not_own() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let owner = Address::generate(&env);
        let stranger = Address::generate(&env);
        fx.galaxy.seed_system(&3, &owner);

        fx.client.deploy_fleet(&stranger, &3);
    }

    #[test]
    #[should_panic(expected = "fleet already deployed")]
    fn deploy_fleet_cannot_be_called_twice() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.galaxy.seed_system(&1, &player);
        fx.client.deploy_fleet(&player, &1);

        fx.client.deploy_fleet(&player, &2);
    }

    // ── move_fleet ────────────────────────────────────────────────────────────

    fn fleet_with_one_scout(env: &Env, fx: &Fixture<'_>) -> Address {
        let player = Address::generate(env);
        fx.client.build_unit(&player, &UnitType::Scout, &1);
        // Deploy at system 0 while the clock reads 0, then advance so the
        // first move is past cooldown.
        fx.galaxy.seed_system(&0, &player);
        fx.client.deploy_fleet(&player, &0);
        env.ledger().set_timestamp(1_000);
        player
    }

    #[test]
    fn move_fleet_updates_location() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);

        fx.client.move_fleet(&player, &1);

        assert_eq!(fx.client.get_fleet(&player).location, 1);
    }

    #[test]
    fn move_fleet_records_move_timestamp() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);

        fx.client.move_fleet(&player, &1);

        assert_eq!(fx.client.get_fleet(&player).last_moved, 1_000);
    }

    #[test]
    fn move_fleet_requires_player_authorization() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);

        fx.client.move_fleet(&player, &1);

        let (authorizer, _) = env.auths().into_iter().next().unwrap();
        assert_eq!(authorizer, player);
    }

    #[test]
    fn move_fleet_emits_moved_event() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);

        fx.client.move_fleet(&player, &4);

        let (contract, topics, data) = env
            .events()
            .all()
            .into_iter()
            .filter(|(c, _, _)| *c == fx.client.address)
            .last()
            .unwrap();
        assert_eq!(contract, fx.client.address);
        assert_eq!(topics, (symbol_short!("moved"), player).into_val(&env));
        let payload: (u32, u32) = data.into_val(&env);
        assert_eq!(payload, (0, 4));
    }

    #[test]
    #[should_panic(expected = "fleet is empty")]
    fn move_fleet_panics_when_fleet_is_empty() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        env.ledger().set_timestamp(1_000);

        fx.client.move_fleet(&player, &1);
    }

    #[test]
    #[should_panic(expected = "fleet is not deployed")]
    fn move_fleet_panics_when_fleet_is_not_deployed() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.client.build_unit(&player, &UnitType::Scout, &1);
        env.ledger().set_timestamp(1_000);

        fx.client.move_fleet(&player, &1);
    }

    #[test]
    #[should_panic(expected = "target system is not adjacent")]
    fn move_fleet_panics_when_target_is_not_adjacent() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);

        fx.client.move_fleet(&player, &5);
    }

    #[test]
    #[should_panic(expected = "target system is outside the galaxy")]
    fn move_fleet_panics_when_target_is_outside_the_grid() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);

        fx.client.move_fleet(&player, &16);
    }

    #[test]
    #[should_panic(expected = "fleet is on cooldown")]
    fn move_fleet_panics_before_cooldown_has_elapsed() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);
        fx.client.move_fleet(&player, &1);

        env.ledger().set_timestamp(1_000 + MOVE_COOLDOWN_SECONDS - 1);
        fx.client.move_fleet(&player, &2);
    }

    #[test]
    fn move_fleet_succeeds_once_cooldown_has_elapsed() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);
        fx.client.move_fleet(&player, &1);

        env.ledger().set_timestamp(1_000 + MOVE_COOLDOWN_SECONDS);
        fx.client.move_fleet(&player, &2);

        assert_eq!(fx.client.get_fleet(&player).location, 2);
    }

    #[test]
    fn move_fleet_keeps_unit_counts() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = fleet_with_one_scout(&env, &fx);

        fx.client.move_fleet(&player, &1);

        assert_eq!(fx.client.get_fleet(&player).scouts, 1);
    }

    // ── fleet power ───────────────────────────────────────────────────────────

    #[test]
    fn get_fleet_attack_returns_calculated_attack_for_the_players_stored_fleet() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.client.build_unit(&player, &UnitType::Fighter, &2);

        assert_eq!(fx.client.get_fleet_attack(&player), 10);
    }

    #[test]
    fn get_fleet_attack_is_zero_for_a_player_with_no_fleet() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        assert_eq!(fx.client.get_fleet_attack(&player), 0);
    }

    #[test]
    fn get_fleet_defense_returns_calculated_defense_for_the_players_stored_fleet() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);
        fx.client.build_unit(&player, &UnitType::Cruiser, &2);

        assert_eq!(fx.client.get_fleet_defense(&player), 16);
    }

    #[test]
    fn calculate_fleet_attack_sums_each_units_attack_stat() {
        let fleet = Fleet { scouts: 1, fighters: 1, cruisers: 1, dreadnoughts: 1, ..empty_fleet() };
        assert_eq!(calculate_fleet_attack(&fleet), 2 + 5 + 12 + 30);
    }

    #[test]
    fn calculate_fleet_attack_is_zero_for_an_empty_fleet() {
        assert_eq!(calculate_fleet_attack(&empty_fleet()), 0);
    }

    #[test]
    fn calculate_fleet_defense_sums_each_units_defense_stat() {
        let fleet = Fleet { scouts: 1, fighters: 1, cruisers: 1, dreadnoughts: 1, ..empty_fleet() };
        assert_eq!(calculate_fleet_defense(&fleet), 1 + 3 + 8 + 20);
    }

    #[test]
    fn calculate_fleet_defense_is_zero_for_an_empty_fleet() {
        assert_eq!(calculate_fleet_defense(&empty_fleet()), 0);
    }

    // ── set_battle_contract ───────────────────────────────────────────────────

    #[test]
    fn set_battle_contract_requires_admin_authorization() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let battle_id = env.register(MockBattle, ());

        fx.client.set_battle_contract(&fx.admin, &battle_id);

        let (authorizer, _) = env.auths().into_iter().last().unwrap();
        assert_eq!(authorizer, fx.admin);
    }

    #[test]
    #[should_panic(expected = "caller is not the admin")]
    fn set_battle_contract_panics_for_non_admin_caller() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let stranger = Address::generate(&env);
        let battle_id = env.register(MockBattle, ());

        fx.client.set_battle_contract(&stranger, &battle_id);
    }

    // ── apply_battle_losses ───────────────────────────────────────────────────

    fn losses(scouts: u32) -> Fleet {
        Fleet { scouts, ..empty_fleet() }
    }

    #[test]
    fn apply_battle_losses_reduces_the_players_fleet() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let battle = register_battle_contract(&env, &fx);
        let player = Address::generate(&env);
        fx.client.build_unit(&player, &UnitType::Scout, &5);

        battle.trigger_losses(&fx.client.address, &player, &losses(2));

        assert_eq!(fx.client.get_fleet(&player).scouts, 3);
    }

    #[test]
    fn apply_battle_losses_clamps_at_zero() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let battle = register_battle_contract(&env, &fx);
        let player = Address::generate(&env);
        fx.client.build_unit(&player, &UnitType::Scout, &2);

        battle.trigger_losses(&fx.client.address, &player, &losses(5));

        assert_eq!(fx.client.get_fleet(&player).scouts, 0);
    }

    #[test]
    fn apply_battle_losses_reduces_each_unit_type_independently() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let battle = register_battle_contract(&env, &fx);
        let player = Address::generate(&env);
        fx.client.build_unit(&player, &UnitType::Scout, &5);
        fx.client.build_unit(&player, &UnitType::Fighter, &5);
        fx.client.build_unit(&player, &UnitType::Cruiser, &5);
        fx.client.build_unit(&player, &UnitType::Dreadnought, &5);

        battle.trigger_losses(
            &fx.client.address,
            &player,
            &Fleet { scouts: 1, fighters: 2, cruisers: 3, dreadnoughts: 4, location: 0, last_moved: 0 },
        );

        let fleet = fx.client.get_fleet(&player);
        assert_eq!(
            (fleet.scouts, fleet.fighters, fleet.cruisers, fleet.dreadnoughts),
            (4, 3, 2, 1)
        );
    }

    #[test]
    fn apply_battle_losses_emits_losses_event() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let battle = register_battle_contract(&env, &fx);
        let player = Address::generate(&env);
        fx.client.build_unit(&player, &UnitType::Scout, &5);

        battle.trigger_losses(&fx.client.address, &player, &losses(2));

        let (contract, topics, data) = env
            .events()
            .all()
            .into_iter()
            .filter(|(c, _, _)| *c == fx.client.address)
            .last()
            .unwrap();
        assert_eq!(contract, fx.client.address);
        assert_eq!(topics, (symbol_short!("losses"), player).into_val(&env));
        let payload: Fleet = data.into_val(&env);
        assert_eq!(payload, losses(2));
    }

    #[test]
    #[should_panic(expected = "battle contract not set")]
    fn apply_battle_losses_panics_when_no_battle_contract_is_registered() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        let player = Address::generate(&env);

        fx.client.apply_battle_losses(&player, &player, &losses(1));
    }

    #[test]
    #[should_panic(expected = "caller is not the registered battle contract")]
    fn apply_battle_losses_panics_for_a_caller_that_is_not_the_registered_battle_contract() {
        let env = Env::default();
        let fx = setup_fleet(&env);
        register_battle_contract(&env, &fx);
        let impostor = env.register(MockBattle, ());
        let impostor_client = MockBattleClient::new(&env, &impostor);
        let player = Address::generate(&env);

        impostor_client.trigger_losses(&fx.client.address, &player, &losses(1));
    }
}
