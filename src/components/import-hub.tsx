"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowDownToLine, CheckCircle2, FileSearch, LoaderCircle, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  importDegiroAction,
  syncTrading212Action,
  type DegiroImportState,
  type Trading212SyncState,
} from "@/app/import/actions";
import { parseDegiroCsv } from "@/lib/import/degiro";

const initialDegiroState: DegiroImportState = {};
const initialTrading212State: Trading212SyncState = {};
const previewDateFormatter = new Intl.DateTimeFormat("en-CH");

interface AccountOption {
  id: string;
  accountName: string;
  baseCurrency: string;
}

function ResultBanner({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div className={error ? "import-result is-error" : "import-result"} role={error ? "alert" : "status"}>
      {error ? <TriangleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}

function Trading212Sync({ configured, lastSync }: { configured: boolean; lastSync: string | null }) {
  const [state, action, pending] = useActionState(syncTrading212Action, initialTrading212State);
  return (
    <section className="page-card integration-card">
      <div className="integration-heading">
        <div className="integration-logo t212-logo">212</div>
        <div><p>Live connection</p><h2>Trading 212</h2></div>
        <span className={configured ? "connection-state is-ready" : "connection-state"}>{configured ? "Ready" : "Setup needed"}</span>
      </div>
      <p className="integration-copy">Pull completed order fills, dividends, deposits, withdrawals, fees, open positions, and current prices through Trading 212&apos;s read-only API.</p>
      {!configured ? (
        <div className="setup-callout">
          <strong>Add your read-only key pair to <code>.env</code></strong>
          <small><code>TRADING212_API_KEY</code> + <code>TRADING212_API_SECRET</code>, then restart the app. Choose the live or demo API with <code>TRADING212_ENVIRONMENT</code>.</small>
        </div>
      ) : null}
      {state.error ? <ResultBanner error>{state.error}</ResultBanner> : null}
      {state.report ? (
        <ResultBanner>
          Imported {state.report.imported} new records, skipped {state.report.duplicates} duplicates, and refreshed {state.report.quotesUpdated} prices.
        </ResultBanner>
      ) : null}
      <form action={action} className="integration-form">
        <div className="field">
          <label htmlFor="trading212-rate">Account currency/CHF rate <span>Only needed for non-CHF accounts</span></label>
          <input id="trading212-rate" inputMode="decimal" min="0" name="accountToChfRate" placeholder="e.g. 0.9400" step="any" type="number" />
        </div>
        <button className="primary-button" disabled={pending || !configured} type="submit">
          {pending ? <><LoaderCircle className="spin" />Synchronizing…</> : <><RefreshCw />Sync now</>}
        </button>
      </form>
      <div className="integration-meta">
        <ShieldCheck aria-hidden="true" />
        <span><strong>Read-only by design</strong><small>{lastSync ? `Last imported record ${lastSync}` : "Credentials stay in your server-side .env file."}</small></span>
      </div>
    </section>
  );
}

function DegiroImport({ accounts, lastImport }: { accounts: AccountOption[]; lastImport: string | null }) {
  const [state, action, pending] = useActionState(importDegiroAction, initialDegiroState);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "new");
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const [newBaseCurrency, setNewBaseCurrency] = useState("CHF");
  const baseCurrency = selectedAccount?.baseCurrency ?? newBaseCurrency;
  const [rate, setRate] = useState(baseCurrency === "CHF" ? "1" : "");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!fileText) return { result: null, error: null };
    try {
      return {
        result: parseDegiroCsv(fileText, {
          accountBaseCurrency: baseCurrency,
          accountToChfRate: rate ? Number(rate) : undefined,
        }),
        error: null,
      };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : "The CSV could not be previewed." };
    }
  }, [baseCurrency, fileText, rate]);

  function selectAccount(nextAccountId: string) {
    setAccountId(nextAccountId);
    const currency = accounts.find((account) => account.id === nextAccountId)?.baseCurrency ?? newBaseCurrency;
    setRate(currency === "CHF" ? "1" : "");
  }

  return (
    <section className="page-card integration-card degiro-card">
      <div className="integration-heading">
        <div className="integration-logo degiro-logo">D</div>
        <div><p>CSV statements</p><h2>DEGIRO</h2></div>
        <span className="connection-state is-ready">Local import</span>
      </div>
      <p className="integration-copy">Import trades from a Transaction statement and cash movements, dividends, and fees from an Account statement. The file is validated before anything is saved.</p>
      {state.error ? <ResultBanner error>{state.error}</ResultBanner> : null}
      {state.report ? (
        <ResultBanner>
          Imported {state.report.imported} new records and skipped {state.report.duplicates} duplicates from the {state.report.statementKind} statement.
        </ResultBanner>
      ) : null}
      <form action={action} className="degiro-form">
        <div className="field-grid import-fields">
          <div className="field">
            <label htmlFor="degiro-account">Broker account</label>
            <select id="degiro-account" name="brokerAccountId" onChange={(event) => selectAccount(event.target.value)} value={accountId}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.accountName} · {account.baseCurrency}</option>)}
              <option value="new">Create another account…</option>
            </select>
          </div>
          {accountId === "new" ? <>
            <div className="field">
              <label htmlFor="degiro-account-name">Account name</label>
              <input defaultValue="Personal" id="degiro-account-name" name="accountName" required />
            </div>
            <div className="field">
              <label htmlFor="degiro-base-currency">Base currency</label>
              <input id="degiro-base-currency" maxLength={3} name="baseCurrency" onChange={(event) => {
                const currency = event.target.value.toUpperCase();
                setNewBaseCurrency(currency);
                setRate(currency === "CHF" ? "1" : "");
              }} value={newBaseCurrency} required />
            </div>
          </> : <>
            <input name="accountName" type="hidden" value={selectedAccount?.accountName ?? "Personal"} />
            <input name="baseCurrency" type="hidden" value={baseCurrency} />
          </>}
          <div className="field">
            <label htmlFor="degiro-rate">{baseCurrency}/CHF rate <span>{baseCurrency === "CHF" ? "Fixed" : "Fallback for this import"}</span></label>
            <input id="degiro-rate" inputMode="decimal" min="0" name="accountToChfRate" onChange={(event) => setRate(event.target.value)} readOnly={baseCurrency === "CHF"} required={baseCurrency !== "CHF"} step="any" type="number" value={rate} />
          </div>
          <div className="field field-span">
            <label htmlFor="degiro-statement">DEGIRO CSV statement</label>
            <label className="file-picker" htmlFor="degiro-statement">
              <ArrowDownToLine aria-hidden="true" />
              <span><strong>{fileName || "Choose a CSV file"}</strong><small>Transaction statement or Account statement · 10 MB maximum</small></span>
            </label>
            <input accept=".csv,text/csv" className="visually-hidden" id="degiro-statement" name="statement" onChange={async (event) => {
              const file = event.target.files?.[0];
              setFileName(file?.name ?? "");
              if (file && file.size > 10 * 1024 * 1024) {
                setFileError("The CSV is larger than the 10 MB import limit.");
                setFileText("");
                return;
              }
              setFileError(null);
              setFileText(file ? await file.text() : "");
            }} required type="file" />
          </div>
        </div>

        {fileError || preview.error ? <ResultBanner error>{fileError ?? preview.error}</ResultBanner> : null}
        {preview.result ? (
          <div className="import-preview">
            <div className="preview-heading">
              <span><FileSearch aria-hidden="true" /><strong>{preview.result.rows.length} importable rows</strong></span>
              <small>{preview.result.kind === "transactions" ? "Transaction statement" : "Account statement"} · {preview.result.ignoredRows} ignored</small>
            </div>
            <div className="table-scroll">
              <table className="data-table preview-table">
                <thead><tr><th>Date</th><th>Type</th><th>Security</th><th className="numeric">Quantity</th><th className="numeric">Original value</th><th className="numeric">CHF value</th></tr></thead>
                <tbody>{preview.result.rows.slice(0, 8).map((row) => (
                  <tr key={`${row.rowNumber}-${row.externalId ?? "row"}`}>
                    <td>{previewDateFormatter.format(new Date(row.occurredAt))}</td>
                    <td>{row.type}</td>
                    <td>{row.product ?? "Cash"}</td>
                    <td className="numeric mono">{row.quantity ?? "—"}</td>
                    <td className="numeric mono">{row.totalValue.toFixed(2)} {row.transactionCurrency}</td>
                    <td className="numeric mono">{row.totalValueChf.toFixed(2)} CHF</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {preview.result.rows.length > 8 ? <small className="preview-more">+ {preview.result.rows.length - 8} more rows will be imported</small> : null}
          </div>
        ) : null}

        <div className="import-actions">
          <span>{lastImport ? `Last imported record ${lastImport}` : "Repeated files are safe: duplicates are skipped."}</span>
          <button className="primary-button" disabled={pending || !preview.result || preview.result.rows.length === 0} type="submit">
            {pending ? <><LoaderCircle className="spin" />Importing…</> : <><ArrowDownToLine />Import statement</>}
          </button>
        </div>
      </form>
    </section>
  );
}

export function ImportHub(props: {
  accounts: AccountOption[];
  trading212Configured: boolean;
  lastTrading212Sync: string | null;
  lastDegiroImport: string | null;
}) {
  return (
    <div className="integrations-grid">
      <Trading212Sync configured={props.trading212Configured} lastSync={props.lastTrading212Sync} />
      <DegiroImport accounts={props.accounts} lastImport={props.lastDegiroImport} />
    </div>
  );
}
