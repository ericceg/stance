export const includeClosedChartPositionsKey = "stance.includeClosedChartPositions";
const preferencesChangedEvent = "stance-preferences-changed";

export function readIncludeClosedChartPositions() {
  return window.localStorage.getItem(includeClosedChartPositionsKey) === "true";
}

export function writeIncludeClosedChartPositions(value: boolean) {
  window.localStorage.setItem(includeClosedChartPositionsKey, String(value));
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
