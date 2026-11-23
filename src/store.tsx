import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppData, ThemePref } from './lib/types';
import { applyRecurring, emptyData, normalizeData } from './lib/data';
import { setCurrency } from './lib/format';
import { applyTheme } from './lib/theme';
import type { MascotId } from './lib/mascots';
import {
  PERSONAL_ID,
  deleteSpaceData,
  loadSpaceData,
  loadWorkspace,
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
  /**
   * Merges another copy of a space (from a file now, from the cloud later) into the stored one.
   * Works whether or not that space is open. Remote timestamps are kept, not re-stamped.
   */
  mergeRemote: (spaceId: string, remote: AppData) => Promise<void>;
  saveError: string | null;

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
  /** Loading failed: never save over what's stored. */
  readOnly?: boolean;
}

function prepare(raw: unknown): AppData {
  return applyRecurring(raw ? normalizeData(raw) : emptyData());
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load the workspace and the active space; move pre-spaces data into "Personal".
  useEffect(() => {
    (async () => {
      const { ws, legacy } = await loadWorkspace();
      let raw = await loadSpaceData(ws.activeId).catch(() => null);
      if (!raw && ws.activeId === PERSONAL_ID && legacy) raw = legacy;
      let next: Active;
      try {
        next = { id: ws.activeId, data: prepare(raw) };
      } catch (err) {
        console.error(err);
        next = { id: ws.activeId, data: emptyData(), readOnly: !!raw };
        setSaveError('Stored data could not be read. Nothing will be saved until you restore a backup.');
      }
      setWs(ws);
      setActive(next);
    })().catch((err) => {
      console.error(err);
      setSaveError(String(err?.message || err));
    });
  }, []);

  // Save the active space whenever it changes.
  useEffect(() => {
    if (!active || active.readOnly) return;
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

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setActive((a) => (a ? { ...a, readOnly: false, data: stampChanges(a.data, applyRecurring(fn(a.data))) } : a));
  }, []);

  const activeId = useRef<string | null>(null);
  activeId.current = active?.id ?? null;
  const mergeRemote = useCallback(async (spaceId: string, remote: AppData) => {
    if (activeId.current === spaceId) {
      setActive((a) => (a ? { ...a, readOnly: false, data: applyRecurring(mergeSpaces(a.data, remote)) } : a));
      return;
    }
    const local = prepare(await loadSpaceData(spaceId));
    await saveSpaceData(spaceId, applyRecurring(mergeSpaces(local, remote)));
  }, []);

  const switchSpace = useCallback(async (id: string) => {
    const raw = await loadSpaceData(id);
    const data = prepare(raw);
    setActive({ id, data });
    setWs((w) => (w ? { ...w, activeId: id } : w));
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

  if (!ws || !active) return <div className="boot" aria-busy="true" />;
  const space = ws.spaces.find((s) => s.id === active.id) ?? ws.spaces[0];
  setCurrency(active.data.settings.currency);

  return (
    <StoreCtx.Provider
      value={{
        data: active.data,
        update,
        mergeRemote,
        saveError,
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
