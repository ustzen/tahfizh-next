"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtDMY } from "@/lib/date-format";
import type { TeacherStudentRow } from "@/lib/teacher-students";
import type { CustomModuleItem, CustomModuleLog } from "@/lib/custom-module";
import {
  deleteCustomModuleLogAction,
  logCustomModuleAction,
} from "@/app/actions/custom-module";
import {
  customModuleIconFor,
  customModuleToneFor,
} from "@/components/akademik/custom-module-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * TAHFIZH V58 — Pencatatan poin modul kustom oleh guru.
 * Pilih santri → pilih modul → tanggal (+ catatan opsional) → simpan.
 * Riwayat catatan terbaru tampil di bawah dan bisa dihapus.
 */

export function ModulClient({
  students,
  modules,
  initialLogs,
  santriLabel,
  today,
}: {
  students: TeacherStudentRow[];
  modules: CustomModuleItem[];
  initialLogs: CustomModuleLog[];
  santriLabel: string;
  today: string;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [score, setScore] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const moduleById = useMemo(
    () => new Map(modules.map((m) => [m.id, m])),
    [modules]
  );
  const selectedModule = moduleId ? moduleById.get(moduleId) ?? null : null;

  async function submit() {
    if (!studentId) {
      toast.error(`Pilih ${santriLabel.toLowerCase()} dulu.`);
      return;
    }
    if (!moduleId) {
      toast.error("Pilih modul terlebih dahulu.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Tanggal tidak valid.");
      return;
    }
    setSaving(true);
    const res = await logCustomModuleAction({
      studentId,
      moduleId,
      date,
      note,
      scoreValue: selectedModule?.graded && score.trim() !== "" ? Number(score) : null,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Poin kemajuan dicatat.");
    setNote("");
    setScore("");
    router.refresh();
  }

  async function removeLog(log: CustomModuleLog) {
    if (!confirm(`Hapus catatan poin "${log.moduleLabel}" untuk ${log.studentName}?`)) return;
    setPendingDelete(log.id);
    const res = await deleteCustomModuleLogAction({ id: log.id });
    setPendingDelete(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Catatan dihapus.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Form pencatatan */}
      <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-500/20 dark:bg-card sm:p-5">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <span className="bg-role text-role-ink flex size-6 items-center justify-center rounded-lg">
            <Plus className="size-3.5" />
          </span>
          Catat Poin Modul
        </p>
        <p className="text-muted-foreground mt-0.5 mb-3 text-[0.7rem]">
          Satu catatan = 1 poin kemajuan. Target poin per modul ditetapkan lembaga.
        </p>

        {students.length === 0 || modules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
            <span className="bg-role-soft text-role flex size-11 items-center justify-center rounded-2xl">
              <Sparkles className="size-5" />
            </span>
            <p className="text-sm font-bold">
              {students.length === 0
                ? "Belum ada santri binaan."
                : "Belum ada modul kustom."}
            </p>
            <p className="text-muted-foreground max-w-sm text-[0.7rem]">
              {students.length === 0
                ? "Anda belum terhubung ke halaqah aktif — hubungi admin lembaga."
                : "Admin atau koordinator lembaga menambahkan modul di menu Modul."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{santriLabel}</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={`Pilih ${santriLabel.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id!}>
                        {s.full_name}
                        {s.halaqah_name ? ` · ${s.halaqah_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modul-tanggal">Tanggal</Label>
                <Input
                  id="modul-tanggal"
                  type="date"
                  value={date}
                  max={today}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Modul</Label>
              <div className="flex flex-wrap gap-2">
                {modules.map((m) => {
                  const IconC = customModuleIconFor(m.icon);
                  const tone = customModuleToneFor(m.tone);
                  const active = moduleId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setModuleId(active ? "" : m.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors",
                        active
                          ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/50 dark:bg-blue-500/15 dark:text-blue-200"
                          : "border-slate-100 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-500/20 dark:bg-transparent dark:text-slate-300 dark:hover:border-slate-400/40"
                      )}
                    >
                      <span className={cn("flex size-6 items-center justify-center rounded-lg", tone.chip)}>
                        <IconC className="size-3.5" />
                      </span>
                      {m.label}
                      {m.poinTarget > 0 && (
                        <span className="text-[0.6rem] font-semibold opacity-70">
                          /{m.poinTarget}
                        </span>
                      )}
                      {active && <Check className="size-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="modul-catatan">Catatan (opsional)</Label>
              <Textarea
                id="modul-catatan"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="mis. Mengerjakan kaligrafi surah Al-Fatihah…"
              />
            </div>

            {selectedModule?.graded && (
              <div className="space-y-1.5">
                <Label htmlFor="modul-nilai">Nilai (0–100, opsional)</Label>
                <Input
                  id="modul-nilai"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="mis. 85"
                  className="sm:w-40"
                />
              </div>
            )}

            <Button onClick={submit} disabled={saving} className="bg-role text-role-ink hover:brightness-95">
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Menyimpan…
                </>
              ) : (
                <>
                  <Plus className="size-4" /> Catat Poin
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Riwayat catatan terbaru */}
      <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-500/20 dark:bg-card sm:p-5">
        <p className="mb-3 text-sm font-bold">
          Poin Terbaru <span className="text-muted-foreground font-normal">({initialLogs.length})</span>
        </p>
        {initialLogs.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Belum ada catatan poin. Catatan pertama akan tampil di sini.
          </p>
        ) : (
          <ul className="space-y-2">
            {initialLogs.map((log) => {
              const m = moduleById.get(log.moduleId);
              const IconC = customModuleIconFor(m?.icon ?? "star");
              const tone = customModuleToneFor(m?.tone ?? "emerald");
              return (
                <li
                  key={log.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-500/20"
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone.chip)}>
                    <IconC className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {log.studentName} <span className="text-muted-foreground font-normal">· {log.moduleLabel}</span>
                    </p>
                    <p className="text-muted-foreground truncate text-[0.65rem] font-semibold">
                      {fmtDMY(log.logDate)}
                      {log.scoreValue != null ? ` · Nilai ${log.scoreValue}` : ""}
                      {log.note ? ` · ${log.note}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLog(log)}
                    disabled={pendingDelete === log.id}
                    aria-label={`Hapus catatan ${log.studentName}`}
                    title="Hapus catatan"
                    className="rounded-md p-1.5 text-muted-foreground/70 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
                  >
                    {pendingDelete === log.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
