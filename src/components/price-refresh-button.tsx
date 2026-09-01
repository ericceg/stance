"use client";

import { useActionState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { refreshPricesAction, type PriceRefreshState } from "@/app/data-issues/actions";

const initialState: PriceRefreshState = {};

export function PriceRefreshButton() {
  const [state, action, pending] = useActionState(refreshPricesAction, initialState);
  return (
    <div>
      <form action={action}>
        <button className="secondary-button" disabled={pending} type="submit">
          {pending ? <><LoaderCircle className="spin" aria-hidden="true" />Refreshing…</> : <><RefreshCw aria-hidden="true" />Refresh prices</>}
        </button>
      </form>
      {state.error ? <small className="negative" role="alert">{state.error}</small> : null}
      {state.message ? <small className="positive" role="status">{state.message}</small> : null}
    </div>
  );
}
