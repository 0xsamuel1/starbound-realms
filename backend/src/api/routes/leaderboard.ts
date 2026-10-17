import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { fetchLeaderboard } from '../../db/queries';

export function createLeaderboardRouter(db: Pool): Router {
  const router = Router();

  router.get('/', handleLeaderboard(db));

  return router;
}

/** Returns the top players ordered by systems owned */
function handleLeaderboard(db: Pool) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const players = await fetchLeaderboard(db);
      res.json({ players });
    } catch (err) {
      next(err);
    }
  };
}
