"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Globe2, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import {
  refreshRegionalExposureAction,
  restoreAutomaticRegionalExposureAction,
  saveManualRegionalExposureAction,
  type RegionalExposureActionState,
} from "@/app/breakdown/actions";
import type { DashboardData } from "@/lib/portfolio/service";

type Position = DashboardData["positions"][number];
const initialState: RegionalExposureActionState = {};
const regions = [
  ["northAmerica", "North America"],
  ["europe", "Europe"],
  ["pacific", "Pacific"],
  ["emergingMarkets", "Emerging Markets"],
  ["other", "Other"],
] as const;

function Result({ state }: { state: RegionalExposureActionState }) {
  if (!state.error && !state.message) return null;
  return <div className={state.error ? "import-result is-error" : "import-result"} role={state.error ? "alert" : "status"}>
    {state.error ? <TriangleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
    <span>{state.error ?? state.message}</span>
  </div>;
}

export function RegionalExposureManager({ positions }: { positions: Position[] }) {
  const [selectedId, setSelectedId] = useState(positions[0]?.securityId ?? "");
  const selected = useMemo(() => positions.find((position) => position.securityId === selectedId), [positions, selectedId]);
  const [refreshState, refreshAction, refreshPending] = useActionState(refreshRegionalExposureAction, initialState);
  const [saveState, saveAction, savePending] = useActionState(saveManualRegionalExposureAction, initialState);
  const [restoreState, restoreAction, restorePending] = useActionState(restoreAutomaticRegionalExposureAction, initialState);
  const automaticCount = positions.filter((position) => position.regionalExposures.length > 0 && position.regionalExposures.every((row) => row.source !== "MANUAL")).length;
  const manualCount = positions.filter((position) => position.regionalExposures.some((row) => row.source === "MANUAL")).length;
  const unresolvedCount = positions.length - automaticCount - manualCount;
  const defaults = Object.fromEntries(regions.map(([field, label]) => [field, selected?.regionalExposures.find((row) => row.region === label)?.weight ?? 0]));
  const source = selected?.regionalExposures[0];

  return <section className="panel region-data-panel">
    <div className="section-heading region-data-heading">
      <div><p>Geographic data</p><h2>ETF look-through &amp; manual overrides</h2></div>
      <form action={refreshAction}><button className="secondary-button" disabled={refreshPending} type="submit">{refreshPending ? <LoaderCircle className="spin" /> : <RefreshCw />}Refresh automatically</button></form>
    </div>
    <div className="region-data-summary">
      <div><strong>{automaticCount}</strong><span>automatic</span></div>
      <div><strong>{manualCount}</strong><span>manual</span></div>
      <div><strong>{unresolvedCount}</strong><span>unresolved</span></div>
      <p>Manual weights always win. Automatic refresh uses issuer look-through data where supported and conservative security classification elsewhere.</p>
    </div>
    <Result state={refreshState} />
    <div className="region-editor">
      <div className="field">
        <label htmlFor="region-security">Security</label>
        <select id="region-security" onChange={(event) => setSelectedId(event.target.value)} value={selectedId}>
          {positions.map((position) => <option key={position.securityId} value={position.securityId}>{position.security.name}</option>)}
        </select>
        <small>{source ? `${source.source === "MANUAL" ? "Manual override" : "Automatic"}${source.asOf ? ` · data as of ${new Intl.DateTimeFormat("en-CH").format(new Date(source.asOf))}` : ""}` : "No regional data yet"}</small>
      </div>
      <form action={saveAction} className="region-weight-form" key={`${selectedId}-${source?.updatedAt ?? "empty"}`}>
        <input name="securityId" type="hidden" value={selectedId} />
        <div className="region-weight-grid">
          {regions.map(([field, label]) => <div className="field" key={field}><label htmlFor={`region-${field}`}>{label} <span>%</span></label><input defaultValue={defaults[field]} id={`region-${field}`} max="100" min="0" name={field} step="0.01" type="number" /></div>)}
        </div>
        <div className="region-editor-actions">
          {source?.sourceUrl ? <a href={source.sourceUrl} rel="noreferrer" target="_blank"><Globe2 />View source</a> : <span />}
          {source?.source === "MANUAL" ? <button className="secondary-button" disabled={restorePending} formAction={restoreAction} name="securityId" value={selectedId} type="submit">Restore automatic</button> : null}
          <button className="primary-button" disabled={savePending || !selectedId} type="submit">{savePending ? <><LoaderCircle className="spin" />Saving…</> : "Save manual weights"}</button>
        </div>
      </form>
    </div>
    <Result state={saveState} />
    <Result state={restoreState} />
  </section>;
}
