"use client";

import { useActionState } from "react";

import { setTenantStatusAction } from "@/app/actions/crud";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";

export function TenantStatusForm({ id, status }: { id: string; status: string }) {
  const [state, formAction, pending] = useActionState(setTenantStatusAction, null);
  const next = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <Button type="submit" variant={next === "ACTIVE" ? "default" : "outline"} disabled={pending}
        className={next === "ACTIVE" ? "bg-gradient-brand hover:opacity-90" : ""}>
        {pending && <Spinner />}
        {next === "ACTIVE" ? "Aktifkan Lembaga" : "Nonaktifkan Lembaga"}
      </Button>
      {state?.success && <span className="text-sm text-emerald-700 dark:text-emerald-300">{state.success}</span>}
      {state?.error && <span className="text-sm text-red-600 dark:text-red-300">{state.error}</span>}
    </form>
  );
}
