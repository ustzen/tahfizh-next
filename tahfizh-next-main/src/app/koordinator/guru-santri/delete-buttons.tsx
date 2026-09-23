"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { deleteTeacherAction, deleteStudentAction, type ActionResult } from "@/app/actions/crud";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DeleteRowButton({
  kind,
  id,
  name,
}: {
  kind: "teacher" | "student";
  id: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (kind === "teacher" ? deleteTeacherAction : deleteStudentAction) as never,
    null
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-red-600 dark:text-red-300 hover:bg-red-50 hover:text-red-700">
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Hapus {kind === "teacher" ? "guru" : "santri"} {name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Relasi penugasan/hubungan yang terkait juga akan terhapus. Data tidak dapat dikembalikan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="destructive" disabled={pending}>
              Hapus
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
