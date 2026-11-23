import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppData, ThemePref } from './lib/types';
import { applyRecurring } from './lib/data';
import { setCurrency } from './lib/format';
import { applyTheme } from './lib/theme';
import type { MascotId } from './lib/mascots';
import { addCopy, type CopyReason } from './lib/safety';
import { LoadFailure } from './components/LoadFailure';
import {
  LoadError,
  PERSONAL_ID,
  deleteSpaceData,
  loadWorkspace,
  openSpace,
  rebuildWorkspace,
  saveSpaceData,
  saveWorkspace,
  type SpaceMeta,
  type Workspace,
} from './lib/spaces';
import { mergeSpaces, stampChanges } from './sync/records';

interface Store {
  /** Data of the active space. */
  data: AppData;
  /** Changes the active space. Changes are stamped for syncing and saved automatically. */
  update: (fn: (d: AppData) => AppData) => void;
  /** Replaces the whole budget. Keeps a copy of the current one first, and rejects without changing anything if it can't. */
  replaceData: (next: (d: AppData) => AppData, reason: CopyReason) => Promise<void>;
  /**
   * Merges another copy of a space (from a file now, from the cloud later) into the stored one.
   * Works whether or not that space is open. Remote timestamps are kept, not re-stamped.
   */
  mergeRemote: (spaceId: string, remote: AppData) => Promise<void>;
  saveError: string | null;
  /** Entries left out when the space was opened, e.g. "2 transactions"; null once shown. */
  skipped: string[] | null;
  clearSkipped: () => void;

  workspace: Workspace;
  space: SpaceMeta;
  switchSpace: (id: string) => Promise<void>;
  addSpace: (meta: SpaceMeta, data: AppData, activate?: boolean) => Promise<void>;
  updateSpace: (id: string, patch: Partial<SpaceMeta>) => void;
  removeSpace: (id: string) => Promise<void>;
  setTheme: (t: ThemePref) => void;
  setMascot: (id: MascotId) => void;
  setDeviceName: (name: string) => void;
}

const StoreCtx = createContext<Store | null>(null);

interface Active {
  id: string;
  data: AppData;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<{ error: LoadError; ws?: Workspace } | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Opens a space for editing. Only called with data that was really read, or explicitly chosen.
  const activate = useCallback((ws: Workspace, id: string, data: AppData, skipped: string[]) => {
    setFailure(null);
    setWs({ ...ws, activeId: id });
    setActive({ id, data });
    setSkipped(skipped.length ? skipped : null);
  }, []);

  // Load the workspace and the active space. If either fails, nothing is opened and so nothing is saved.
  useEffect(() => {
    let stale = false;
    (async () => {
      let ws: Workspace | undefined;
      try {
        ws = await loadWorkspace();
        const r = await openSpace(ws.activeId);
        if (!stale) activate(ws, ws.activeId, r.data, r.skipped);
      } catch (err) {
        console.error(err);
        if (!stale) setFailure({ error: err instanceof LoadError ? err : new LoadError('database', err), ws });
      }
    })();
    return () => {
      stale = true;
    };
  }, [attempt, activate]);

  // Save the active space whenever it changes.
  useEffect(() => {
    if (!active) return;
    saveSpaceData(active.id, active.data)
      .then(() => setSaveError(null))
      .catch((err) => setSaveError(String(err?.message || err)));
  }, [active]);

  useEffect(() => {
    if (!ws) return;
    saveWorkspace(ws).catch((err) => setSaveError(String(err?.message || err)));
  }, [ws]);

