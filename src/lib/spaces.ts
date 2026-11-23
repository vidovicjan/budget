import type { AppData, Category, Member, ThemePref } from './types';
import { CATEGORY_COLORS, MEMBER_COLORS, applyRecurring, emptyData, readData, uid, type DataReport } from './data';
import { kvGet, keysOf, result, transact } from './db';
import { hasCopies, addCopy, keepDaily, removeCopies } from './safety';
import type { MascotId } from './mascots';

/**
 * A space is one budget: Personal, or one shared with a partner, family, friends or roommates.
 * Each space keeps its own AppData (accounts, categories, transactions, members…) under the
 * storage key `space:<id>`; the list of spaces and device preferences live in the Workspace.
 */

export type SpaceKind = 'personal' | 'couple' | 'family' | 'friends' | 'roommates' | 'other';

/** How this space syncs with other people's copies. */
export interface SpaceSync {
  /**
   * 'none'   – only on this device (Personal).
   * 'file'   – shared by exchanging space files (works today, no account needed).
   * 'cloud'  – live sync through a backend (Firebase), see src/sync/firebase.ts.
   */
  mode: 'none' | 'file' | 'cloud';
  /** Cloud document id once connected. */
  remoteId?: string;
  lastSyncedAt?: number;
}

export interface SpaceMeta {
  id: string;
  name: string;
  kind: SpaceKind;
  color: string;
  createdAt: number;
  /** Which member is the person using this device. */
  meId?: string;
  sync: SpaceSync;
}

export interface Workspace {
  version: 1;
  activeId: string;
  spaces: SpaceMeta[];
  device: {
    /** Name used for "you" when creating or joining spaces. */
    name: string;
    theme: ThemePref;
    /** Advisor mascot; the default one when unset. */
    mascot?: MascotId;
  };
}

export const PERSONAL_ID = 'personal';
const WS_KEY = 'workspace';
/** The list of spaces as it was before the last change; used only to rebuild a damaged one. */
const WS_PREV_KEY = 'workspace:prev';
const LEGACY_KEY = 'data';
export const spaceKey = (id: string) => `space:${id}`;

export const KIND_INFO: Record<SpaceKind, { label: string; blurb: string; icon: 'wallet' | 'heart' | 'home' | 'users' | 'key' | 'grid' }> = {
  personal: { label: 'Personal', blurb: 'Just your own money', icon: 'wallet' },
  couple: { label: 'Couple', blurb: 'Shared costs with a partner', icon: 'heart' },
  family: { label: 'Family', blurb: 'Household budget for everyone', icon: 'home' },
  friends: { label: 'Friends & trips', blurb: 'Trips, events, group spending', icon: 'users' },
  roommates: { label: 'Roommates', blurb: 'Rent, bills and groceries', icon: 'key' },
  other: { label: 'Other', blurb: 'Any group with shared costs', icon: 'grid' },
};

const PRESET_CATEGORIES: Record<Exclude<SpaceKind, 'personal'>, string[]> = {
  couple: ['Rent & home', 'Groceries', 'Dining out', 'Utilities', 'Travel', 'Entertainment', 'Gifts', 'Subscriptions'],
  family: ['Housing', 'Groceries', 'Kids', 'Utilities', 'Transport', 'Health', 'Activities', 'Subscriptions'],
  friends: ['Accommodation', 'Food & drinks', 'Transport', 'Activities', 'Tickets', 'Shopping', 'Other'],
  roommates: ['Rent', 'Utilities', 'Internet', 'Groceries', 'Household supplies', 'Cleaning'],
  other: ['General', 'Food', 'Transport', 'Supplies', 'Other'],
};

export interface NewSpaceInput {
  name: string;
  kind: Exclude<SpaceKind, 'personal'>;
  currency: string;
  me: string;
  others: { name: string; email?: string }[];
}

/** Builds a new shared space: you as owner, the others as invited members, preset categories. */
export function createSharedSpace(input: NewSpaceInput, theme: ThemePref): { meta: SpaceMeta; data: AppData } {
  const now = Date.now();
  const meId = uid();
  const members: Member[] = [
    { id: meId, name: input.me.trim() || 'Me', color: MEMBER_COLORS[0], role: 'owner', status: 'active', updatedAt: now },
    ...input.others
      .filter((o) => o.name.trim())
      .map((o, i) => ({
        id: uid(),
        name: o.name.trim(),
        color: MEMBER_COLORS[(i + 1) % MEMBER_COLORS.length],
        role: 'member' as const,
        status: 'invited' as const,
        ...(o.email?.trim() ? { email: o.email.trim() } : {}),
        updatedAt: now,
      })),
  ];
  const base = emptyData();
  const categories: Category[] = [
    ...PRESET_CATEGORIES[input.kind].map((name, i) => ({ id: uid(), name, type: 'expense' as const, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], budget: 0 })),
    { id: uid(), name: 'Shared income', type: 'income', color: CATEGORY_COLORS[8], budget: 0 },
  ];
  const data: AppData = {
    ...base,
    accounts: [{ id: uid(), name: input.kind === 'friends' ? 'Group cash' : 'Shared account', kind: 'cash', openingBalance: 0 }],
    categories,
    members,
    settings: { ...base.settings, currency: input.currency, theme },
  };
  const id = uid();
  return {
    meta: { id, name: input.name.trim() || KIND_INFO[input.kind].label, kind: input.kind, color: MEMBER_COLORS[(id.charCodeAt(0) + id.length) % MEMBER_COLORS.length], createdAt: now, meId, sync: { mode: 'file' } },
    data,
  };
}

