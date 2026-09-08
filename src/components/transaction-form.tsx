"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { createTransactionAction, type TransactionFormState } from "@/app/transactions/actions";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/portfolio/types";

const initialState: TransactionFormState = {};

export function TransactionForm({
  accounts,
  securities,
  defaultDate,
  initialType = "BUY",
}: {
  accounts: { id: string; brokerName: string; accountName: string; baseCurrency: string }[];
  securities: { id: string; name: string; ticker: string; tradingCurrency: string }[];
  defaultDate: string;
  initialType?: TransactionType;
}) {
  const [state, action, pending] = useActionState(createTransactionAction, initialState);
  const [type, setType] = useState<TransactionType>(initialType);
  const [currency, setCurrency] = useState("CHF");
  const isTrade = type === "BUY" || type === "SELL";
  const isStandaloneFee = type === "FEE";
  const requiresSecurity = isTrade || type === "DIVIDEND";

  return (
    <form action={action}>
      {state.error ? <div className="form-error" role="alert">{state.error}</div> : null}
      <div className="form-section">
        <h2>Transaction details</h2>
        <p>Original currency values are stored alongside their CHF conversion.</p>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="type">Transaction type</label>
            <select id="type" name="type" onChange={(event) => setType(event.target.value as TransactionType)} value={type}>
              {TRANSACTION_TYPES.map((item) => <option key={item} value={item}>{item[0] + item.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="brokerAccountId">Broker account</label>
            <select id="brokerAccountId" name="brokerAccountId" defaultValue={accounts[0]?.id} required>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.brokerName} · {account.accountName}</option>)}
            </select>
            {state.fieldErrors?.brokerAccountId ? <small className="field-error">{state.fieldErrors.brokerAccountId[0]}</small> : null}
          </div>
          <div className="field">
            <label htmlFor="timestamp">Date</label>
            <input id="timestamp" name="timestamp" type="date" defaultValue={defaultDate} required />
            {state.fieldErrors?.timestamp ? <small className="field-error">{state.fieldErrors.timestamp[0]}</small> : null}
          </div>
          <div className="field">
            <label htmlFor="securityId">Security <span>{requiresSecurity ? "Required" : "Optional"}</span></label>
            <select id="securityId" name="securityId" defaultValue="" onChange={(event) => {
              const security = securities.find((item) => item.id === event.target.value);
              if (security) {
                setCurrency(security.tradingCurrency);
              }
            }} required={requiresSecurity}>
              <option value="">No security</option>
              {securities.map((security) => <option key={security.id} value={security.id}>{security.name} ({security.ticker})</option>)}
            </select>
            {state.fieldErrors?.securityId ? <small className="field-error">{state.fieldErrors.securityId[0]}</small> : null}
          </div>
        </div>
      </div>

      <div className="form-section">
        <h2>{isTrade ? "Execution" : "Cash value"}</h2>
        <p>{isTrade ? "Gross value is calculated as quantity × execution price." : isStandaloneFee ? "Record the full charge that left this broker account." : "Enter the gross cash amount before fees."}</p>
        <div className="field-grid">
          {isTrade ? <>
            <div className="field">
              <label htmlFor="quantity">Quantity</label>
              <input id="quantity" inputMode="decimal" min="0" name="quantity" placeholder="0.0000" step="any" type="number" required />
              {state.fieldErrors?.quantity ? <small className="field-error">{state.fieldErrors.quantity[0]}</small> : null}
            </div>
            <div className="field">
              <label htmlFor="executionPrice">Execution price</label>
              <input id="executionPrice" inputMode="decimal" min="0" name="executionPrice" placeholder="0.00" step="any" type="number" required />
              {state.fieldErrors?.executionPrice ? <small className="field-error">{state.fieldErrors.executionPrice[0]}</small> : null}
            </div>
          </> : (
            <div className="field field-span">
              <label htmlFor="totalValue">{isStandaloneFee ? "Fee amount" : "Gross value"}</label>
              <input id="totalValue" inputMode="decimal" min="0" name="totalValue" placeholder="0.00" step="any" type="number" required />
              {state.fieldErrors?.totalValue ? <small className="field-error">{state.fieldErrors.totalValue[0]}</small> : null}
            </div>
          )}
          <div className="field">
            <label htmlFor="transactionCurrency">Transaction currency</label>
            <input id="transactionCurrency" maxLength={3} name="transactionCurrency" onChange={(event) => {
              const nextCurrency = event.target.value.toUpperCase();
              setCurrency(nextCurrency);
            }} value={currency} required />
            {state.fieldErrors?.transactionCurrency ? <small className="field-error">{state.fieldErrors.transactionCurrency[0]}</small> : null}
          </div>
          <div className="field">
            <label htmlFor="automatic-fx">CHF conversion</label>
            <input id="automatic-fx" readOnly value="Automatic" />
            <small>The {currency || "currency"}/CHF reference rate is looked up for the transaction date.</small>
          </div>
          {isStandaloneFee ? <input name="fee" type="hidden" value="0" /> : <div className="field">
            <label htmlFor="fee">Fee <span>In transaction currency</span></label>
            <input defaultValue="0" id="fee" inputMode="decimal" min="0" name="fee" step="any" type="number" />
            {state.fieldErrors?.fee ? <small className="field-error">{state.fieldErrors.fee[0]}</small> : null}
          </div>}
        </div>
      </div>

      <div className="form-section">
        <h2>Notes</h2>
        <p>Optional context for future reconciliation or import checks.</p>
        <div className="field"><label htmlFor="notes">Notes</label><textarea id="notes" maxLength={500} name="notes" placeholder="Optional note" /></div>
      </div>

      <div className="form-actions">
        <Link className="secondary-button" href="/transactions">Cancel</Link>
        <button className="primary-button" disabled={pending} type="submit">{pending ? <><LoaderCircle className="spin" />Saving…</> : "Save transaction"}</button>
      </div>
    </form>
  );
}
