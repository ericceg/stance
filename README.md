# PersPort

PersPort is a lightweight, single-user investment portfolio tracker with CHF as its reporting currency. It is local-first: SQLite holds the portfolio ledger, broker credentials remain server-side, and imported statements are parsed without being retained on disk.

> All repository data is fictional. Local databases, environment files, uploaded CSVs, account identifiers, and broker credentials are excluded from Git.

## What works

- Transaction-led portfolio accounting for buys, sells, dividends, deposits, withdrawals, and fees
- Weighted-average cost basis, partial and full sells, realized/unrealized P&L, cash, and contribution-aware absolute P&L
- Original-currency and stored CHF values on every transaction
- Aggregated holdings with broker-level breakdowns
- Sortable holdings table, allocation views, seeded snapshot chart, and responsive dark-mode UI
- Position detail pages with identification, pricing, broker allocation, and transaction history
- Manual transaction creation and deletion with server-side validation
- Data-quality checks for missing prices, FX rates, ISINs, invalid transactions, and oversold positions
- Replaceable, read-only `BrokerProvider` and `MarketDataProvider` contracts
- Read-only Trading 212 sync for order fills, dividends, cash movements, open positions, and current prices
- DEGIRO Transaction and Account statement CSV preview/import with localized-number support
- Idempotent broker ingestion using external IDs and stable row fingerprints
- Unit tests covering the important accounting paths

## Architecture

The App Router renders portfolio reads on the server. UI mutations use Server Actions, so the browser never receives database access or secrets. Prisma is the typed persistence boundary; SQLite is used for the local version and can later be replaced by PostgreSQL without changing the accounting engine.

```text
Prisma / SQLite
      │
      ▼
portfolio service ── provider interfaces (broker / market data)
      │
      ▼
pure accounting engine
      │
      ▼
server-rendered routes + focused client charts/tables/forms
```

Positions are never manually stored. They are derived in timestamp order from transactions. A buy adds its fee to cost basis; a sell releases weighted-average cost and realizes the difference after fees. Deposits and withdrawals change contributions and cash but never investment P&L. Materially invalid rows, such as an oversell, are excluded and surfaced as a data issue instead of being silently guessed.

## Database schema

The complete schema is in [`prisma/schema.prisma`](./prisma/schema.prisma).

| Model | Purpose |
| --- | --- |
| `Security` | Canonical security identity, preferably by ISIN, plus exchange/currency and editable provider ticker fields |
| `SecurityAlias` | Broker symbols and source IDs mapped to the canonical security |
| `BrokerAccount` | Broker/account identity and base currency |
| `Transaction` | Immutable accounting inputs with local and CHF values, import source, and duplicate-detection fields |
| `PriceQuote` | Last known mock/current price, previous close, CHF rate, provider, and timestamp |
| `PortfolioSnapshot` | Periodic CHF portfolio value, cost, cash, and P&L totals |

Transactions have indexes for account/security timelines. Imported records can be deduplicated by broker/source external ID or by an importer-generated fingerprint.

## Project structure

```text
prisma/
  migrations/             committed database migrations
  schema.prisma           relational data model
  seed.ts                 fictional accounts, trades, quotes, and snapshots
scripts/
  ensure-db.mjs           creates the ignored local SQLite file when absent
src/
  app/                    App Router pages and transaction Server Actions
  components/             dashboard, charts, tables, shell, and forms
  lib/
    portfolio/            pure accounting, types, service, and tests
    import/               DEGIRO parsing/import and Trading 212 synchronization
    providers/            replaceable broker and market-data contracts
    db.ts                 server-only Prisma client
```

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `db:setup` creates the ignored database, applies committed migrations, and loads fictional sample data. Re-running `npm run db:seed` resets the local database to that fictional dataset.

Useful commands:

```bash
npm test          # accounting unit tests
npm run lint      # ESLint
npm run build     # production build
npm run check     # lint + tests + build
npm run db:studio # inspect the local data
```

## Environment and repository safety

Copy `.env.example` to `.env`. Never put a real key in the example file or in a `NEXT_PUBLIC_*` variable. Trading 212 credentials remain server-side and the provider contract intentionally has no trade-placement method.

### Trading 212 sync

1. In Trading 212, open **Settings → API (Beta)** and generate a key pair with read access to account data, portfolio, and history. Do not grant order permissions to PersPort.
2. Put the pair in `.env` as `TRADING212_API_KEY` and `TRADING212_API_SECRET`. Set `TRADING212_ENVIRONMENT` to `live` or `demo`.
3. Restart the development server, open **Import**, and select **Sync now**. For a non-CHF account, enter the account-currency/CHF conversion rate requested by the form.

The sync imports completed trade fills, paid dividends, deposits, withdrawals, account fees, and interest. Internal transfers and unsupported corporate-action fills are deliberately skipped. Open positions also refresh Trading 212-backed current prices. Re-running sync is safe because imported records retain their Trading 212 references.

### DEGIRO import

Export either report from DEGIRO’s Inbox in CSV format:

- **Transaction statement** for buys, sells, execution prices, and transaction fees
- **Account statement** for deposits, withdrawals, dividends, interest, withholding tax, and other fees

Open **Import**, choose the DEGIRO account and CSV, review the local preview, then import. Trade-settlement cash rows in Account statements are ignored to avoid double-counting trades. If the account base currency is not CHF, supply its CHF rate; transaction statements that already contain CHF values use their row-specific conversion instead. The uploaded file is never saved, and stable fingerprints make overlapping exports safe to import.

The `.gitignore` excludes `.env`, SQLite files, private/upload directories, portfolio CSV exports, logs, and build output. Before publishing screenshots, reset with `npm run db:seed` so only fictional data is visible.

## Next milestone

The next work is a replaceable live market-data and historical-FX source for holdings that are not priced by Trading 212, plus security/ticker editing and merging, transaction editing, historical security charts, and time-/money-weighted returns.

## Assumptions

- One trusted local user; no authentication or tenancy
- CHF is the only reporting currency
- Weighted average cost is used for position accounting
- Transaction CHF values preserve the FX rate at the time of the transaction; current valuations use the quote's current CHF rate
- Dividends are included in realized P&L, while deposits and withdrawals are external cash flows
- SQLite is for local use. A Vercel deployment should switch `DATABASE_URL` to PostgreSQL or another persistent hosted database because serverless local files are not durable
