export type TxType = 'expense' | 'income';

export type AccountKind = 'cash' | 'investment';

export interface Account {
  id: string;
  name: string;
  /** 'investment' accounts (crypto, brokerage) hold positions valued at live prices. */
  kind: AccountKind;
  /** Balance the account had before the first tracked transaction. */
  openingBalance: number;
  /** Last change (ms). Used to merge copies of a shared space; set automatically. */
  updatedAt?: number;
}

export type AssetType = 'crypto' | 'stock';

/** A holding in an investment account, e.g. 0.25 BTC or 10 shares of VOO. */
export interface Position {
  id: string;
  accountId: string;
  assetType: AssetType;
  /** CoinGecko coin id ("bitcoin") or Yahoo Finance symbol ("VOO"). */
  sourceId: string;
  /** Ticker shown in the app: BTC, VOO. */
  symbol: string;
  name: string;
  quantity: number;
  /** Average buy price per unit in the portfolio currency (settings.portfolioCurrency). 0 = unknown. */
  avgPrice: number;
  /** Last change (ms). Used to merge copies of a shared space; set automatically. */
  updatedAt?: number;
}

export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: string;
  /** Monthly spending limit. 0 = no limit set. Only used for expense categories. */
  budget: number;
  /** Last change (ms). Used to merge copies of a shared space; set automatically. */
  updatedAt?: number;
}

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

/** Repeat every `every` `unit`s, e.g. { every: 2, unit: 'week' } = bi-weekly. */
export interface Repeat {
  every: number;
  unit: RepeatUnit;
}

/**
 * How a shared expense is divided between members.
 *  - equal:    everyone in `members` (or all members when empty) pays the same part
 *  - shares:   `shares` holds each member's percentage (adds up to 100)
 *  - personal: not shared; only the payer's own spending
 */
export interface Split {
  mode: 'equal' | 'shares' | 'personal';
  /** equal: who shares it (empty = everyone). */
  members?: string[];
  /** shares: memberId -> percent. */
  shares?: Record<string, number>;
}

/** A person in a shared space. */
export interface Member {
  id: string;
  name: string;
  color: string;
  role: 'owner' | 'member';
  /** For future cloud invites. */
  email?: string;
  /** invited = added by someone else, hasn't joined from their own device yet. */
  status: 'active' | 'invited';
  /** Cloud account id once accounts exist (e.g. Firebase uid). */
  uid?: string;
  updatedAt?: number;
}

/** Money paid from one member to another to even out balances. */
export interface Settlement {
  id: string;
  date: string;
  from: string;
  to: string;
  amount: number;
  note: string;
  created: number;
  updatedAt?: number;
}

export interface Transaction {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  description: string;
  /** Always positive; `type` carries the direction. */
  amount: number;
  type: TxType;
  /** Empty string or an id that no longer exists = Uncategorized. */
  categoryId: string;
  accountId: string;
  note: string;
  /** When set, this transaction is copied forward on this schedule (it is the template). */
  repeat: Repeat | null;
  /** Set on copies generated from a repeating transaction. */
  sourceId?: string;
  /** Set on payments generated from a subscription / bill. */
  serviceId?: string;
  created: number;
  /** Shared spaces: the member who paid (expense) or received the money (income). */
  paidBy?: string;
  /** Shared spaces: how an expense is divided. Missing = split equally between all members. */
  split?: Split;
  /** Last change (ms). Used to merge copies of a shared space; set automatically. */
  updatedAt?: number;
}

export type Frequency = 'monthly' | 'yearly';

/** A subscription or bill paid on a schedule, e.g. a streaming service in "Subscriptions". */
export interface Service {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  accountId: string;
  frequency: Frequency;
  /** First payment, YYYY-MM-DD. Later payments fall on the same day (and month, if yearly). */
  startDate: string;
  /** Add each payment to transactions automatically when it falls due. */
  autoAdd: boolean;
  /** Last change (ms). Used to merge copies of a shared space; set automatically. */
  updatedAt?: number;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  currency: string;
  lastBackup: string | null;
  /** Fetch live prices for investment positions. */
  livePrices: boolean;
  /** Currency for portfolio prices, values and buy prices (crypto is usually tracked in USD). */
  portfolioCurrency: string;
  /** Light, dark, or follow Windows. Device-wide since spaces exist; see Workspace.device. */
  theme: ThemePref;
  updatedAt?: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  /** Last edit, ms since epoch. */
  updated: number;
  /** Last change (ms). Used to merge copies of a shared space; set automatically. */
  updatedAt?: number;
}

export interface AppData {
  version: 1;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  services: Service[];
  positions: Position[];
  notes: Note[];
  settings: Settings;
  /** `${sourceId}:${YYYY-MM}` of repeat copies the user deleted, so they are not recreated. */
  recurringSkips: string[];
  /** People in this space. Empty in a personal space. */
  members: Member[];
  settlements: Settlement[];
  /**
   * Deleted records, "<collection>:<id>" -> when (ms). Lets a merge tell "deleted here"
   * from "added there". Filled automatically by the store; old entries are pruned.
   */
  deleted: Record<string, number>;
}
