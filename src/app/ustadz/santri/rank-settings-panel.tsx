"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw, Save, SlidersHorizontal, X } from "lucide-react";

import { resetRankSettingsAction, saveRankSettingsAction } from "@/app/actions/rank-settings-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RANK_MODULES,
  scaleGapWarning,
  validateGradeScale,
  type GradeBand,
  type RankModuleKey,
  type TeacherRankSettings,
} from "@/lib/rank-settings-shared";

/**
 * TAHFIZH V78 — Kriteria Penilaian & Peringkat (guru).
 * Menampilkan kriteria yang dipakai untuk peringkat + skala nilai huruf,
 * dan memungkinkan guru mengubah keduanya (ada default awal & tombol reset).
 */

type Row = { key: string; label: string; min: string; max: string };

function toRows(scale: GradeBand[]): Row[] {
  return scale.map((g, i) => ({
    key: `${g.label}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    label: g.label,
    min: String(g.min),
    max: String(g.max),
  }));
}

function rowsToScale(rows: Row[]): GradeBand[] {
  return rows.map((r) => ({
    label: r.label.trim(),
    min: r.min.trim() === "" ? NaN : Number(r.min),
    max: r.max.trim() === "" ? NaN : Number(r.max),
  }));
}

export function RankSettingsPanel({ settings }: { settings: TeacherRankSettings }) {
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState<RankModuleKey[]>(settings.modules);
  const [rows, setRows] = useState<Row[]>(() => toRows(settings.scale));
  const [pending, startTransition] = useTransition();

  const isCustom = settings.customModules || settings.customScale;
  const activeLabels = RANK_MODULES.filter((m) => settings.modules.includes(m.key)).map((m) => m.label);

  function toggleModule(key: RankModuleKey, checked: boolean) {
    setModules((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function openEditor() {
    // Selalu mulai dari data tersimpan terbaru.
    setModules(settings.modules);
    setRows(toRows(settings.scale));
    setOpen(true);
  }

  const draftScale = rowsToScale(rows);
  const scaleError = validateGradeScale(draftScale);
  const gapWarning = scaleError ? null : scaleGapWarning(draftScale);

  function save() {
    if (modules.length === 0) return toast.error("Pilih minimal 1 kriteria peringkat.");
    if (scaleError) return toast.error(scaleError);
    startTransition(async () => {
      const res = await saveRankSettingsAction({ modules, grades: draftScale });
      if (res.success) {
        toast.success(res.success);
        setOpen(false);
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  }

  function reset() {
    startTransition(async () => {
      const res = await resetRankSettingsAction();
      if (res.success) {
        toast.success(res.success);
        setOpen(false);
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="shadow-card rounded-2xl">
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">Kriteria Penilaian &amp; Peringkat</h2>
              <Badge variant="secondary" className="font-medium">
                {isCustom ? "Diatur sendiri" : "Default"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Peringkat dihitung dari rata-rata nilai:{" "}
              <span className="text-foreground font-medium">{activeLabels.join(", ")}</span>.
            </p>
          </div>
          {!open && (
            <Button variant="outline" size="sm" onClick={openEditor}>
              <SlidersHorizontal className="size-4" /> Atur
            </Button>
          )}
        </div>

        {!open && (
          <div className="flex flex-wrap gap-1.5">
            {settings.scale.map((g) => (
              <span
                key={g.label}
                className="bg-muted text-muted-foreground tabular rounded-md px-2 py-1 text-xs"
              >
                <span className="text-foreground font-bold">{g.label}</span> {g.min}–{g.max}
              </span>
            ))}
          </div>
        )}

        {open && (
          <div className="space-y-5 border-t pt-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Peringkat berdasarkan</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {RANK_MODULES.map((m) => (
                  <Label
                    key={m.key}
                    htmlFor={`rank-mod-${m.key}`}
                    className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-lg border p-2.5"
                  >
                    <Checkbox
                      id={`rank-mod-${m.key}`}
                      checked={modules.includes(m.key)}
                      onCheckedChange={(v) => toggleModule(m.key, v === true)}
                      className="mt-0.5"
                    />
                    <span className="leading-tight">
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="text-muted-foreground text-xs font-normal">{m.hint}</span>
                    </span>
                  </Label>
                ))}
              </div>
              {modules.length === 0 && (
                <p className="text-destructive text-xs">Pilih minimal 1 kriteria.</p>
              )}
              <p className="text-muted-foreground text-xs">
                Absensi dihitung dari persentase kehadiran (status Hadir) di halaqah.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Skala nilai huruf</p>
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.key} className="flex items-center gap-2">
                    <Input
                      value={r.label}
                      onChange={(e) => updateRow(r.key, { label: e.target.value })}
                      maxLength={10}
                      aria-label="Nama nilai"
                      className="h-9 w-20 font-bold"
                    />
                    <Input
                      value={r.min}
                      onChange={(e) => updateRow(r.key, { min: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                      inputMode="numeric"
                      aria-label="Nilai awal"
                      className="h-9 w-20 text-center"
                    />
                    <span className="text-muted-foreground text-sm">sampai</span>
                    <Input
                      value={r.max}
                      onChange={(e) => updateRow(r.key, { max: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                      inputMode="numeric"
                      aria-label="Nilai akhir"
                      className="h-9 w-20 text-center"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Hapus ${r.label || "baris"}`}
                      onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length >= 20}
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    { key: `new-${Date.now()}-${prev.length}`, label: "", min: "", max: "" },
                  ])
                }
              >
                <Plus className="size-4" /> Tambah nilai
              </Button>
              {scaleError && <p className="text-destructive text-xs">{scaleError}</p>}
              {gapWarning && <p className="text-xs text-amber-600 dark:text-amber-400">{gapWarning}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={pending || modules.length === 0 || scaleError !== null}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Simpan
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Batal
              </Button>
              <Button
                variant="outline"
                className="ml-auto"
                onClick={reset}
                disabled={pending || !isCustom}
                title={isCustom ? "Hapus pengaturan sendiri dan pakai default" : "Sudah memakai default"}
              >
                <RotateCcw className="size-4" /> Kembalikan default
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
