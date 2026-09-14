"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { autoRefreshPricesAction } from "@/app/data-issues/actions";
import { readAutoRefreshPrices, subscribeToPricePreferences } from "@/lib/preferences";

const REFRESH_INTERVAL_MS = 60_000;

export function LivePriceStatus({ providerLabel, updatedLabel }: { providerLabel: string; updatedLabel: string }) {
  const enabled = useSyncExternalStore(
    subscribeToPricePreferences,
    readAutoRefreshPrices,
    () => false,
  );
  const refreshingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    if (document.visibilityState === "hidden" || refreshingRef.current) return;
    refreshingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await autoRefreshPricesAction();
        setError(result.error ?? null);
      } finally {
        refreshingRef.current = false;
      }
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, refresh]);

  const displayedError = enabled ? error : null;
  const modeLabel = displayedError
    ? "Auto-refresh failed"
    : enabled
      ? pending ? "Auto-refreshing…" : "Auto-refresh on"
      : `Updated ${updatedLabel}`;

  return (
    <div className={`quote-status ${displayedError ? "has-error" : ""}`} title={displayedError ?? undefined}>
      <RefreshCw className={pending ? "spin" : undefined} aria-hidden="true" />
      <span>{providerLabel}<small aria-live="polite">{modeLabel}</small></span>
    </div>
  );
}
