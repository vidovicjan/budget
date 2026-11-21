import { createContext, useContext } from 'react';
import type { Category, Position, Transaction, TxType } from './lib/types';

export type Page = 'overview' | 'transactions' | 'calendar' | 'budgets' | 'portfolio' | 'reports' | 'advisor' | 'together' | 'notes' | 'settings';

export interface UI {
  page: Page;
  go: (p: Page) => void;
  /** Selected month, YYYY-MM. */
  month: string;
  setMonth: (m: string) => void;
  addTx: (type?: TxType, date?: string) => void;
  editTx: (tx: Transaction) => void;
  addCategory: (type: TxType) => void;
  editCategory: (cat: Category) => void;
  addPosition: (accountId?: string) => void;
  editPosition: (p: Position) => void;
  toast: (message: string, kind?: 'ok' | 'error') => void;
  exportBackup: () => void;
  importCsv: () => void;
  loadSample: () => void;
  /** Shared spaces */
  newSpace: () => void;
  joinSpace: () => void;
}

export const UICtx = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(UICtx);
  if (!ui) throw new Error('useUI outside provider');
  return ui;
}
