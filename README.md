# PersPort

PersPort is a lightweight, single-user investment portfolio tracker with CHF as its reporting currency. Milestone 1 is deliberately local-first: it uses a SQLite database, fictional seed data, and mock prices while keeping the accounting core independent from the UI and future broker or market-data integrations.

> All repository data is fictional. Local databases, environment files, uploaded CSVs, account identifiers, and broker credentials are excluded from Git.

## What works in Milestone 1

- Transaction-led portfolio accounting for buys, sells, dividends, deposits, withdrawals, and fees
- Weighted-average cost basis, partial and full sells, realized/unrealized P&L, cash, and contribution-aware absolute P&L
- Original-currency and stored CHF values on every transaction
- Aggregated holdings with broker-level breakdowns
- Sortable holdings table, allocation views, seeded snapshot chart, and responsive dark-mode UI
- Position detail pages with identification, pricing, broker allocation, and transaction history
- Manual transaction creation and deletion with server-side validation
- Data-quality checks for missing prices, FX rates, ISINs, invalid transactions, and oversold positions
- Replaceable, read-only `BrokerProvider` and `MarketDataProvider` contracts
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

Copy `.env.example` to `.env`. Never put a real key in the example file or in a `NEXT_PUBLIC_*` variable. The planned Trading 212 key remains server-side and the provider contract intentionally has no trade-placement method.

The `.gitignore` excludes `.env`, SQLite files, private/upload directories, portfolio CSV exports, logs, and build output. Before publishing screenshots, reset with `npm run db:seed` so only fictional data is visible.

## Next milestone

Milestone 2 will implement the `MarketDataProvider` boundary with replaceable quote and FX sources, a persisted freshness-aware price cache, bulk quote refresh, last-known-price fallback, and configurable dashboard polling. Historical security-price charts, transaction editing, security/ticker editing and merging, DEGIRO CSV preview/import, Trading 212 sync, and time-/money-weighted returns remain intentionally out of scope for this first milestone.

## Assumptions

- One trusted local user; no authentication or tenancy
- CHF is the only reporting currency
- Weighted average cost is used for position accounting
- Transaction CHF values preserve the FX rate at the time of the transaction; current valuations use the quote's current CHF rate
- Dividends are included in realized P&L, while deposits and withdrawals are external cash flows
- SQLite is for local use. A Vercel deployment should switch `DATABASE_URL` to PostgreSQL or another persistent hosted database because serverless local files are not durable
