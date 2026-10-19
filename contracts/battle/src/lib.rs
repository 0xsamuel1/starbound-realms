#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, contracttype, Address, Env, Symbol};

// ── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    GalaxyMapContract,
    FleetContract,
    NextBattleId,
    Battle(u64),
    Initialized,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Mirrors fleet::Fleet field-for-field so it encodes identically over the wire.
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

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BattleResult {
    pub battle_id: u64,
    pub attacker: Address,
    pub defender: Address,
    pub system_id: u32,
    pub winner: Address,
    pub rounds: u32,
}

/// Mirrors galaxy_map::ResourceType field-for-field.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ResourceType {
    Iron,
    Energy,
    Plasma,
}

/// Mirrors galaxy_map::StarSystem field-for-field.
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
    pub upgrade_level: u32,
}

/// The slice of the galaxy-map contract this contract depends on.
#[contractclient(name = "GalaxyMapClient")]
pub trait GalaxyMapInterface {
    fn get_system(env: Env, system_id: u32) -> StarSystem;
    fn transfer_ownership_after_battle(env: Env, caller: Address, system_id: u32, new_owner: Address);
}

/// The slice of the fleet contract this contract depends on.
#[contractclient(name = "FleetClient")]
pub trait FleetInterface {
    fn get_fleet(env: Env, player: Address) -> Fleet;
    fn apply_battle_losses(env: Env, caller: Address, player: Address, losses: Fleet);
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct BattleContract;

#[contractimpl]
impl BattleContract {
    /// Initialize with the galaxy-map and fleet contract addresses. Must be called once.
    pub fn initialize(env: Env, admin: Address, galaxy_map_contract: Address, fleet_contract: Address) {
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
            .set(&DataKey::GalaxyMapContract, &galaxy_map_contract);
        env.storage()
            .instance()
            .set(&DataKey::FleetContract, &fleet_contract);
        env.storage().instance().set(&DataKey::NextBattleId, &0u64);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// Resolves combat between an attacker's fleet and the current owner of
    /// `system_id`, using Soroban `Prng` for each round's rolls.
    pub fn resolve_battle(env: Env, attacker: Address, defender: Address, system_id: u32) -> u64 {
        attacker.require_auth();

        let galaxy_map = fetch_galaxy_map_client(&env);
        let fleet_contract = fetch_fleet_client(&env);

        let system = galaxy_map.get_system(&system_id);
        verify_defender_owns_system(&system, &defender);

        let attacker_initial = fleet_contract.get_fleet(&attacker);
        verify_fleet_is_not_empty(&attacker_initial);
        let defender_initial = fleet_contract.get_fleet(&defender);

        let system_defense = system.defense_rating + system.upgrade_level * 5;
        let (attacker_final, defender_final, rounds) =
            run_combat_rounds(&env, attacker_initial.clone(), defender_initial.clone(), system_defense);

        let attacker_wins = did_attacker_win(&attacker_final, &defender_final, system_defense);
        let winner = if attacker_wins { attacker.clone() } else { defender.clone() };

        apply_losses_if_any(&env, &fleet_contract, &attacker, &attacker_initial, &attacker_final);
        apply_losses_if_any(&env, &fleet_contract, &defender, &defender_initial, &defender_final);

        if attacker_wins {
            galaxy_map.transfer_ownership_after_battle(&env.current_contract_address(), &system_id, &attacker);
        }

        let battle_id = next_battle_id(&env);
        let result = BattleResult {
            battle_id,
            attacker: attacker.clone(),
            defender,
            system_id,
            winner,
            rounds,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Battle(battle_id), &result);

        env.events()
            .publish((Symbol::new(&env, "battle_resolved"), attacker), result);

        battle_id
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// Returns a stored battle result by id, or panics if it doesn't exist.
    pub fn get_battle(env: Env, battle_id: u64) -> BattleResult {
        env.storage()
            .persistent()
            .get(&DataKey::Battle(battle_id))
            .expect("battle not found")
    }
}

// ── Battle setup ──────────────────────────────────────────────────────────────

fn fetch_galaxy_map_client(env: &Env) -> GalaxyMapClient<'_> {
    let addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::GalaxyMapContract)
        .expect("not initialized");
    GalaxyMapClient::new(env, &addr)
}

fn fetch_fleet_client(env: &Env) -> FleetClient<'_> {
    let addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::FleetContract)
        .expect("not initialized");
    FleetClient::new(env, &addr)
}

