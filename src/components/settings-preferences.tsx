"use client";

import { useSyncExternalStore } from "react";
import { readIncludeClosedChartPositions, subscribeToChartPreferences, writeIncludeClosedChartPositions } from "@/lib/preferences";

export function SettingsPreferences() {
  const includeClosedPositions = useSyncExternalStore(
    subscribeToChartPreferences,
    readIncludeClosedChartPositions,
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
    </div>
  );
}
