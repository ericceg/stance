export const includeClosedChartPositionsKey = "stance.includeClosedChartPositions";
export const autoRefreshPricesKey = "stance.autoRefreshPrices";
const preferencesChangedEvent = "stance-preferences-changed";

export function readIncludeClosedChartPositions() {
  return window.localStorage.getItem(includeClosedChartPositionsKey) === "true";
}

export function writeIncludeClosedChartPositions(value: boolean) {
  window.localStorage.setItem(includeClosedChartPositionsKey, String(value));
  window.dispatchEvent(new Event(preferencesChangedEvent));
}

export function readAutoRefreshPrices() {
  return window.localStorage.getItem(autoRefreshPricesKey) === "true";
}

export function writeAutoRefreshPrices(value: boolean) {
  window.localStorage.setItem(autoRefreshPricesKey, String(value));
  window.dispatchEvent(new Event(preferencesChangedEvent));
}

export function subscribeToChartPreferences(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(preferencesChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(preferencesChangedEvent, onStoreChange);
  };
}

export const subscribeToPricePreferences = subscribeToChartPreferences;
