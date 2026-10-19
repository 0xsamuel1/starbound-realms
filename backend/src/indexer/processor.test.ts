import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/queries', () => ({
  upsertStarSystem: vi.fn(),
  saveBattle: vi.fn(),
  incrementPlayerSystemsOwned: vi.fn(),
  decrementPlayerSystemsOwned: vi.fn(),
  saveResourceEvent: vi.fn(),
  upsertFleetSnapshot: vi.fn(),
  applyFleetLosses: vi.fn(),
  createAlliance: vi.fn(),
  addAllianceMember: vi.fn(),
  removeAllianceMember: vi.fn(),
}));

import {
  upsertStarSystem,
  saveBattle,
  incrementPlayerSystemsOwned,
  decrementPlayerSystemsOwned,
  saveResourceEvent,
  upsertFleetSnapshot,
  applyFleetLosses,
  createAlliance,
  addAllianceMember,
  removeAllianceMember,
} from '../db/queries';
import { processEvent, ContractEvent } from './processor';

const db = {} as any;

beforeEach(() => {
  vi.mocked(upsertStarSystem).mockClear();
  vi.mocked(saveBattle).mockClear();
  vi.mocked(incrementPlayerSystemsOwned).mockClear();
  vi.mocked(decrementPlayerSystemsOwned).mockClear();
  vi.mocked(saveResourceEvent).mockClear();
  vi.mocked(upsertFleetSnapshot).mockClear();
  vi.mocked(applyFleetLosses).mockClear();
  vi.mocked(createAlliance).mockClear();
  vi.mocked(addAllianceMember).mockClear();
  vi.mocked(removeAllianceMember).mockClear();
});

describe('processEvent — claimed', () => {
  it('upserts the star system and increments the owner\'s systems owned', async () => {
    const event: ContractEvent = {
      contractId: 'C1',
      topic: ['claimed', 'GPLAYER'],
      value: 7,
      ledgerSequence: 100,
    };

    await processEvent(db, event);

    expect(upsertStarSystem).toHaveBeenCalledWith(db, 7, 'GPLAYER', 100);
    expect(incrementPlayerSystemsOwned).toHaveBeenCalledWith(db, 'GPLAYER');
  });
});

describe('processEvent — transfer', () => {
  it('passes a numeric system id to upsertStarSystem', async () => {
    const event: ContractEvent = {
      contractId: 'C1',
      topic: ['transfer', '42'],
      value: ['GOLD', 'GNEW'],
      ledgerSequence: 200,
    };

    await processEvent(db, event);

    expect(upsertStarSystem).toHaveBeenCalledWith(db, 42, 'GNEW', 200);
    expect(typeof vi.mocked(upsertStarSystem).mock.calls[0][1]).toBe('number');
  });

  it('decrements the old owner and increments the new owner', async () => {
    const event: ContractEvent = {
      contractId: 'C1',
      topic: ['transfer', '42'],
      value: ['GOLD', 'GNEW'],
      ledgerSequence: 200,
    };

    await processEvent(db, event);

    expect(decrementPlayerSystemsOwned).toHaveBeenCalledWith(db, 'GOLD');
    expect(incrementPlayerSystemsOwned).toHaveBeenCalledWith(db, 'GNEW');
  });

  it('skips decrementing when there was no previous owner', async () => {
    const event: ContractEvent = {
      contractId: 'C1',
      topic: ['transfer', '42'],
      value: [null, 'GNEW'],
      ledgerSequence: 200,
    };

    await processEvent(db, event);

    expect(decrementPlayerSystemsOwned).not.toHaveBeenCalled();
  });
});

describe('processEvent — battle_resolved', () => {
  it('saves the battle record', async () => {
    const event: ContractEvent = {
      contractId: 'C1',
      topic: ['battle_resolved'],
      value: {
        // u64: scValToNative yields a BigInt, verified against a real testnet event
        battle_id: 5n,
        attacker: 'GATTACKER',
        defender: 'GDEFENDER',
        system_id: 9,
        winner: 'GATTACKER',
        rounds: 3,
      },
      ledgerSequence: 300,
    };

    await processEvent(db, event);

    expect(saveBattle).toHaveBeenCalledWith(db, 5n, 'GATTACKER', 'GDEFENDER', 9, 'GATTACKER', 3, 300);
  });
});

describe('processEvent — unknown topic', () => {
  it('skips silently without calling any handler', async () => {
    const event: ContractEvent = {
      contractId: 'C1',
      topic: ['unknown_event'],
      value: {},
      ledgerSequence: 400,
    };

    await processEvent(db, event);

    expect(upsertStarSystem).not.toHaveBeenCalled();
    expect(saveBattle).not.toHaveBeenCalled();
    expect(incrementPlayerSystemsOwned).not.toHaveBeenCalled();
    expect(saveResourceEvent).not.toHaveBeenCalled();
    expect(upsertFleetSnapshot).not.toHaveBeenCalled();
    expect(applyFleetLosses).not.toHaveBeenCalled();
  });
});

describe('processEvent — minted', () => {
  it('saves a mint resource event', async () => {
    // topic: ["minted", player], value: [ResourceType, i128 as BigInt]
    // Confirmed against contracts/resources/src/lib.rs mint()
    const event: ContractEvent = {
      contractId: 'C_RESOURCES',
      topic: ['minted', 'GPLAYER'],
      value: ['Iron', 50n],
      ledgerSequence: 500,
    };

    await processEvent(db, event);

    expect(saveResourceEvent).toHaveBeenCalledWith(db, 'GPLAYER', 'Iron', 'mint', 50n, 500);
  });
});

