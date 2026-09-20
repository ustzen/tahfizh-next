"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { deleteTartilAssessmentAction } from "@/app/actions/tartil";
import { NOTE_SLOT_LABELS, type NoteSlot } from "@/lib/tartil-shared";
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
  materialName: string;
  pagesLabel: string | null;
  assessedAt: string;
  status: "BELUM" | "DIPELAJARI" | "DINILAI";
  scoreLabel: string | null;
  scoreValue: number | null;
  teacherName: string | null;
  notes: Partial<Record<NoteSlot, string>>;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function scoreText(item: HistoryItem) {
  if (item.status !== "DINILAI") return item.status === "DIPELAJARI" ? "Dipelajari" : "Belum";
  if (item.scoreLabel) return item.scoreLabel;
  if (item.scoreValue !== null) return String(item.scoreValue);
  return "✓";
}

export function TartilHistoryList({ items }: { items: HistoryItem[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Belum ada penilaian Tartil.</p>;
  }

  function remove(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const res = await deleteTartilAssessmentAction(id);
      if (res.success) toast.success(res.success);
      else if (res.error) toast.error(res.error);
      setPendingId(null);
    });
  }

  return (
    <ol className="space-y-3">
      {items.map((h) => (
        <li key={h.id} className="flex items-start gap-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-role" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {h.materialName}
                {h.pagesLabel ? <span className="text-muted-foreground font-normal"> · Hal. {h.pagesLabel}</span> : null}
              </p>
              <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2 py-0.5 text-[0.7rem] font-bold text-white shadow-card">
                {scoreText(h)}
              </span>
              <span className="text-muted-foreground text-xs">{formatDate(h.assessedAt)}</span>
              {h.teacherName && (
                <span className="text-muted-foreground hidden text-xs sm:inline">· {h.teacherName}</span>
              )}
            </div>
            {Object.entries(h.notes).length > 0 && (
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {Object.entries(h.notes).map(([slot, content]) => (
                  <li key={slot}>
                    <span className="font-semibold text-muted-foreground">
                      {NOTE_SLOT_LABELS[slot as NoteSlot] ?? slot}:
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
                aria-label="Hapus penilaian"
                className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
              >
                {pendingId === h.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus penilaian ini?</AlertDialogTitle>
                <AlertDialogDescription>
                  Penilaian akan disembunyikan dari daftar aktif. Riwayat tetap tersimpan agar Kartu
                  Prestasi tetap konsisten.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => remove(h.id)}>
                  Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </li>
      ))}
    </ol>
  );
}
