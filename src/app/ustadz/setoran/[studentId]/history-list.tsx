"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { deleteSetoranAction } from "@/app/actions/setoran";
import {
  SUBMISSION_KIND_LABELS,
  SUBMISSION_RESULT_LABELS,
  SUBMISSION_RESULT_STYLES,
  SUBMISSION_NOTE_SLOT_LABELS,
  type SubmissionNoteSlot,
  type SubmissionResult,
} from "@/lib/setoran-shared";
import { Button } from "@/components/ui/button";
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

type HistoryItem = {
  id: string;
  kind: "HAFALAN_BARU" | "MUROJAAH";
  ayatLabel: string | null;
  assessedDate: string;
  result: SubmissionResult;
  scoreLabel: string | null;
  scoreValue: number | null;
  freeNote: string | null;
  teacherName: string | null;
  surahName: string;
  notes: Partial<Record<SubmissionNoteSlot, string>>;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function scoreText(item: HistoryItem) {
  if (item.scoreLabel) return item.scoreLabel;
  if (item.scoreValue !== null) return String(item.scoreValue);
  return item.result === "DITUNDA" ? "—" : "✓";
}

/** Rule #23: Riwayat Setoran cards; rule #28 soft delete with confirmation. */
export function SetoranHistoryList({ items }: { items: HistoryItem[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Belum ada riwayat setoran.</p>;
  }

  function remove(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await deleteSetoranAction(id);
      if (res.success) toast.success(res.success);
      else if (res.error) toast.error(res.error);
      setPendingId(null);
    });
  }

  return (
    <ol className="space-y-3">
      {items.map((h) => (
        <li key={h.id} className="flex items-start gap-3">
          <span className="bg-gradient-brand mt-1.5 size-2 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground">{formatDate(h.assessedDate)}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {h.surahName}
                {h.ayatLabel ? (
                  <span className="text-muted-foreground font-normal"> · {h.ayatLabel}</span>
                ) : null}
              </p>
              <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2 py-0.5 text-[0.7rem] font-bold text-white shadow-card">
                {scoreText(h)}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${SUBMISSION_RESULT_STYLES[h.result]}`}
              >
                {SUBMISSION_RESULT_LABELS[h.result]}
              </span>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {SUBMISSION_KIND_LABELS[h.kind]}
              {h.teacherName ? ` · ${h.teacherName}` : ""}
            </p>
            {h.freeNote && (
              <p className="text-muted-foreground mt-1 text-xs italic">“{h.freeNote}”</p>
            )}
            {Object.entries(h.notes).length > 0 && (
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {Object.entries(h.notes).map(([slot, content]) => (
                  <li key={slot}>
                    <span className="font-semibold text-muted-foreground">
                      {SUBMISSION_NOTE_SLOT_LABELS[slot as SubmissionNoteSlot] ?? slot}:
                    </span>{" "}
                    {content}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                aria-label="Arsipkan setoran"
                className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
              >
                {pendingId === h.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arsipkan setoran ini?</AlertDialogTitle>
                <AlertDialogDescription>
                  Setoran disembunyikan dari daftar aktif. Riwayat tetap tersimpan agar histori dan
                  Kartu Prestasi tetap konsisten.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => remove(h.id)}>
                  Arsipkan
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </li>
      ))}
    </ol>
  );
}
