"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { saveAssessmentAction } from "@/app/actions/tahfidz";
import type { TahfidzMode } from "@/lib/tahfidz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SurahOption = { id: string; name: string };
type GradeOption = { label: string; minValue: number; maxValue: number };
type Existing = {
  tenantSurahId: string;
  status: "BELUM" | "DIPELAJARI" | "DINILAI";
  scoreLabel: string | null;
  scoreValue: number | null;
  note: string | null;
};

/**
 * Rule #26 flow: Santri (fixed by route) → Surat → Penilaian → Simpan.
 * Mobile-first stacked layout (rule #43).
 */
export function AssessmentForm({
  studentId,
  mode,
  surahs,
  grades,
  existing,
}: {
  studentId: string;
  mode: TahfidzMode;
  surahs: SurahOption[];
  grades: GradeOption[];
  existing: Existing[];
}) {
  const firstSurah = surahs[0]?.id ?? "";
  const [surahId, setSurahId] = useState(firstSurah);
  const existingForSurah = useMemo(
    () => existing.find((e) => e.tenantSurahId === surahId),
    [existing, surahId]
  );

  const [status, setStatus] = useState<Existing["status"]>(existingForSurah?.status ?? "DINILAI");
  const [scoreLabel, setScoreLabel] = useState<string>(existingForSurah?.scoreLabel ?? grades[0]?.label ?? "");
  const [scoreValue, setScoreValue] = useState<string>(
    existingForSurah?.scoreValue !== null && existingForSurah?.scoreValue !== undefined
      ? String(existingForSurah.scoreValue)
      : ""
  );
  const [note, setNote] = useState(existingForSurah?.note ?? "");
  const [pending, startTransition] = useTransition();

  function onSurahChange(next: string) {
    setSurahId(next);
    const ex = existing.find((e) => e.tenantSurahId === next);
    setStatus(ex?.status ?? "DINILAI");
    setScoreLabel(ex?.scoreLabel ?? grades[0]?.label ?? "");
    setScoreValue(
      ex?.scoreValue !== null && ex?.scoreValue !== undefined ? String(ex.scoreValue) : ""
    );
    setNote(ex?.note ?? "");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("tenantSurahId", surahId);
    fd.set("status", status);
    fd.set("scoreLabel", mode === "HURUF" && status === "DINILAI" ? scoreLabel : "");
    fd.set("scoreValue", mode === "ANGKA" && status === "DINILAI" ? scoreValue : "");
    fd.set("note", note);

    startTransition(async () => {
      const res = await saveAssessmentAction(null, fd);
      if (res.success) {
        toast.success(res.success);
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  }

  if (surahs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Lembaga Anda belum mengaktifkan surat tahfidz. Hubungi Admin melalui menu Pengaturan → Tahfidz.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="surah">Surat</Label>
          <Select value={surahId} onValueChange={onSurahChange} name="surah">
            <SelectTrigger id="surah" className="w-full">
              <SelectValue placeholder="Pilih surat" />
            </SelectTrigger>
            <SelectContent>
              {surahs.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as Existing["status"])}
            name="status"
          >
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DINILAI">Sudah dinilai</SelectItem>
              <SelectItem value="DIPELAJARI">Sedang dipelajari</SelectItem>
              <SelectItem value="BELUM">Belum mulai</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {status === "DINILAI" && (
        <div className="space-y-1.5">
          <Label htmlFor="score">Penilaian</Label>
          {mode === "CENTANG" && (
            <div className="flex h-10 items-center gap-3 rounded-xl border bg-role-soft/50 px-4">
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-300">✓</span>
              <span className="text-muted-foreground text-sm">Lancar (centang)</span>
            </div>
          )}
          {mode === "HURUF" && (
            <Select value={scoreLabel} onValueChange={setScoreLabel} name="grade">
              <SelectTrigger id="score" className="w-full">
                <SelectValue placeholder="Pilih grade" />
              </SelectTrigger>
              <SelectContent>
                {grades.map((g) => (
                  <SelectItem key={g.label} value={g.label}>
                    {g.label} <span className="text-muted-foreground text-xs">({g.minValue}–{g.maxValue})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {mode === "ANGKA" && (
            <Input
              id="score"
              name="scoreInput"
              type="number"
              min={1}
              max={100}
              step={1}
              required
              inputMode="numeric"
              placeholder="1-100"
              value={scoreValue}
              onChange={(e) => setScoreValue(e.target.value)}
              className="max-w-40"
            />
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="note">Catatan (opsional)</Label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Contoh: Sudah lancar, perlu meningkatkan kelancaran pada ayat terakhir."
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-xl border px-3.5 py-2.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
        />
      </div>

      <Button
        type="submit"
        disabled={pending || !surahId}
        className="bg-gradient-brand hover:opacity-90"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Simpan
      </Button>
    </form>
  );
}
