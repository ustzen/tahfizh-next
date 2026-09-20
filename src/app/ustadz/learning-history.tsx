"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { deleteLearningAssessmentAction } from "@/app/actions/learning";
import {
  NOTE_SLOT_LABELS,
  learningStatusLabel,
  learningStatusStyle,
  type LearningModule,
} from "@/lib/learning-shared";
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
  materialTitle: string;
  assessedDate: string;
  status: string;
  scoreLabel: string | null;
  scoreValue: number | null;
  freeNote: string | null;
  teacherName: string | null;
  notes: Record<string, string>;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function scoreText(item: HistoryItem) {
  if (item.scoreLabel) return item.scoreLabel;
  if (item.scoreValue !== null) return String(item.scoreValue);
  return "✓";
}

/** Riwayat per modul (rule #25) — consistent UI across the three modules. */
export function LearningHistoryList({
  module,
  items,
}: {
  module: LearningModule;
  items: HistoryItem[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Belum ada penilaian.</p>;
  }

  function remove(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await deleteLearningAssessmentAction(id, module);
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
              <p className="text-sm font-medium text-foreground">{h.materialTitle}</p>
              <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2 py-0.5 text-[0.7rem] font-bold text-white shadow-card">
                {scoreText(h)}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${learningStatusStyle(h.status)}`}
              >
                {learningStatusLabel(h.status)}
              </span>
            </div>
            {h.teacherName && (
              <p className="text-muted-foreground mt-0.5 text-xs">{h.teacherName}</p>
            )}
            {h.freeNote && (
              <p className="text-muted-foreground mt-1 text-xs italic">“{h.freeNote}”</p>
            )}
            {Object.entries(h.notes).length > 0 && (
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {Object.entries(h.notes).map(([slot, content]) => (
                  <li key={slot}>
                    <span className="font-semibold text-muted-foreground">
                      {NOTE_SLOT_LABELS[slot] ?? slot}:
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
                aria-label="Arsipkan penilaian"
                className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
              >
                {pendingId === h.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arsipkan penilaian ini?</AlertDialogTitle>
                <AlertDialogDescription>
                  Penilaian disembunyikan dari daftar aktif. Riwayat tetap tersimpan agar histori
                  dan Kartu Prestasi tetap konsisten.
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
