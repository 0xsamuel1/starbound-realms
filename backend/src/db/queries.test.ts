import { describe, it, expect, vi } from 'vitest';
import { fetchIndexerCursor, saveIndexerCursor } from './queries';

function fakeDb(rows: any[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as any;
}

describe('fetchIndexerCursor', () => {
  it('returns the last processed ledger as a number', async () => {
    const db = fakeDb([{ last_ledger: '123' }]);

    await expect(fetchIndexerCursor(db)).resolves.toBe(123);
  });

  it('returns 0 when no cursor has been stored yet', async () => {
    const db = fakeDb([]);

    await expect(fetchIndexerCursor(db)).resolves.toBe(0);
  });
});

describe('saveIndexerCursor', () => {
  it('upserts the ledger as the single indexer_state row', async () => {
    const db = fakeDb();

    await saveIndexerCursor(db, 500);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO indexer_state');
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual([500]);
  });
});
