"use client";

import { Trash2 } from "lucide-react";
import { deleteTransactionAction } from "@/app/transactions/actions";

export function DeleteTransactionButton({ id }: { id: string }) {
  const action = deleteTransactionAction.bind(null, id);
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("Delete this transaction? Portfolio positions will be recalculated immediately.")) event.preventDefault();
    }}>
      <button aria-label="Delete transaction" className="icon-button" title="Delete transaction" type="submit"><Trash2 aria-hidden="true" /></button>
    </form>
  );
}