fn verify_defender_owns_system(system: &StarSystem, defender: &Address) {
    if system.owner.as_ref() != Some(defender) {
        panic!("defender does not own this system");
    }
}

fn verify_fleet_is_not_empty(fleet: &Fleet) {
    if is_fleet_empty(fleet) {
        panic!("fleet is empty");
    }
}

fn is_fleet_empty(fleet: &Fleet) -> bool {
    fleet.scouts == 0 && fleet.fighters == 0 && fleet.cruisers == 0 && fleet.dreadnoughts == 0
}

fn next_battle_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextBattleId)
        .expect("not initialized");
    env.storage()
        .instance()
        .set(&DataKey::NextBattleId, &(id + 1));
    id
}

/// Subtracts final unit counts from initial, per unit type. Losses only ever
/// decrease, so this never underflows.
fn compute_losses(initial: &Fleet, remaining: &Fleet) -> Fleet {
    Fleet {
        scouts: initial.scouts - remaining.scouts,
        fighters: initial.fighters - remaining.fighters,
        cruisers: initial.cruisers - remaining.cruisers,
        dreadnoughts: initial.dreadnoughts - remaining.dreadnoughts,
        location: remaining.location,
        last_moved: remaining.last_moved,
    }
}

fn apply_losses_if_any(env: &Env, fleet_contract: &FleetClient, player: &Address, initial: &Fleet, remaining: &Fleet) {
    let losses = compute_losses(initial, remaining);
    if !is_fleet_empty(&losses) {
        fleet_contract.apply_battle_losses(&env.current_contract_address(), player, &losses);
    }
}

// ── Combat math ───────────────────────────────────────────────────────────────

/// A unit's defense stat doubles as its "toughness" when absorbing damage.
const UNIT_TOUGHNESS: [(u32, u32); 4] = [(0, 1), (1, 3), (2, 8), (3, 20)];

fn unit_count_mut(fleet: &mut Fleet, unit_index: u32) -> &mut u32 {
    match unit_index {
        0 => &mut fleet.scouts,
        1 => &mut fleet.fighters,
        2 => &mut fleet.cruisers,
        _ => &mut fleet.dreadnoughts,
    }
}

/// Removes units starting with the weakest (lowest-toughness) type until the
/// damage pool is exhausted or the fleet is empty.
fn apply_damage_to_fleet(fleet: &mut Fleet, mut damage: u32) {
    for (unit_index, toughness) in UNIT_TOUGHNESS {
        while damage > 0 && *unit_count_mut(fleet, unit_index) > 0 {
            *unit_count_mut(fleet, unit_index) -= 1;
            damage = damage.saturating_sub(toughness);
        }
        if damage == 0 {
            break;
        }
    }
}

/// Ties favor the defender, so the attacker needs a strictly higher roll to win a round.
fn did_attacker_lose_round(attacker_roll: u32, defender_roll: u32) -> bool {
    attacker_roll <= defender_roll
}

/// Rolls a random percentage of `base_power` in the 80–120% range.
fn roll_power(env: &Env, base_power: u32) -> u32 {
    let percent: u64 = env.prng().gen_range(80u64..=120u64);
    (base_power as u64 * percent / 100) as u32
}

const MAX_BATTLE_ROUNDS: u32 = 20;

