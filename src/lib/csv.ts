import type { AppData, Category, Transaction, TxType } from './types';
import { accountName, categoryLookup, nextColor, uid } from './data';
import { pad } from './dates';
import { parseAmount, round2 } from './format';

/** RFC 4180-style parser: quoted fields, escaped quotes, commas or semicolons, CRLF. */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US: MM/DD/YYYY
  if (m) return valid(+m[3], +m[1], +m[2]);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/); // European: DD.MM.YYYY
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const HEADERS: Record<string, string[]> = {
  date: ['date', 'transaction date', 'posted', 'posting date', 'booking date'],
  description: ['description', 'payee', 'name', 'merchant', 'memo', 'details', 'title'],
  amount: ['amount', 'value', 'sum'],
  category: ['category'],
  account: ['account'],
  type: ['type', 'kind'],
  note: ['note', 'notes', 'comment'],
};

export interface ImportResult {
  data: AppData;
  added: number;
  duplicates: number;
  invalid: number;
}

export function importCSV(d: AppData, text: string): ImportResult {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The file has no transaction rows.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (key: string) => head.findIndex((h) => HEADERS[key].includes(h));
  const ci = {
    date: col('date'),
    description: col('description'),
    amount: col('amount'),
    category: col('category'),
    account: col('account'),
    type: col('type'),
    note: col('note'),
  };
  if (ci.date < 0 || ci.amount < 0) {
    throw new Error('The first row must name the columns, with at least "Date" and "Amount".');
  }

  const categories: Category[] = [...d.categories];
  const accounts = [...d.accounts];
  const key = (t: Pick<Transaction, 'date' | 'amount' | 'type' | 'description'>) =>
    `${t.date}|${t.amount.toFixed(2)}|${t.type}|${t.description.trim().toLowerCase()}`;
  const seen = new Set(d.transactions.map(key));
  const added: Transaction[] = [];
  let duplicates = 0;
  let invalid = 0;
  let created = Date.now();

  for (const r of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const date = parseDate(get(ci.date));
    const value = parseAmount(get(ci.amount));
    if (!date || !Number.isFinite(value) || value === 0) {
      invalid++;
      continue;
    }
    const typeRaw = get(ci.type).toLowerCase();
    let type: TxType = value < 0 ? 'expense' : 'income';
    if (['expense', 'debit', 'withdrawal', 'out'].includes(typeRaw)) type = 'expense';
    if (['income', 'credit', 'deposit', 'in'].includes(typeRaw)) type = 'income';

    const catName = get(ci.category);
    let categoryId = '';
    if (catName) {
      let cat = categories.find((c) => c.type === type && c.name.toLowerCase() === catName.toLowerCase());
      if (!cat) {
        cat = { id: uid(), name: catName, type, budget: 0, color: nextColor({ ...d, categories }, type) };
        categories.push(cat);
      }
      categoryId = cat.id;
    }

    const accName = get(ci.account);
    let account = accName ? accounts.find((a) => a.name.toLowerCase() === accName.toLowerCase()) : accounts[0];
    if (!account) {
      account = { id: uid(), name: accName, kind: 'cash', openingBalance: 0 };
      accounts.push(account);
    }

    const t: Transaction = {
      id: uid(),
      date,
      description: get(ci.description) || catName || (type === 'income' ? 'Income' : 'Expense'),
      amount: round2(Math.abs(value)),
      type,
      categoryId,
      accountId: account.id,
      note: get(ci.note),
      repeat: null,
      created: created++,
    };
    const k = key(t);
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    added.push(t);
  }

  return {
    data: { ...d, categories, accounts, transactions: [...d.transactions, ...added] },
    added: added.length,
    duplicates,
    invalid,
  };
}

const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function exportCSV(d: AppData): string {
  const cat = categoryLookup(d);
  const lines = [['Date', 'Description', 'Category', 'Account', 'Type', 'Amount', 'Note'].join(',')];
  const sorted = [...d.transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created - b.created));
  for (const t of sorted) {
    const c = cat(t.categoryId);
    lines.push(
      [
        t.date,
        esc(t.description),
        esc(c.missing ? '' : c.name),
        esc(accountName(d, t.accountId)),
        t.type,
        (t.type === 'income' ? t.amount : -t.amount).toFixed(2),
        esc(t.note),
      ].join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}
