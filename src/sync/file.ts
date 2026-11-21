import { normalizeData } from '../lib/data';
import { openTextFile, saveTextFile } from '../lib/files';
import type { AppData, Member } from '../lib/types';
import type { SpaceMeta } from '../lib/spaces';
import { mergeSpaces } from './records';
import type { SpacePack, SyncProvider } from './provider';

/**
 * Sharing without any server: a space travels as a ".budgetspace" file (JSON).
 *  - Invite: the owner saves the file and sends it (chat, email, USB…).
 *  - Join:   the friend opens it in their app and picks who they are.
 *  - Sync:   anyone saves their copy and sends it; opening it merges (newest edit wins).
 */

const EXT = 'budgetspace';

export function makePack(meta: SpaceMeta, data: AppData, invitedMember?: Member): SpacePack {
  return {
    format: 'budget-tracker-space',
    version: 1,
    exportedAt: Date.now(),
    exportedBy: meta.meId,
    ...(invitedMember ? { invitedMember: invitedMember.id } : {}),
    space: { id: meta.id, name: meta.name, kind: meta.kind, color: meta.color },
    data,
  };
}

export function parsePack(text: string): SpacePack {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Budget Tracker space file.');
  }
  const p = raw as Partial<SpacePack>;
  if (!p || p.format !== 'budget-tracker-space' || !p.space?.id || !p.data) {
    throw new Error('That file is not a Budget Tracker space file. Use “Invite” or “Send my changes” in a shared space to make one.');
  }
  return { ...(p as SpacePack), data: normalizeData(p.data) };
}

const fileName = (meta: SpaceMeta, suffix: string) =>
  `${meta.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'Shared space'} – ${suffix}.${EXT}`;

/** Opens a space file with the file picker; null if cancelled. */
export async function pickPack(): Promise<SpacePack | null> {
  const f = await openTextFile([EXT, 'json']);
  return f ? parsePack(f.content) : null;
}

export const fileProvider: SyncProvider = {
  id: 'file',
  label: 'Space files',
  live: false,

  async invite(meta, data, member) {
    const name = member ? `invite for ${member.name}` : 'invite';
    const saved = await saveTextFile(fileName(meta, name), JSON.stringify(makePack(meta, data, member)), 'application/json');
    return { message: saved ? `Invite file saved. Send it to ${member?.name ?? 'them'}.` : 'Cancelled' };
  },

  async readInvite(text) {
    return parsePack(text);
  },

  async sync(meta, data) {
    const pack = await pickPack();
    if (!pack) return { data: null, message: 'Cancelled' };
    if (pack.space.id !== meta.id) throw new Error(`That file is for “${pack.space.name}”, not “${meta.name}”.`);
    return { data: mergeSpaces(data, pack.data), message: 'Changes merged' };
  },
};

/** Saves this device's copy so others can merge it ("Send my changes"). */
export async function exportCopy(meta: SpaceMeta, data: AppData, myName: string): Promise<boolean> {
  return !!(await saveTextFile(fileName(meta, `from ${myName}`), JSON.stringify(makePack(meta, data)), 'application/json'));
}
