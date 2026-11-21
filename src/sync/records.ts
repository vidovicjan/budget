import type { AppData, Settings, Transaction } from '../lib/types';
import { occurrenceKey } from '../lib/repeat';
import { monthOf } from '../lib/dates';

/**
 * Record-level change tracking for shared spaces.
 *
 * Every synced record carries `updatedAt` (ms) and deletions are kept in `data.deleted`
 * ("<collection>:<id>" -> ms). With those two, any two copies of a space can be merged
 * without a server deciding who wins: the newest edit of each record wins, and a delete
 * wins over edits made before it.
 *
 * This is deliberately the same model a cloud backend needs. With Firebase, each record
 * becomes a Firestore document at spaces/{spaceId}/{collection}/{id} holding the record
 * plus `updatedAt` (serverTimestamp) and `deleted` (bool); `mergeSpaces` is then what the
 * client runs when a snapshot arrives. See src/sync/firebase.ts.
 */

export const COLLECTIONS = ['accounts', 'categories', 'transactions', 'services', 'positions', 'notes', 'members', 'settlements'] as const;
export type Collection = (typeof COLLECTIONS)[number];

type Rec = { id: string; updatedAt?: number };
type SettingsRec = Settings & { updatedAt?: number };

/** Deletions older than this are forgotten (keeps backups small). Copies older than this merge as new. */
const TOMBSTONE_TTL = 180 * 24 * 3600_000;

function sameExceptStamp(a: Rec, b: Rec): boolean {
  const ka = Object.keys(a).filter((k) => k !== 'updatedAt');
  const kb = Object.keys(b).filter((k) => k !== 'updatedAt');
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = (a as Record<string, unknown>)[k];
    const y = (b as Record<string, unknown>)[k];
    if (x === y) continue;
    if (JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}

/**
 * Compares the state before and after a local change: stamps new and changed records with
 * `now` and logs removed ones in `deleted`. Unchanged records keep their object identity.
 */
export function stampChanges(prev: AppData, next: AppData, now = Date.now()): AppData {
  if (prev === next) return next;
  let deleted = next.deleted;
  const out = { ...next } as AppData & Record<Collection, Rec[]>;
  for (const col of COLLECTIONS) {
    const before = (prev as unknown as Record<Collection, Rec[]>)[col] ?? [];
    const after = (next as unknown as Record<Collection, Rec[]>)[col] ?? [];
    if (before === after) continue;
    const old = new Map(before.map((r) => [r.id, r]));
    const ids = new Set<string>();
    let changed = false;
    const stamped = after.map((r) => {
      ids.add(r.id);
      const o = old.get(r.id);
      if (o === r) return r;
      if (o && sameExceptStamp(o, r)) return r;
      changed = true;
      return { ...r, updatedAt: now };
    });
    if (changed) (out as Record<Collection, Rec[]>)[col] = stamped;
    for (const r of before) {
      if (ids.has(r.id)) continue;
      if (deleted === next.deleted) deleted = { ...deleted };
      deleted[`${col}:${r.id}`] = now;
    }
    // Re-added (e.g. undo, or a merge brought it back with a newer edit): no longer deleted.
    for (const id of ids) {
      const k = `${col}:${id}`;
      if (deleted[k] !== undefined && !old.has(id)) {
        const rec = after.find((r) => r.id === id);
        if (rec && (rec.updatedAt ?? now) >= deleted[k]) {
          if (deleted === next.deleted) deleted = { ...deleted };
          delete deleted[k];
        }
      }
    }
  }
  if (prev.settings !== next.settings && JSON.stringify({ ...prev.settings, updatedAt: 0 }) !== JSON.stringify({ ...next.settings, updatedAt: 0 })) {
    out.settings = { ...next.settings, updatedAt: now } as SettingsRec;
  }
  out.deleted = prune(deleted, now);
  return out;
}

function prune(deleted: Record<string, number>, now: number): Record<string, number> {
  let out = deleted;
  for (const [k, t] of Object.entries(deleted)) {
    if (now - t > TOMBSTONE_TTL) {
      if (out === deleted) out = { ...deleted };
      delete out[k];
    }
  }
  return out;
}

/** Key that identifies an automatically generated copy (same on every device). */
function generatedKey(d: AppData, t: Transaction): string | null {
  if (t.serviceId) return `svc:${t.serviceId}:${monthOf(t.date)}`;
  if (!t.sourceId) return null;
  const tpl = d.transactions.find((x) => x.id === t.sourceId);
  return `rep:${occurrenceKey(t.sourceId, t.date, tpl?.repeat ?? null)}`;
}

/**
 * Combines two copies of the same space. Newest edit wins per record; a delete wins over
 * older edits. Copies of repeating payments made independently on two devices (different
 * ids, same occurrence) are collapsed into one.
 */
export function mergeSpaces(a: AppData, b: AppData, now = Date.now()): AppData {
  const deleted: Record<string, number> = { ...a.deleted };
  for (const [k, t] of Object.entries(b.deleted)) deleted[k] = Math.max(deleted[k] ?? 0, t);

  const out = { ...a } as AppData & Record<Collection, Rec[]>;
  for (const col of COLLECTIONS) {
    const map = new Map<string, Rec>();
    for (const r of (a as unknown as Record<Collection, Rec[]>)[col] ?? []) map.set(r.id, r);
    for (const r of (b as unknown as Record<Collection, Rec[]>)[col] ?? []) {
      const mine = map.get(r.id);
      if (!mine || (r.updatedAt ?? 0) > (mine.updatedAt ?? 0)) map.set(r.id, r);
    }
    const list = [...map.values()].filter((r) => {
      const gone = deleted[`${col}:${r.id}`];
      return gone === undefined || (r.updatedAt ?? 0) > gone;
    });
    (out as Record<Collection, Rec[]>)[col] = list;
  }

  // Collapse duplicate generated copies; the loser is logged as deleted so the other side drops it too.
  const seen = new Map<string, Transaction>();
  const keep: Transaction[] = [];
  for (const t of out.transactions) {
    const key = generatedKey(out, t);
    if (!key) {
      keep.push(t);
      continue;
    }
    const first = seen.get(key);
    if (!first) {
      seen.set(key, t);
      keep.push(t);
    } else {
      const [winner, loser] = first.id < t.id ? [first, t] : [t, first];
      if (winner !== first) keep[keep.indexOf(first)] = winner;
      seen.set(key, winner);
      deleted[`transactions:${loser.id}`] = now;
    }
  }
  out.transactions = keep;

  const sa = a.settings as SettingsRec;
  const sb = b.settings as SettingsRec;
  out.settings = (sb.updatedAt ?? 0) > (sa.updatedAt ?? 0) ? sb : sa;
  out.recurringSkips = [...new Set([...a.recurringSkips, ...b.recurringSkips])];
  out.deleted = prune(deleted, now);
  return out;
}
