# Budget Tracker

Desktop budget tracker (Electron + React + TypeScript + Vite), built from the
"Budget Tracker Design" canvas. All data is stored locally in IndexedDB inside
the app's profile folder. The only network traffic is optional live prices
(see Portfolio below): only coin ids and ticker symbols are sent, never amounts.

## Run

```sh
npm install
npm run dev     # Vite dev server + Electron window with hot reload
npm start       # production build, then open it in Electron
npm run dist    # Windows installer in release/
npm run web     # browser-only dev server (no native file dialogs)
```

Dev mode (`127.0.0.1:5173`) and the built app (`file://`) keep **separate** data,
so use Export/Restore backup to move data between them.

## Features

- **Overview**: balance, income, expenses, left to spend, a 6M / 12M / YTD cash-flow chart, a
  category donut, top budgets and recent transactions.
- **Transactions**: monthly list with search, category and account filters, pagination,
  a daily spending chart, and click-to-edit or delete.
- **Budgets**: monthly limit per expense category, budget vs. actual, per-day allowance.
- **Portfolio**: crypto and stock/ETF positions in investment accounts (e.g. "Crypto", "Brokerage"),
  valued at live prices every 2 minutes, with 24h change, profit/loss vs. your average buy price and
  allocation. The Overview shows every account plus net worth (cash + investments).
  Free, key-less sources: CoinGecko (crypto), Yahoo Finance (stocks/ETFs, unofficial endpoint),
  ExchangeRate-API (currency conversion). Requests go through the main process and only those hosts are
  allowed (`electron/main.cjs`). Turn live prices off in Settings to stay fully offline.
- **Reports**: yearly totals, savings rate, a monthly breakdown and categories for the year.
- **Settings**: currency, accounts and opening balances, income categories, JSON
  backup and restore, CSV import and export, sample data, erase everything.
- **Repeat every month**: a transaction marked this way is copied into each later
  month, on the same day, as that month arrives.

## Shared spaces (couples, families, friends)

- **Spaces**: Personal plus any number of shared spaces (space menu at the top of the sidebar). Each space is its own budget, stored under `space:<id>`; the list lives in `workspace`. Data from before spaces existed moves into Personal on first start (the old `data` key is kept).
- **Members, paid by, split**: in a shared space every transaction records who paid and how it splits (equally, by percentage, or not shared). The **Together** page shows balances, who owes whom (fewest payments), settle-up payments, members and sharing.
- **Sharing today: space files** (`.budgetspace`). Invite = save a file and send it; the other person uses *Join from an invite file*. Afterwards *Send my changes* / *Open their file* merges copies.

### For cloud sync later

| File | What it does |
| --- | --- |
| `src/sync/records.ts` | Every record gets `updatedAt`; deletions go to `data.deleted`. `stampChanges` runs on every store update; `mergeSpaces` merges two copies (newest edit per record wins, deletes win over older edits, duplicate repeat copies collapse). |
| `src/sync/provider.ts` | `SyncProvider` interface the UI talks to (`invite`, `readInvite`, `sync`, optional `subscribe`/`push`). `getProvider()` picks the implementation. |
| `src/sync/file.ts` | The current provider: space files. |
| `src/sync/firebase.ts` | Plan for the Firebase provider: Firestore layout, security rules, invite codes, what `subscribe`/`push` do. |
| `src/lib/spaces.ts` | Space list, `SpaceSync.mode` (`none`/`file`/`cloud`), `Member.uid`/`email` reserved for accounts. |
| `src/store.tsx` | `mergeRemote(spaceId, data)`: where remote changes enter, open space or not. |

Merging is per record: if two people edit the same transaction before syncing, the later edit wins as a whole.

## CSV import

A header row is required, with at least `Date` and `Amount`. These columns are optional:
`Description` (also `Payee`, `Merchant`, …), `Category`, `Account`, `Type`, `Note`.
Negative amounts count as expenses unless a `Type` column says otherwise.
Dates can be `YYYY-MM-DD`, `MM/DD/YYYY` or `DD.MM.YYYY`. Commas or semicolons both work.
Categories and accounts that don't exist yet are created. Rows that were already
imported are skipped.

## Layout

```
electron/   main process (window, save/open dialogs) + preload bridge
src/lib/    data model, IndexedDB storage, CSV, sample data, formatting
src/components/  sidebar, dialogs, SVG charts
src/pages/  Overview, Transactions, Budgets, Reports, Settings
```

## Releasing an update

Installed apps (1.3.0 and newer) check GitHub Releases of  a few seconds after start and every 4 hours, download a newer version in the background, then offer "Restart now" (or install on next quit). Settings → General shows the version and a "Check for updates" button.

**Automatic (recommended):** commit your changes, then run

\
> budget-tracker@1.3.0 ship
> npm version patch -m "Release %s" && git push --follow-tags
That bumps the version (1.3.0 → 1.3.1), commits, tags  and pushes. GitHub Actions () then builds the installer on Windows and publishes the release with the .exe, .blockmap and latest.yml, in about 5 minutes. Watch it under the repo's **Actions** tab. For a bigger jump use  (1.3.x → 1.4.0) and .

**By hand:** bump  in package.json, , then on GitHub create release  and upload , its  and .

Pushing code without a new tag never updates anyone. The repo must stay public, otherwise installed apps can't download updates.
