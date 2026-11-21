import type { AppData, Member } from '../lib/types';
import type { SpaceMeta } from '../lib/spaces';

/**
 * Everything the app needs from a way of sharing a space with other people.
 *
 * Today the only provider is `fileProvider` (src/sync/file.ts): people swap a space file.
 * A cloud provider (src/sync/firebase.ts) implements the same interface with live updates;
 * the UI only talks to this interface, so switching is a matter of picking the provider
 * in `getProvider`.
 */
export interface SyncProvider {
  readonly id: 'file' | 'cloud';
  /** Shown in the sharing card. */
  readonly label: string;
  /** true: changes arrive by themselves (subscribe works); false: the user syncs by hand. */
  readonly live: boolean;

  /** Let someone join the space. File: saves a space file to send. Cloud: returns a link/code. */
  invite(meta: SpaceMeta, data: AppData, member?: Member): Promise<InviteResult>;

  /** Reads an invite (file contents, or a code) into a space pack the app can join. */
  readInvite(input: string): Promise<SpacePack>;

  /** Brings the local copy up to date with everyone else's; returns the merged data. */
  sync(meta: SpaceMeta, data: AppData): Promise<SyncResult>;

  /** Live providers only: calls back with remote changes. Returns an unsubscribe function. */
  subscribe?(meta: SpaceMeta, onChange: (remote: AppData) => void): () => void;

  /** Live providers only: send a local change right away. */
  push?(meta: SpaceMeta, data: AppData): Promise<void>;
}

export interface InviteResult {
  /** What happened, for a toast. */
  message: string;
  /** Cloud: a link or code to share. */
  code?: string;
}

export interface SyncResult {
  data: AppData | null;
  message: string;
}

/** A space as exchanged between devices: its identity and full data. */
export interface SpacePack {
  format: 'budget-tracker-space';
  version: 1;
  exportedAt: number;
  /** Member id of whoever made the file. */
  exportedBy?: string;
  /** Member the invite was made for, if any. */
  invitedMember?: string;
  space: { id: string; name: string; kind: SpaceMeta['kind']; color: string };
  data: AppData;
}

let active: SyncProvider | null = null;

/** The provider used for shared spaces. Swap in the cloud provider here once it's configured. */
export async function getProvider(): Promise<SyncProvider> {
  if (!active) {
    const { fileProvider } = await import('./file');
    active = fileProvider;
  }
  return active;
}
