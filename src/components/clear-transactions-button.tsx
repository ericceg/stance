"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { clearTransactionsAction } from "@/app/transactions/actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="danger-button" disabled={pending} type="submit">
      <Trash2 aria-hidden="true" />
      {pending ? "Clearing…" : "Clear all"}
    </button>
  );
}

export function ClearTransactionsButton({ count }: { count: number }) {
  return (
    <form
      action={clearTransactionsAction}
      onSubmit={(event) => {
        const label = count === 1 ? "transaction" : "transactions";
        if (!window.confirm(`Permanently delete all ${count} ${label}? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton />
    </form>
  );
}
