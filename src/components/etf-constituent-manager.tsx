"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { saveManualUnderlyingHoldingsAction, type RegionalExposureActionState } from "@/app/breakdown/actions";
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
  if (etfs.length === 0) return null;
  const constituentText = selected?.underlyingHoldings.map((holding) => `${holding.ticker}, ${holding.name}, ${holding.weight}`).join("\n") ?? "";
  const coverage = selected?.underlyingHoldings.reduce((total, holding) => total + holding.weight, 0) ?? 0;

  return <section className="panel constituent-data-panel">
    <div className="section-heading constituent-data-heading"><div><p>ETF constituents</p><h2>Stock look-through data</h2></div><span>Used in the Stocks breakdown</span></div>
    <div className="constituent-data-copy">Paste a fund’s holdings from its factsheet or issuer export. PersPort weights each constituent by your ETF position and combines it with your direct stocks.</div>
    <form action={action} className="constituent-editor" key={`${selectedId}-${selected?.underlyingHoldings[0]?.updatedAt ?? "empty"}`}>
      <input name="securityId" type="hidden" value={selectedId} />
      <div className="field"><label htmlFor="constituent-security">ETF</label><select id="constituent-security" onChange={(event) => setSelectedId(event.target.value)} value={selectedId}>{etfs.map((position) => <option key={position.securityId} value={position.securityId}>{position.security.ticker} · {position.security.name}</option>)}</select><small>{selected?.underlyingHoldings.length ?? 0} constituents · {coverage.toFixed(2)}% coverage</small></div>
      <div className="field"><label htmlFor="constituents">Constituents <span>Ticker, Company name, Weight (%)</span></label><textarea defaultValue={constituentText} id="constituents" name="constituents" placeholder={"MSFT, Microsoft Corporation, 4.12\nNVDA, NVIDIA Corporation, 3.88"} rows={7} /><small>Comma- or tab-separated. Partial lists are supported and their coverage is shown in the breakdown.</small></div>
      <div className="constituent-editor-actions"><button className="primary-button" disabled={pending || !selectedId} type="submit">{pending ? <><LoaderCircle className="spin" />Saving…</> : "Save constituents"}</button></div>
    </form>
    <Result state={state} />
  </section>;
}
