"use client";

import { useSyncExternalStore } from "react";
import {
  readAutoRefreshPrices,
  readIncludeClosedChartPositions,
  subscribeToChartPreferences,
  subscribeToPricePreferences,
  writeAutoRefreshPrices,
  writeIncludeClosedChartPositions,
} from "@/lib/preferences";

export function SettingsPreferences() {
  const includeClosedPositions = useSyncExternalStore(
    subscribeToChartPreferences,
    readIncludeClosedChartPositions,
    () => false,
  );
  const autoRefreshPrices = useSyncExternalStore(
    subscribeToPricePreferences,
    readAutoRefreshPrices,
    () => false,
  );

  const updateIncludeClosedPositions = (value: boolean) => {
    writeIncludeClosedChartPositions(value);
  };

  return (
    <div className="preference-list">
      <div className="preference-row">
        <div className="preference-copy">
          <strong>Include closed positions in chart breakdown</strong>
          <p>Show previously sold holdings as quick-select series in the performance chart. Current holdings and allocation totals stay unchanged.</p>
        </div>
        <label className="preference-switch">
          <input
            aria-label="Include closed positions in chart breakdown"
            checked={includeClosedPositions}
            className="visually-hidden"
            onChange={(event) => updateIncludeClosedPositions(event.target.checked)}
            type="checkbox"
          />
          <span aria-hidden="true"><i /></span>
          <small>{includeClosedPositions ? "On" : "Off"}</small>
        </label>
      </div>
      <div className="preference-row">
        <div className="preference-copy">
          <strong>Auto-refresh market prices</strong>
          <p>Refresh current prices and P&amp;L every minute while the portfolio overview is open. Automatic refreshes do not add performance-chart snapshots.</p>
        </div>
        <label className="preference-switch">
          <input
            aria-label="Auto-refresh market prices"
            checked={autoRefreshPrices}
            className="visually-hidden"
            onChange={(event) => writeAutoRefreshPrices(event.target.checked)}
            type="checkbox"
          />
          <span aria-hidden="true"><i /></span>
          <small>{autoRefreshPrices ? "On" : "Off"}</small>
        </label>
      </div>
    </div>
  );
}
