import { keysOf, result, transact } from './db';

/**
 * Earlier copies of a space, kept next to it in the same database: one per day, and one before
 * anything that replaces the whole budget. They undo mistakes and bad data; they don't replace
 * exported backups, because they are lost if the database itself is.
 */

export type CopyReason = 'daily' | 'restore' | 'erase' | 'sample' | 'skipped' | 'unreadable';

export interface SafetyCopy {
  spaceId: string;
  /** When it was taken (ms). */
  at: number;
  reason: CopyReason;
  /** Exactly what was stored; not checked or cleaned. */
  data: unknown;
}

/** How many copies of each kind are kept per space. */
const KEEP: Record<CopyReason, number> = { daily: 7, restore: 5, erase: 5, sample: 5, skipped: 5, unreadable: 5 };

const prefix = (spaceId: string) => `copy:${spaceId}:`;

async function copyKeys(store: IDBObjectStore, spaceId: string) {
  const p = prefix(spaceId);
  return (await keysOf(store, p)).flatMap((key) => {
    // Ids come from invite files too, so "a" must not pick up the copies of "a:b".
    const m = /^(\d+):([a-z]+)$/.exec(key.slice(p.length));
    return m ? [{ key, at: Number(m[1]), reason: m[2] as CopyReason }] : [];
  });
}

const LISTS = ['transactions', 'services', 'positions', 'notes', 'settlements', 'transfers'];

/** Entries in a stored budget, or null if it doesn't look like one. */
export function countEntries(data: unknown): number | null {
  if (typeof data !== 'object' || data === null || !Array.isArray((data as Record<string, unknown>).transactions)) return null;
  return LISTS.reduce((n, k) => {
    const list = (data as Record<string, unknown>)[k];
    return n + (Array.isArray(list) ? list.length : 0);
  }, 0);
}

async function put(store: IDBObjectStore, spaceId: string, reason: CopyReason, data: unknown) {
  const same = (await copyKeys(store, spaceId)).filter((c) => c.reason === reason);
  const last = same[same.length - 1];
  if (last && reason !== 'daily') {
    const prev = (await result(store.get(last.key))) as SafetyCopy;
    if (JSON.stringify(prev?.data) === JSON.stringify(data)) return;
  }
  const at = Math.max(Date.now(), (last?.at ?? 0) + 1);
  await result(store.put({ spaceId, at, reason, data } satisfies SafetyCopy, `${prefix(spaceId)}${at}:${reason}`));
  for (const old of same.slice(0, Math.max(0, same.length + 1 - KEEP[reason]))) await result(store.delete(old.key));
}

/** Keeps a copy. Rejects if it couldn't be stored, so callers can stop before replacing anything. */
export async function addCopy(spaceId: string, reason: CopyReason, data: unknown): Promise<void> {
  if (countEntries(data) === 0) return;
  await transact('readwrite', (s) => put(s, spaceId, reason, data));
}

/** Part of every save: the first one each day keeps what was stored until then. */
export async function keepDaily(store: IDBObjectStore, spaceId: string, stored: () => Promise<unknown>): Promise<void> {
  const today = new Date().toDateString();
  if ((await copyKeys(store, spaceId)).some((c) => c.reason === 'daily' && new Date(c.at).toDateString() === today)) return;
  const data = await stored();
  // An empty budget is never worth pushing out a real copy.
  if (data === undefined || data === null || countEntries(data) === 0) return;
  await put(store, spaceId, 'daily', data);
}

export const hasCopies = (spaceId: string) => transact('readonly', async (s) => (await copyKeys(s, spaceId)).length > 0);

/** Newest first. */
export const listCopies = (spaceId: string): Promise<SafetyCopy[]> =>
  transact('readonly', async (s) => {
    const list: SafetyCopy[] = [];
    for (const c of await copyKeys(s, spaceId)) list.push((await result(s.get(c.key))) as SafetyCopy);
    return list.sort((a, b) => b.at - a.at);
  });

export async function removeCopies(store: IDBObjectStore, spaceId: string): Promise<void> {
  for (const c of await copyKeys(store, spaceId)) await result(store.delete(c.key));
}

export const deleteCopies = (spaceId: string) => transact('readwrite', (s) => removeCopies(s, spaceId));
