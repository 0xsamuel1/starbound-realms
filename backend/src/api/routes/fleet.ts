import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { fetchPlayerByAddress, fetchFleetSnapshot } from '../../db/queries';

export function createFleetRouter(db: Pool): Router {
  const router = Router();

  router.get('/:address', fetchPlayerFleet(db));

  return router;
}

/** Returns a player's current fleet snapshot */
function fetchPlayerFleet(db: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const address = validateStellarAddress(req.params.address);

      const player = await fetchPlayerByAddress(db, address);

      if (!player) {
        res.status(404).json({ error: 'Player not found' });
        return;
      }

      const snapshot = await fetchFleetSnapshot(db, address);

      res.json({
        address,
        fleet: {
          scouts:       snapshot?.scouts       ?? 0,
          fighters:     snapshot?.fighters     ?? 0,
          cruisers:     snapshot?.cruisers     ?? 0,
          dreadnoughts: snapshot?.dreadnoughts ?? 0,
          location:     snapshot?.location     ?? null,
          lastMoved:    snapshot?.last_moved   ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

/** Validates that a string looks like a Stellar address */
function validateStellarAddress(address: string): string {
  if (!address.startsWith('G') || address.length !== 56) {
    throw Object.assign(new Error('Invalid Stellar address'), { statusCode: 400 });
  }
  return address;
}
