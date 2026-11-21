import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { UICtx, type Page, type UI } from './ui';
import type { Category, Position, Transaction, TxType } from './lib/types';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { UpdateBanner } from './components/UpdateBanner';
import { TransactionDialog } from './components/TransactionDialog';
import { CategoryDialog } from './components/CategoryDialog';
import { PositionDialog } from './components/PositionDialog';
import { MarketProvider } from './market';
import { Portfolio } from './pages/Portfolio';
import { Calendar } from './pages/Calendar';
import { Notes } from './pages/Notes';
import { Advisor } from './pages/Advisor';
import { Together } from './pages/Together';
import { JoinSpaceDialog, NewSpaceDialog } from './components/SpaceDialogs';
import { pickPack } from './sync/file';
import type { SpacePack } from './sync/provider';
import { isShared } from './lib/shared';
import { Icon } from './components/Icon';
import { Overview } from './pages/Overview';
import { Transactions } from './pages/Transactions';
import { Budgets } from './pages/Budgets';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { monthOf, todayISO } from './lib/dates';
import { importCSV } from './lib/csv';
import { openTextFile, saveTextFile } from './lib/files';
import { sampleData } from './lib/sample';

type TxDialog = { tx: Transaction | null; type: TxType; date?: string } | null;
type CatDialog = { cat: Category | null; type: TxType } | null;
type PosDialog = { position: Position | null; accountId?: string } | null;
type Toast = { message: string; kind: 'ok' | 'error'; id: number } | null;
type SpaceDialog = { kind: 'new' } | { kind: 'join'; pack: SpacePack } | null;

/** Pages survive switching spaces (the shell remounts per space). */
let lastPage: Page = 'overview';