/// Combat stops once the round cap is hit or either side has no units left.
fn has_combat_ended(rounds: u32, attacker_fleet: &Fleet, defender_fleet: &Fleet) -> bool {
    rounds >= MAX_BATTLE_ROUNDS || is_fleet_empty(attacker_fleet) || is_fleet_empty(defender_fleet)
}

/// Runs combat rounds until one side's fleet is empty or the round cap is hit.
/// Returns each side's final fleet and the number of rounds actually fought.
fn run_combat_rounds(
    env: &Env,
    mut attacker_fleet: Fleet,
    mut defender_fleet: Fleet,
    system_defense_rating: u32,
) -> (Fleet, Fleet, u32) {
    let mut rounds = 0;

    while !has_combat_ended(rounds, &attacker_fleet, &defender_fleet) {
        let attacker_power = calculate_fleet_attack(&attacker_fleet);
        let defender_power = calculate_fleet_defense(&defender_fleet) + system_defense_rating;

        let attacker_roll = roll_power(env, attacker_power);
        let defender_roll = roll_power(env, defender_power);

        if did_attacker_lose_round(attacker_roll, defender_roll) {
            apply_damage_to_fleet(&mut attacker_fleet, defender_roll - attacker_roll);
        } else {
            apply_damage_to_fleet(&mut defender_fleet, attacker_roll - defender_roll);
        }

        rounds += 1;
    }

    (attacker_fleet, defender_fleet, rounds)
}

/// Decides the overall winner once combat has stopped. A fleet reduced to
/// zero units loses outright; otherwise (the round cap was hit with both
/// sides still standing) the higher final power wins, ties favoring the
/// defender.
fn did_attacker_win(attacker_final: &Fleet, defender_final: &Fleet, system_defense_rating: u32) -> bool {
    // A depleted defender fleet is a decisive win regardless of the system's
    // base defense rating — that rating alone must not be able to out-vote
    // an attacker whose opponent has no units left. (An empty attacker fleet
    // needs no equivalent shortcut: its power is always 0, which the tie-
    // favors-defender rule below already treats as a loss.)
    if is_fleet_empty(defender_final) {
        return true;
    }
    let attacker_power = calculate_fleet_attack(attacker_final);
    let defender_power = calculate_fleet_defense(defender_final) + system_defense_rating;
    !did_attacker_lose_round(attacker_power, defender_power)
}

/// Returns the fleet's total attack power (sum of each unit's attack stat).
fn calculate_fleet_attack(fleet: &Fleet) -> u32 {
    fleet.scouts * 2 + fleet.fighters * 5 + fleet.cruisers * 12 + fleet.dreadnoughts * 30
}

