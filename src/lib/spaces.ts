import type { AppData, Category, Member, ThemePref } from './types';
import { CATEGORY_COLORS, MEMBER_COLORS, emptyData, uid } from './data';
import { kvGet, kvSet, kvDelete } from './db';

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
  };
}

export const PERSONAL_ID = 'personal';
const WS_KEY = 'workspace';
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

function isWorkspace(v: unknown): v is Workspace {
  return typeof v === 'object' && v !== null && Array.isArray((v as Workspace).spaces) && typeof (v as Workspace).activeId === 'string';
}

/**
 * Loads the workspace. First start after the update: the existing data becomes the
 * "Personal" space (the old storage key is left untouched as a fallback copy).
 */
export async function loadWorkspace(): Promise<{ ws: Workspace; legacy: unknown | null }> {
  const stored = await kvGet(WS_KEY);
  if (isWorkspace(stored) && stored.spaces.length) {
    const ws = stored;
    if (!ws.spaces.some((s) => s.id === ws.activeId)) ws.activeId = ws.spaces[0].id;
    ws.device ??= { name: '', theme: 'system' };
    return { ws, legacy: null };
  }
  const legacy = await kvGet(LEGACY_KEY);
  const theme = (legacy as { settings?: { theme?: ThemePref } } | null)?.settings?.theme ?? 'system';
  const ws: Workspace = {
    version: 1,
    activeId: PERSONAL_ID,
    spaces: [{ id: PERSONAL_ID, name: 'Personal', kind: 'personal', color: '#1A2744', createdAt: Date.now(), sync: { mode: 'none' } }],
    device: { name: '', theme },
  };
  return { ws, legacy };
}

export const saveWorkspace = (ws: Workspace) => kvSet(WS_KEY, ws);
export const loadSpaceData = (id: string) => kvGet(spaceKey(id));
export const saveSpaceData = (id: string, data: AppData) => kvSet(spaceKey(id), data);
export const deleteSpaceData = (id: string) => kvDelete(spaceKey(id));

/** The member using this device in a space. */
export function me(meta: SpaceMeta, data: AppData): Member | undefined {
  return data.members.find((m) => m.id === meta.meId);
}
