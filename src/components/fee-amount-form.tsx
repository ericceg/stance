"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { updateFeeAmountAction, type FeeAmountFormState } from "@/app/fees/actions";

const initialState: FeeAmountFormState = {};

export function FeeAmountForm({
  amount,
  currency,
  isStandaloneFee,
  transactionId,
}: {
  amount: number;
  currency: string;
  isStandaloneFee: boolean;
  transactionId: string;
}) {
  const [state, action, pending] = useActionState(updateFeeAmountAction, initialState);

  return (
    <form action={action} className="fee-amount-form">
      <input name="transactionId" type="hidden" value={transactionId} />
      <label className="sr-only" htmlFor={`fee-${transactionId}`}>{isStandaloneFee ? "Account fee" : "Transaction fee"} in {currency}</label>
      <div className="fee-amount-input"><span>{currency}</span><input defaultValue={amount} id={`fee-${transactionId}`} inputMode="decimal" min="0" name="amount" required step="any" type="number" /></div>
      <button aria-label="Save fee" className="fee-save-button" disabled={pending} title="Save fee" type="submit">
        {pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
      </button>
      {state.error ? <span className="fee-form-error" role="alert">{state.error}</span> : null}
      {state.saved ? <span className="fee-form-saved" role="status">Saved</span> : null}
    </form>
  );
}