function Shell() {
  const { data, update, space } = useStore();
  const [page, setPage] = useState<Page>(() => (lastPage === 'together' && !isShared(data) ? 'overview' : lastPage));
  const [spaceDialog, setSpaceDialog] = useState<SpaceDialog>(null);
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [txDialog, setTxDialog] = useState<TxDialog>(null);
  const [catDialog, setCatDialog] = useState<CatDialog>(null);
  const [posDialog, setPosDialog] = useState<PosDialog>(null);
  const [toast, setToast] = useState<Toast>(null);
  const mainRef = useRef<HTMLElement>(null);

  const showToast = useCallback((message: string, kind: 'ok' | 'error' = 'ok') => setToast({ message, kind, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const go = useCallback((p: Page) => {
    lastPage = p;
    setPage(p);
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  const exportBackup = useCallback(async () => {
    try {
      const date = todayISO();
      const content = JSON.stringify({ ...data, settings: { ...data.settings, lastBackup: date } }, null, 2);
      const label = space.kind === 'personal' ? '' : `-${space.name.replace(/[^p{L}p{N}]+/gu, '-').toLowerCase()}`;
      const path = await saveTextFile(`budget-tracker-backup${label}-${date}.json`, content, 'application/json');
      if (!path) return;
      update((d) => ({ ...d, settings: { ...d.settings, lastBackup: date } }));
      showToast('Backup saved');
    } catch (err) {
      showToast(`Couldn't save the backup: ${(err as Error).message}`, 'error');
    }
  }, [data, update, showToast, space]);

  const importCsv = useCallback(async () => {
    try {
      const file = await openTextFile(['csv', 'txt']);
      if (!file) return;
      const r = importCSV(data, file.content);
      let summary = `Imported ${r.added} transaction${r.added === 1 ? '' : 's'}`;
      if (r.duplicates) summary += ` · ${r.duplicates} duplicate${r.duplicates === 1 ? '' : 's'} skipped`;
      if (r.invalid) summary += ` · ${r.invalid} row${r.invalid === 1 ? '' : 's'} unreadable`;
      if (r.added) update(() => r.data);
      showToast(summary, r.added ? 'ok' : 'error');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [data, update, showToast]);

  const loadSample = useCallback(() => {
    if (space.kind !== 'personal') {
      showToast('Sample data can only be loaded in your Personal space.', 'error');
      return;
    }
    if (data.transactions.length && !window.confirm('Replace all your current data with sample data? Export a backup first if you want to keep it.')) return;
    update((d) => ({ ...sampleData(), notes: d.notes }));
    setMonth(monthOf(todayISO()));
    showToast('Sample data loaded');
  }, [data.transactions.length, update, showToast, space.kind]);

  const ui: UI = useMemo(
    () => ({
      page,
      go,
      month,
      setMonth,
      addTx: (type: TxType = 'expense', date?: string) => setTxDialog({ tx: null, type, date }),
      editTx: (tx: Transaction) => setTxDialog({ tx, type: tx.type }),
      addCategory: (type: TxType) => setCatDialog({ cat: null, type }),
      editCategory: (cat: Category) => setCatDialog({ cat, type: cat.type }),
      addPosition: (accountId?: string) => setPosDialog({ position: null, accountId }),
      editPosition: (position: Position) => setPosDialog({ position }),
      toast: showToast,
      exportBackup,
      importCsv,
      loadSample,
      newSpace: () => setSpaceDialog({ kind: 'new' }),
      joinSpace: async () => {
        try {
          const pack = await pickPack();
          if (pack) setSpaceDialog({ kind: 'join', pack });
        } catch (err) {
          showToast((err as Error).message, 'error');
        }
      },
    }),
    [page, go, month, showToast, exportBackup, importCsv, loadSample]
  );

  const today = todayISO();
  const defaultDate = monthOf(today) === month ? today : `${month}-01`;

  return (
    <UICtx.Provider value={ui}>
      {window.desktop?.customTitleBar && <TitleBar />}
      <div className={`app ${window.desktop?.customTitleBar ? "framed" : ""}`}>
        <Sidebar />
        <main className="main" ref={mainRef}>
          {page === 'overview' && <Overview />}
          {page === 'transactions' && <Transactions />}
          {page === 'calendar' && <Calendar />}
          {page === 'budgets' && <Budgets />}
          {page === 'portfolio' && <Portfolio />}
          {page === 'reports' && <Reports />}
          {page === 'advisor' && <Advisor />}
          {page === 'together' && <Together />}
          {page === 'notes' && <Notes />}
          {page === 'settings' && <Settings />}
        </main>
      </div>

      {txDialog && (
        <TransactionDialog
          tx={txDialog.tx}
          defaultType={txDialog.type}
          defaultDate={txDialog.date ?? defaultDate}
          onClose={() => setTxDialog(null)}
          onSaved={(m) => showToast(m)}
        />
      )}
      {spaceDialog?.kind === 'new' && <NewSpaceDialog onClose={() => setSpaceDialog(null)} onDone={(m) => showToast(m)} />}
      {spaceDialog?.kind === 'join' && <JoinSpaceDialog pack={spaceDialog.pack} onClose={() => setSpaceDialog(null)} onDone={(m) => showToast(m)} />}
      {catDialog && <CategoryDialog cat={catDialog.cat} type={catDialog.type} onClose={() => setCatDialog(null)} onSaved={(m) => showToast(m)} />}

      {posDialog && (
        <PositionDialog
          position={posDialog.position}
          accountId={posDialog.accountId}
          onClose={() => setPosDialog(null)}
          onSaved={(m) => showToast(m)}
        />
      )}

      <UpdateBanner />
      <div aria-live="polite" role="status">
        {toast && (
          <div key={toast.id} className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>
            <Icon name={toast.kind === 'error' ? 'alert' : 'check'} size={18} strokeWidth={2.2} />
            {toast.message}
          </div>
        )}
      </div>
    </UICtx.Provider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <MarketProvider>
        <Shell />
      </MarketProvider>
    </StoreProvider>
  );
}