describe('processEvent — burned', () => {
  it('saves a burn resource event', async () => {
    // topic: ["burned", player], value: [ResourceType, i128 as BigInt]
    // Confirmed against contracts/resources/src/lib.rs burn()
    const event: ContractEvent = {
      contractId: 'C_RESOURCES',
      topic: ['burned', 'GPLAYER'],
      value: ['Energy', 20n],
      ledgerSequence: 600,
    };

    await processEvent(db, event);

    expect(saveResourceEvent).toHaveBeenCalledWith(db, 'GPLAYER', 'Energy', 'burn', 20n, 600);
  });
});

describe('processEvent — mined', () => {
  it('saves a mine resource event using the resource type and amount from value', async () => {
    // topic: ["mined", player], value: [system_id: u32, ResourceType, i128 as BigInt]
    // Confirmed against contracts/resources/src/lib.rs mine()
    const event: ContractEvent = {
      contractId: 'C_RESOURCES',
      topic: ['mined', 'GPLAYER'],
      value: [3, 'Plasma', 25n],
      ledgerSequence: 700,
    };

    await processEvent(db, event);

    expect(saveResourceEvent).toHaveBeenCalledWith(db, 'GPLAYER', 'Plasma', 'mine', 25n, 700);
  });
});

describe('processEvent — built', () => {
  it('upserts the fleet snapshot with the built unit type and count', async () => {
    // topic: ["built", player], value: [UnitType, count]
    // Confirmed against contracts/fleet/src/lib.rs build_unit()
    const event: ContractEvent = {
      contractId: 'C_FLEET',
      topic: ['built', 'GPLAYER'],
      value: ['Scout', 3],
      ledgerSequence: 800,
    };

    await processEvent(db, event);

    expect(upsertFleetSnapshot).toHaveBeenCalledWith(db, 'GPLAYER', 'Scout', 3);
  });
});

describe('processEvent — losses', () => {
  it('applies fleet losses to the stored snapshot', async () => {
    // topic: ["losses", player], value: Fleet struct { scouts, fighters, cruisers, dreadnoughts, ... }
    // Confirmed against contracts/fleet/src/lib.rs apply_battle_losses()
    const event: ContractEvent = {
      contractId: 'C_FLEET',
      topic: ['losses', 'GPLAYER'],
      value: {
        scouts: 1,
        fighters: 2,
        cruisers: 0,
        dreadnoughts: 1,
        location: 0,
        last_moved: 0,
      },
      ledgerSequence: 900,
    };

    await processEvent(db, event);

    expect(applyFleetLosses).toHaveBeenCalledWith(db, 'GPLAYER', 1, 2, 0, 1);
  });
});

describe('processEvent — alliance_created', () => {
  it('creates the alliance with its leader', async () => {
    // topic: ["alliance_created", leader], value: [alliance_id, name]
    const event: ContractEvent = {
      contractId: 'C_ALLIANCE',
      topic: ['alliance_created', 'GLEADER'],
      value: [42, 'Star League'],
      ledgerSequence: 1000,
    };

    await processEvent(db, event);

    expect(createAlliance).toHaveBeenCalledWith(db, 42, 'Star League', 'GLEADER', 1000);
    // createAlliance is responsible for seeding the leader as a member.
    expect(addAllianceMember).not.toHaveBeenCalled();
    expect(removeAllianceMember).not.toHaveBeenCalled();
  });
});

describe('processEvent — alliance_joined', () => {
  it('adds the player to the alliance as a member', async () => {
    // topic: ["alliance_joined", player], value: alliance_id
    const event: ContractEvent = {
      contractId: 'C_ALLIANCE',
      topic: ['alliance_joined', 'GPLAYER'],
      value: 42,
      ledgerSequence: 1100,
    };

    await processEvent(db, event);

    expect(addAllianceMember).toHaveBeenCalledWith(db, 42, 'GPLAYER', 'member');
    expect(createAlliance).not.toHaveBeenCalled();
    expect(removeAllianceMember).not.toHaveBeenCalled();
  });

  it('accepts the alliance id wrapped in a tuple', async () => {
    const event: ContractEvent = {
      contractId: 'C_ALLIANCE',
      topic: ['alliance_joined', 'GPLAYER'],
      value: [7],
      ledgerSequence: 1101,
    };

    await processEvent(db, event);

    expect(addAllianceMember).toHaveBeenCalledWith(db, 7, 'GPLAYER', 'member');
  });
});

describe('processEvent — alliance_left', () => {
  it('removes the player from their alliance', async () => {
    // topic: ["alliance_left", player], value: alliance_id
    const event: ContractEvent = {
      contractId: 'C_ALLIANCE',
      topic: ['alliance_left', 'GPLAYER'],
      value: 42,
      ledgerSequence: 1200,
    };

    await processEvent(db, event);

    expect(removeAllianceMember).toHaveBeenCalledWith(db, 'GPLAYER');
    expect(createAlliance).not.toHaveBeenCalled();
    expect(addAllianceMember).not.toHaveBeenCalled();
  });
});

describe('processEvent — unknown topics', () => {
  it('ignores events it does not recognise without touching the database', async () => {
    const event: ContractEvent = {
      contractId: 'C_X',
      topic: ['something_new', 'GPLAYER'],
      value: 1,
      ledgerSequence: 2000,
    };

    await processEvent(db, event);

    expect(createAlliance).not.toHaveBeenCalled();
    expect(addAllianceMember).not.toHaveBeenCalled();
    expect(removeAllianceMember).not.toHaveBeenCalled();
    expect(upsertStarSystem).not.toHaveBeenCalled();
  });
});
