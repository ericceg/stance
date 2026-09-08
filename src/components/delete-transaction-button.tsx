"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle, Trash2 } from "lucide-react";
import { deleteTransactionAction } from "@/app/transactions/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button aria-label={pending ? "Deleting transaction" : "Delete transaction"} className="icon-button" disabled={pending} title="Delete transaction" type="submit">
    {pending ? <LoaderCircle aria-hidden="true" className="spin" /> : <Trash2 aria-hidden="true" />}
  </button>;
}

export function DeleteTransactionButton({ id }: { id: string }) {
  const action = deleteTransactionAction.bind(null, id);
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("Delete this transaction? Portfolio positions will be recalculated immediately.")) event.preventDefault();
    }}>
      <SubmitButton />
    </form>
  );
}
