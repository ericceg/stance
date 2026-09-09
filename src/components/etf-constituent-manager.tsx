"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { refreshUnderlyingHoldingsAction, restoreAutomaticUnderlyingHoldingsAction, saveManualUnderlyingHoldingsAction, type RegionalExposureActionState } from "@/app/breakdown/actions";
import type { DashboardData } from "@/lib/portfolio/service";

type Position = DashboardData["positions"][number];
const initialState: RegionalExposureActionState = {};

function Result({ state }: { state: RegionalExposureActionState }) {
  if (!state.error && !state.message) return null;
  return <div className={state.error ? "import-result is-error" : "import-result"} role={state.error ? "alert" : "status"}>
    {state.error ? <TriangleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
    <span>{state.error ?? state.message}</span>
  </div>;
}

export function EtfConstituentManager({ positions }: { positions: Position[] }) {
  const etfs = positions.filter((position) => position.security.assetType === "ETF");
  const [selectedId, setSelectedId] = useState(etfs[0]?.securityId ?? "");
  const selected = useMemo(() => etfs.find((position) => position.securityId === selectedId), [etfs, selectedId]);
  const [state, action, pending] = useActionState(saveManualUnderlyingHoldingsAction, initialState);
  const [refreshState, refreshAction, refreshPending] = useActionState(refreshUnderlyingHoldingsAction, initialState);
  const [restoreState, restoreAction, restorePending] = useActionState(restoreAutomaticUnderlyingHoldingsAction, initialState);
  if (etfs.length === 0) return null;
  const constituentText = selected?.underlyingHoldings.map((holding) => `${holding.ticker}, ${holding.name}, ${holding.weight}`).join("\n") ?? "";
  const coverage = selected?.underlyingHoldings.reduce((total, holding) => total + holding.weight, 0) ?? 0;
  const source = selected?.underlyingHoldings[0];

  return <section className="panel constituent-data-panel">
    <div className="section-heading constituent-data-heading"><div><p>ETF constituents</p><h2>Stock look-through data</h2></div><form action={refreshAction}><button className="secondary-button" disabled={refreshPending} type="submit">{refreshPending ? <LoaderCircle className="spin" /> : <RefreshCw />}Refresh automatically</button></form></div>
    <div className="constituent-data-copy">Stance fetches issuer holdings by default for supported ETFs. Paste a factsheet or issuer export below only when a fund is unsupported, or to keep a manual override.</div>
    <Result state={refreshState} />
    <form action={action} className="constituent-editor" key={`${selectedId}-${selected?.underlyingHoldings[0]?.updatedAt ?? "empty"}`}>
      <input name="securityId" type="hidden" value={selectedId} />
      <div className="field"><label htmlFor="constituent-security">ETF</label><select id="constituent-security" onChange={(event) => setSelectedId(event.target.value)} value={selectedId}>{etfs.map((position) => <option key={position.securityId} value={position.securityId}>{position.security.ticker} · {position.security.name}</option>)}</select><small>{selected?.underlyingHoldings.length ?? 0} constituents · {coverage.toFixed(2)}% coverage · {source ? `${source.source === "MANUAL" ? "Manual override" : "Automatic"}${source.asOf ? ` · as of ${new Intl.DateTimeFormat("en-CH").format(new Date(source.asOf))}` : ""}` : "No data yet"}</small></div>
      <div className="field"><label htmlFor="constituents">Constituents <span>Ticker, Company name, Weight (%)</span></label><textarea defaultValue={constituentText} id="constituents" name="constituents" placeholder={"MSFT, Microsoft Corporation, 4.12\nNVDA, NVIDIA Corporation, 3.88"} rows={7} /><small>Comma- or tab-separated. Partial lists are supported and their coverage is shown in the breakdown.</small></div>
      <div className="constituent-editor-actions">{source?.source === "MANUAL" ? <button className="secondary-button" disabled={restorePending} formAction={restoreAction} name="securityId" value={selectedId} type="submit">Restore automatic</button> : null}<button className="primary-button" disabled={pending || !selectedId} type="submit">{pending ? <><LoaderCircle className="spin" />Saving…</> : "Save manual override"}</button></div>
    </form>
    <Result state={state} />
    <Result state={restoreState} />
  </section>;
}