/**
 * Why stored data couldn't be opened. Nothing is saved until it's resolved.
 *  database   – the database itself didn't open
 *  workspace  – the list of spaces is damaged or gone
 *  read       – this space couldn't be read from the database
 *  unreadable – it was read, but isn't a budget
 *  missing    – it's gone, but there are earlier copies of it
 */
export class LoadError extends Error {
  kind: 'database' | 'workspace' | 'read' | 'unreadable' | 'missing';
  /** What was read, so it can be kept. */
  raw?: unknown;
  constructor(kind: LoadError['kind'], cause: unknown, raw?: unknown) {
    super(cause instanceof Error ? cause.message : String(cause ?? 'Unknown error'));
    this.kind = kind;
    this.raw = raw;
  }
}

function isWorkspace(v: unknown): v is Workspace {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Workspace;
  return Array.isArray(w.spaces) && w.spaces.length > 0 && w.spaces.every((s) => typeof s?.id === 'string' && typeof s.name === 'string') && typeof w.activeId === 'string';
}

function newWorkspace(theme: ThemePref): Workspace {
  return {
    version: 1,
    activeId: PERSONAL_ID,
    spaces: [{ id: PERSONAL_ID, name: 'Personal', kind: 'personal', color: '#1A2744', createdAt: Date.now(), sync: { mode: 'none' } }],
    device: { name: '', theme },
  };
}

/** Loads the list of spaces, or makes the first one. Throws a LoadError rather than replacing a damaged list. */
export async function loadWorkspace(): Promise<Workspace> {
  let stored: unknown;
  let legacy: unknown;
  let spaceKeys: string[];
  try {
    [stored, legacy, spaceKeys] = await transact('readonly', async (s) => [await result(s.get(WS_KEY)), await result(s.get(LEGACY_KEY)), await keysOf(s, 'space:')] as [unknown, unknown, string[]]);
  } catch (err) {
    throw new LoadError('database', err);
  }
  if (isWorkspace(stored)) {
    const ws = stored;
    if (!ws.spaces.some((s) => s.id === ws.activeId)) ws.activeId = ws.spaces[0].id;
    ws.device ??= { name: '', theme: 'system' };
    return ws;
  }
  // Only a true first start (or the first one since spaces exist) has no list and no spaces.
  if ((stored !== undefined && stored !== null) || spaceKeys.length) throw new LoadError('workspace', 'The list of spaces is damaged.');
  return newWorkspace((legacy as { settings?: { theme?: ThemePref } } | null)?.settings?.theme ?? 'system');
}

/** Makes a new list from the last good one and the spaces that are actually stored. */
export async function rebuildWorkspace(): Promise<void> {
  await transact('readwrite', async (s) => {
    const damaged = await result(s.get(WS_KEY));
    const prev: unknown = await result(s.get(WS_PREV_KEY));
    const ids = (await keysOf(s, 'space:')).map((k) => k.slice('space:'.length));
    const ws = isWorkspace(prev) ? prev : newWorkspace('system');
    ws.device ??= { name: '', theme: 'system' };
    ws.spaces = ws.spaces.filter((x) => x.id === PERSONAL_ID || ids.includes(x.id));
    if (!ws.spaces.some((x) => x.id === PERSONAL_ID)) ws.spaces.unshift(newWorkspace('system').spaces[0]);
    let n = 0;
    for (const id of ids) {
      if (ws.spaces.some((x) => x.id === id)) continue;
      ws.spaces.push({ id, name: `Recovered space ${++n}`, kind: 'other', color: MEMBER_COLORS[n % MEMBER_COLORS.length], createdAt: Date.now(), sync: { mode: 'file' } });
    }
    if (!ws.spaces.some((x) => x.id === ws.activeId)) ws.activeId = PERSONAL_ID;
    if (damaged !== undefined) await result(s.put(damaged, `workspace:damaged:${Date.now()}`));
    await result(s.put(ws, WS_KEY));
  });
}

export const saveWorkspace = (ws: Workspace) =>
  transact('readwrite', async (s) => {
    const before: unknown = await result(s.get(WS_KEY));
    if (isWorkspace(before)) await result(s.put(before, WS_PREV_KEY));
    await result(s.put(ws, WS_KEY));
  });

/**
 * Reads a space. Throws a LoadError instead of standing in an empty budget for one that can't be
 * read. If some entries have to be left out, the original is kept as an earlier copy first.
 */
export async function openSpace(id: string): Promise<DataReport> {
  let raw: unknown;
  try {
    raw = await kvGet(spaceKey(id));
    if (raw === null) {
      if (await hasCopies(id)) throw new LoadError('missing', 'The stored budget is gone.');
      // Data from before spaces existed becomes "Personal"; its old key stays as it was.
      if (id === PERSONAL_ID) raw = await kvGet(LEGACY_KEY);
    }
  } catch (err) {
    throw err instanceof LoadError ? err : new LoadError('read', err);
  }
  if (raw === null) return { data: applyRecurring(emptyData()), skipped: [], incomplete: false };
  let report: DataReport;
  try {
    report = readData(raw);
    report = { ...report, data: applyRecurring(report.data) };
  } catch (err) {
    throw new LoadError('unreadable', err, raw);
  }
  if (report.incomplete) {
    try {
      await addCopy(id, 'skipped', raw);
    } catch (err) {
      throw new LoadError('read', err, raw);
    }
  }
  return report;
}

export const saveSpaceData = (id: string, data: AppData) =>
  transact('readwrite', async (s) => {
    await keepDaily(s, id, () => result(s.get(spaceKey(id)))).catch((err) => console.error('No daily copy:', err));
    await result(s.put(data, spaceKey(id)));
  });

/** Removes a space from this device, with its earlier copies. */
export const deleteSpaceData = (id: string) =>
  transact('readwrite', async (s) => {
    await result(s.delete(spaceKey(id)));
    await removeCopies(s, id);
  });
