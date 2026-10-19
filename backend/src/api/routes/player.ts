import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import {
  fetchPlayerByAddress,
  fetchBattlesByPlayer,
  fetchAllianceByPlayer,
} from '../../db/queries';

export function createPlayerRouter(db: Pool): Router {
  const router = Router();

  router.get('/:address', fetchPlayerProfile(db));
  router.get('/:address/battles', fetchPlayerBattleHistory(db));
  router.get('/:address/alliance', fetchPlayerAlliance(db));

  return router;
}

/** Returns a player's profile — systems owned, battle stats */
function fetchPlayerProfile(db: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = validateStellarAddress(req.params.address);
      const player = await fetchPlayerByAddress(db, address);

      if (!player) {
        res.status(404).json({ error: 'Player not found' });
        return;
      }

      res.json({ player });
    } catch (err) {
      next(err);
    }
  };
}

/** Returns a player's full battle history */
function fetchPlayerBattleHistory(db: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = validateStellarAddress(req.params.address);
      const battles = await fetchBattlesByPlayer(db, address);
      res.json({ battles });
    } catch (err) {
      next(err);
    }
  };
}

/** Returns the alliance a player currently belongs to (#82) */
function fetchPlayerAlliance(db: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = validateStellarAddress(req.params.address);
      const alliance = await fetchAllianceByPlayer(db, address);

      if (!alliance) {
        res.status(404).json({ error: 'Player is not in an alliance' });
        return;
      }

      res.json({ alliance });
    } catch (err) {
      next(err);
    }
  };
}

/** Validates that a string looks like a Stellar address (G...) */
function validateStellarAddress(address: string): string {
  if (!address.startsWith('G') || address.length !== 56) {
    throw Object.assign(new Error('Invalid Stellar address'), { statusCode: 400 });
  }
  return address;
}