/// Returns the fleet's total defense power (sum of each unit's defense stat).
fn calculate_fleet_defense(fleet: &Fleet) -> u32 {
    fleet.scouts + fleet.fighters * 3 + fleet.cruisers * 8 + fleet.dreadnoughts * 20
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events};
    use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, IntoVal, Vec};

    fn empty_fleet_with_location(location: u32) -> Fleet {
        Fleet { scouts: 0, fighters: 0, cruisers: 0, dreadnoughts: 0, location, last_moved: 0 }
    }

    fn setup_battle(env: &Env) -> (BattleContractClient<'_>, Address) {
        env.mock_all_auths();
        let contract_id = env.register(BattleContract, ());
        let client = BattleContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let galaxy_map = Address::generate(env);
        let fleet = Address::generate(env);
        client.initialize(&admin, &galaxy_map, &fleet);
        (client, admin)
    }

    // ── mock dependencies ────────────────────────────────────────────────────────

    /// Stand-in for galaxy-map: one configurable system, records transfers.
    #[contract]
    struct MockGalaxy;

    #[contractimpl]
    impl MockGalaxy {
        pub fn seed_system(env: Env, owner: Address, defense_rating: u32) {
            let system = StarSystem {
                owner: Some(owner),
                coord_x: 0,
                coord_y: 0,
                resource_type: ResourceType::Iron,
                resource_yield: 10,
                defense_rating,
                last_claimed: 0,
            };
            env.storage().instance().set(&symbol_short!("system"), &system);
        }

        pub fn get_system(env: Env, _system_id: u32) -> StarSystem {
            env.storage().instance().get(&symbol_short!("system")).unwrap()
        }

        pub fn transfer_ownership_after_battle(env: Env, caller: Address, _system_id: u32, new_owner: Address) {
            caller.require_auth();
            let mut system: StarSystem = env.storage().instance().get(&symbol_short!("system")).unwrap();
            system.owner = Some(new_owner);
            env.storage().instance().set(&symbol_short!("system"), &system);
        }
    }

    /// Stand-in for fleet: fleets keyed by player, records applied losses.
    #[contract]
    struct MockFleet;

    #[contractimpl]
    impl MockFleet {
        pub fn seed_fleet(env: Env, player: Address, fleet: Fleet) {
            env.storage().persistent().set(&player, &fleet);
        }

        pub fn get_fleet(env: Env, player: Address) -> Fleet {
            env.storage()
                .persistent()
                .get(&player)
                .unwrap_or(empty_fleet_with_location(0))
        }

        pub fn apply_battle_losses(env: Env, caller: Address, player: Address, losses: Fleet) {
            caller.require_auth();
            let mut losses_log: Vec<(Address, Fleet)> = env
                .storage()
                .instance()
                .get(&symbol_short!("losses"))
                .unwrap_or(Vec::new(&env));
            losses_log.push_back((player, losses));
            env.storage().instance().set(&symbol_short!("losses"), &losses_log);
        }

        pub fn losses_log(env: Env) -> Vec<(Address, Fleet)> {
            env.storage()
                .instance()
                .get(&symbol_short!("losses"))
                .unwrap_or(Vec::new(&env))
        }
    }

    struct BattleFixture<'a> {
        client: BattleContractClient<'a>,
        galaxy: MockGalaxyClient<'a>,
        fleet: MockFleetClient<'a>,
    }

    fn setup_resolvable_battle(env: &Env) -> BattleFixture<'_> {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let galaxy_id = env.register(MockGalaxy, ());
        let fleet_id = env.register(MockFleet, ());
        let contract_id = env.register(BattleContract, ());
        let client = BattleContractClient::new(env, &contract_id);
        client.initialize(&admin, &galaxy_id, &fleet_id);
        BattleFixture {
            client,
            galaxy: MockGalaxyClient::new(env, &galaxy_id),
            fleet: MockFleetClient::new(env, &fleet_id),
        }
    }

    fn fleet_of(scouts: u32, fighters: u32, cruisers: u32, dreadnoughts: u32) -> Fleet {
        Fleet { scouts, fighters, cruisers, dreadnoughts, location: 0, last_moved: 0 }
    }

    // ── damage application ────────────────────────────────────────────────────

    #[test]
    fn damage_kills_weakest_units_first() {
        let mut fleet = Fleet { scouts: 3, fighters: 2, cruisers: 0, dreadnoughts: 0, location: 0, last_moved: 0 };

        apply_damage_to_fleet(&mut fleet, 2);

        assert_eq!((fleet.scouts, fleet.fighters), (1, 2));
    }

    #[test]
    fn damage_moves_to_the_next_unit_type_once_the_weaker_one_is_gone() {
        let mut fleet = Fleet { scouts: 2, fighters: 2, cruisers: 0, dreadnoughts: 0, location: 0, last_moved: 0 };

        // 2 scouts cost 2 damage (defense 1 each), leaving 3 for fighters (defense 3 each)
        apply_damage_to_fleet(&mut fleet, 5);

        assert_eq!((fleet.scouts, fleet.fighters), (0, 1));
    }

    #[test]
    fn damage_that_exceeds_the_whole_fleet_empties_it_without_underflow() {
        let mut fleet = Fleet { scouts: 1, fighters: 0, cruisers: 0, dreadnoughts: 0, location: 0, last_moved: 0 };

        apply_damage_to_fleet(&mut fleet, 1_000_000);

        assert_eq!(fleet, empty_fleet_with_location(0));
    }

    #[test]
    fn a_kill_that_costs_more_toughness_than_remaining_damage_does_not_panic() {
        // fighter toughness is 3, but only 1 damage remains after this unit's kill
        // is credited — must clamp to zero, not underflow.
        let mut fleet = Fleet { scouts: 0, fighters: 1, cruisers: 0, dreadnoughts: 0, location: 0, last_moved: 0 };

        apply_damage_to_fleet(&mut fleet, 1);

        assert_eq!(fleet.fighters, 0);
    }

    #[test]
    fn zero_damage_leaves_the_fleet_unchanged() {
        let mut fleet = Fleet { scouts: 4, fighters: 0, cruisers: 0, dreadnoughts: 0, location: 0, last_moved: 0 };

        apply_damage_to_fleet(&mut fleet, 0);

        assert_eq!(fleet.scouts, 4);
    }

    // ── round outcome ─────────────────────────────────────────────────────────

    #[test]
    fn higher_roll_wins_the_round() {
        assert!(!did_attacker_lose_round(10, 5));
        assert!(did_attacker_lose_round(5, 10));
    }

    #[test]
    fn a_tied_roll_favors_the_defender() {
        assert!(did_attacker_lose_round(7, 7));
    }

    // ── resolve_battle ────────────────────────────────────────────────────────

    #[test]
    fn attacker_who_vastly_outguns_the_defender_wins_and_takes_the_system() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&attacker, &fleet_of(0, 0, 0, 50));
        fx.fleet.seed_fleet(&defender, &fleet_of(1, 0, 0, 0));

        fx.client.resolve_battle(&attacker, &defender, &1);

        assert_eq!(fx.galaxy.get_system(&1).owner, Some(attacker));
    }

    #[test]
    fn defender_who_vastly_outguns_the_attacker_wins_and_keeps_the_system() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&attacker, &fleet_of(1, 0, 0, 0));
        fx.fleet.seed_fleet(&defender, &fleet_of(0, 0, 0, 50));

        fx.client.resolve_battle(&attacker, &defender, &1);

        assert_eq!(fx.galaxy.get_system(&1).owner, Some(defender));
    }

    #[test]
    fn resolve_battle_requires_attacker_authorization() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&attacker, &fleet_of(0, 0, 0, 50));
        fx.fleet.seed_fleet(&defender, &fleet_of(1, 0, 0, 0));

        fx.client.resolve_battle(&attacker, &defender, &1);

        let (authorizer, _) = env.auths().into_iter().next().unwrap();
        assert_eq!(authorizer, attacker);
    }

    #[test]
    #[should_panic(expected = "fleet is empty")]
    fn resolve_battle_panics_when_attacker_fleet_is_empty() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&defender, &fleet_of(1, 0, 0, 0));

        fx.client.resolve_battle(&attacker, &defender, &1);
    }

    #[test]
    #[should_panic(expected = "defender does not own this system")]
    fn resolve_battle_panics_when_defender_does_not_own_the_system() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        let actual_owner = Address::generate(&env);
        fx.galaxy.seed_system(&actual_owner, &5);
        fx.fleet.seed_fleet(&attacker, &fleet_of(0, 0, 0, 1));

        fx.client.resolve_battle(&attacker, &defender, &1);
    }

    #[test]
    fn combat_has_not_ended_one_round_before_the_cap_with_both_fleets_alive() {
        assert!(!has_combat_ended(MAX_BATTLE_ROUNDS - 1, &fleet_of(1, 0, 0, 0), &fleet_of(1, 0, 0, 0)));
    }

    #[test]
    fn combat_has_ended_once_the_round_cap_is_reached_even_with_both_fleets_alive() {
        assert!(has_combat_ended(MAX_BATTLE_ROUNDS, &fleet_of(1, 0, 0, 0), &fleet_of(1, 0, 0, 0)));
    }

    #[test]
    fn combat_has_ended_early_if_either_fleet_is_depleted() {
        assert!(has_combat_ended(0, &empty_fleet_with_location(0), &fleet_of(1, 0, 0, 0)));
        assert!(has_combat_ended(0, &fleet_of(1, 0, 0, 0), &empty_fleet_with_location(0)));
    }

    #[test]
    fn a_system_defense_rating_alone_cannot_outweigh_a_depleted_defender_fleet() {
        // Attacker is far weaker than the raw defense rating, but the
        // defender's actual fleet is already empty — the depleted-fleet rule
        // must win regardless of how big system_defense_rating is.
        let attacker_win = did_attacker_win(&fleet_of(0, 0, 0, 1), &empty_fleet_with_location(0), 1_000);

        assert!(attacker_win);
    }

    #[test]
    fn resolve_battle_applies_losses_to_the_losing_side() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&attacker, &fleet_of(0, 0, 0, 50));
        fx.fleet.seed_fleet(&defender, &fleet_of(1, 0, 0, 0));

        fx.client.resolve_battle(&attacker, &defender, &1);

        let losses = fx.fleet.losses_log();
        let (loser, loss) = losses.get(losses.len() - 1).unwrap();
        assert_eq!(loser, defender);
        assert_eq!(loss.scouts, 1);
    }

    #[test]
    fn resolve_battle_stores_a_retrievable_battle_record() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&attacker, &fleet_of(0, 0, 0, 50));
        fx.fleet.seed_fleet(&defender, &fleet_of(1, 0, 0, 0));

        let battle_id = fx.client.resolve_battle(&attacker, &defender, &1);

        let record = fx.client.get_battle(&battle_id);
        assert_eq!(record.winner, attacker);
        assert_eq!((record.attacker, record.defender, record.system_id), (attacker, defender, 1));
    }

    #[test]
    fn resolve_battle_assigns_increasing_battle_ids() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&attacker, &fleet_of(0, 0, 0, 50));
        fx.fleet.seed_fleet(&defender, &fleet_of(1, 0, 0, 0));

        let first = fx.client.resolve_battle(&attacker, &defender, &1);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&defender, &fleet_of(1, 0, 0, 0));
        let second = fx.client.resolve_battle(&attacker, &defender, &1);

        assert_eq!(second, first + 1);
    }

    #[test]
    fn resolve_battle_emits_battle_resolved_event() {
        let env = Env::default();
        let fx = setup_resolvable_battle(&env);
        let attacker = Address::generate(&env);
        let defender = Address::generate(&env);
        fx.galaxy.seed_system(&defender, &5);
        fx.fleet.seed_fleet(&attacker, &fleet_of(0, 0, 0, 50));
        fx.fleet.seed_fleet(&defender, &fleet_of(1, 0, 0, 0));

        let battle_id = fx.client.resolve_battle(&attacker, &defender, &1);

        let (contract, topics, data) = env
            .events()
            .all()
            .into_iter()
            .filter(|(c, _, _)| *c == fx.client.address)
            .last()
            .unwrap();
        assert_eq!(contract, fx.client.address);
        assert_eq!(
            topics,
            (Symbol::new(&env, "battle_resolved"), attacker.clone()).into_val(&env)
        );
        let payload: BattleResult = data.into_val(&env);
        assert_eq!(payload.battle_id, battle_id);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn initialize_panics_when_called_twice() {
        let env = Env::default();
        let (client, admin) = setup_battle(&env);
        let other = Address::generate(&env);

        client.initialize(&admin, &other, &other);
    }

    #[test]
    #[should_panic(expected = "battle not found")]
    fn get_battle_panics_for_unknown_id() {
        let env = Env::default();
        let (client, _) = setup_battle(&env);

        client.get_battle(&1);
    }
}
