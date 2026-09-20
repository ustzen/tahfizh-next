"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setTaskStatusAction } from "@/app/actions/v7";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/v7-shared";
import type { TahfidzMode } from "@/lib/tahfidz";

type Grade = { label: string; minValue: number; maxValue: number };

export function TaskStatusControls({
  taskId,
  status,
  mode,
  grades,
  completionNote,
  teacherNote,
  scoreValue,
  scoreLabel,
}: {
  taskId: string;
  status: string;
  mode: TahfidzMode;
  grades: Grade[];
  completionNote: string;
  teacherNote: string;
  scoreValue: number | null;
  scoreLabel: string;
}) {
  const router = useRouter();
  const [newStatus, setNewStatus] = useState(status);
  const [value, setValue] = useState(scoreValue !== null ? String(scoreValue) : "");
  const [label, setLabel] = useState(scoreLabel);
  const [cNote, setCNote] = useState(completionNote);
  const [tNote, setTNote] = useState(teacherNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await setTaskStatusAction({
      taskId,
      status: newStatus,
      scoreValue: mode === "ANGKA" && value !== "" ? Number(value) : null,
      scoreLabel: mode === "HURUF" ? label : "",
      completionNote: cNote,
      teacherNote: tNote,
    });
    if (res.error) {
      setError(res.error);
      setBusy(false);
      return;
    }
    toast.success(res.success ?? "Berhasil disimpan.");
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className="shadow-card rounded-2xl">
      <CardHeader>
        <CardTitle>Perbarui Status & Penilaian</CardTitle>
        <CardDescription>
          Penilaian mengikuti mode lembaga ({TASK_STATUS_LABELS[newStatus as keyof typeof TASK_STATUS_LABELS] ?? newStatus}).
          Tugas berstatus Dinilai otomatis masuk Kartu Prestasi (rule #22).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status Tugas</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TASK_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newStatus === "DINILAI" && mode === "ANGKA" && (
              <div className="space-y-1.5">
                <Label htmlFor="score">Nilai (1-100)</Label>
                <Input
                  id="score"
                  type="number"
                  min={1}
                  max={100}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            )}

            {newStatus === "DINILAI" && mode === "HURUF" && (
              <div className="space-y-1.5">
                <Label>Grade</Label>
                <Select value={label} onValueChange={setLabel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((g) => (
                      <SelectItem key={g.label} value={g.label}>
                        {g.label} ({g.minValue}–{g.maxValue})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cnote">Catatan Pengumpulan (opsional)</Label>
            <Textarea id="cnote" value={cNote} onChange={(e) => setCNote(e.target.value)} rows={2} maxLength={500} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tnote">Catatan Guru (opsional)</Label>
            <Textarea id="tnote" value={tNote} onChange={(e) => setTNote(e.target.value)} rows={2} maxLength={500} />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">{error}</p>
          )}

          <Button type="submit" disabled={busy} className="min-w-40">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Menyimpan…
              </>
            ) : (
              "Simpan Perubahan"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