  const theme = ws?.device.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const activeRef = useRef<Active | null>(null);
  activeRef.current = active;

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setActive((a) => (a ? { ...a, data: stampChanges(a.data, applyRecurring(fn(a.data))) } : a));
  }, []);

  const replaceData = useCallback(
    async (next: (d: AppData) => AppData, reason: CopyReason) => {
      const a = activeRef.current;
      if (!a) return;
      await addCopy(a.id, reason, a.data);
      if (activeRef.current?.id === a.id) update(next);
    },
    [update]
  );

  const mergeRemote = useCallback(async (spaceId: string, remote: AppData) => {
    if (activeRef.current?.id === spaceId) {
      setActive((a) => (a ? { ...a, data: applyRecurring(mergeSpaces(a.data, remote)) } : a));
      return;
    }
    const local = (await openSpace(spaceId)).data;
    await saveSpaceData(spaceId, applyRecurring(mergeSpaces(local, remote)));
  }, []);

  const switchSpace = useCallback(async (id: string) => {
    const r = await openSpace(id);
    setActive({ id, data: r.data });
    setWs((w) => (w ? { ...w, activeId: id } : w));
    setSkipped(r.skipped.length ? r.skipped : null);
  }, []);

  const addSpace = useCallback(async (meta: SpaceMeta, data: AppData, activate = true) => {
    await saveSpaceData(meta.id, data);
    setWs((w) => (w ? { ...w, spaces: [...w.spaces.filter((s) => s.id !== meta.id), meta], activeId: activate ? meta.id : w.activeId } : w));
    if (activate) setActive({ id: meta.id, data: applyRecurring(data) });
  }, []);

  const updateSpace = useCallback((id: string, patch: Partial<SpaceMeta>) => {
    setWs((w) => (w ? { ...w, spaces: w.spaces.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : w));
  }, []);

  const removeSpace = useCallback(
    async (id: string) => {
      if (id === PERSONAL_ID || !ws) return;
      if (ws.activeId === id) await switchSpace(PERSONAL_ID);
      await deleteSpaceData(id);
      setWs((w) => (w ? { ...w, spaces: w.spaces.filter((s) => s.id !== id), activeId: w.activeId === id ? PERSONAL_ID : w.activeId } : w));
    },
    [ws, switchSpace]
  );

  const setTheme = useCallback((t: ThemePref) => setWs((w) => (w ? { ...w, device: { ...w.device, theme: t } } : w)), []);
  const setMascot = useCallback((id: MascotId) => setWs((w) => (w ? { ...w, device: { ...w.device, mascot: id } } : w)), []);
  const setDeviceName = useCallback((name: string) => setWs((w) => (w ? { ...w, device: { ...w.device, name } } : w)), []);

  const clearSkipped = useCallback(() => setSkipped(null), []);

  if (failure) {
    const { error, ws } = failure;
    const spaces = ws?.spaces.filter((s) => s.id !== ws.activeId) ?? [];
    return (
      <LoadFailure
        error={error}
        space={ws?.spaces.find((s) => s.id === ws.activeId)}
        otherSpaces={spaces}
        onRetry={() => setAttempt((n) => n + 1)}
        onRebuild={async () => {
          await rebuildWorkspace();
          setAttempt((n) => n + 1);
        }}
        onOpenSpace={async (id) => {
          const r = await openSpace(id);
          activate(ws!, id, r.data, r.skipped);
        }}
        onReplace={async (data) => {
          // Keep what's there before anything is written over it.
          if (error.raw !== undefined) await addCopy(ws!.activeId, 'unreadable', error.raw);
          activate(ws!, ws!.activeId, applyRecurring(data), []);
        }}
      />
    );
  }
  if (!ws || !active) return <div className="boot" aria-busy="true" />;
  const space = ws.spaces.find((s) => s.id === active.id) ?? ws.spaces[0];
  setCurrency(active.data.settings.currency);

  return (
    <StoreCtx.Provider
      value={{
        data: active.data,
        update,
        mergeRemote,
        replaceData,
        saveError,
        skipped,
        clearSkipped,
        workspace: ws,
        space,
        switchSpace,
        addSpace,
        updateSpace,
        removeSpace,
        setTheme,
        setMascot,
        setDeviceName,
      }}
    >
      {/* Remount pages per space so page-level state (filters, selected month…) starts fresh. */}
      <Fragment key={active.id}>{children}</Fragment>
    </StoreCtx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
