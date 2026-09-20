"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { saveTargetAction } from "@/app/actions/v7";
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
import { TARGET_MODULES, TARGET_MODULE_LABELS } from "@/lib/v7-shared";
import { cn } from "@/lib/utils";

export type StudentOption = { id: string; fullName: string; businessCode: string };

type Props = {
  mode: "create" | "edit";
  students: StudentOption[];
  /** Pre-select a santri (deep-link from student detail). */
  defaultStudentId?: string;
  target?: {
    id: string;
    studentId: string;
    moduleType: string;
    title: string;
    description: string | null;
    startDate: string;
    endDate: string;
    targetValue: number;
    unit: string | null;
    note: string | null;
  };
};

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TargetForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit" && !!props.target;
  const target = props.target;

  const [studentId, setStudentId] = useState(
    isEdit ? target!.studentId : (props.defaultStudentId ?? "")
  );
  const [module, setModule] = useState(isEdit ? target!.moduleType : "CUSTOM");
  const [title, setTitle] = useState(isEdit ? target!.title : "");
  const [description, setDescription] = useState(isEdit ? (target!.description ?? "") : "");
  const [startDate, setStartDate] = useState(isEdit ? target!.startDate : new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(isEdit ? target!.endDate : todayPlus(30));
  const [targetValue, setTargetValue] = useState(isEdit ? String(target!.targetValue) : "10");
  const [unit, setUnit] = useState(isEdit ? (target!.unit ?? "") : "");
  const [note, setNote] = useState(isEdit ? (target!.note ?? "") : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // rule #55 double-submit guard
    setSaving(true);
    setError(null);
    const res = await saveTargetAction({
      studentId,
      module,
      title,
      description,
      startDate,
      endDate,
      targetValue: Number(targetValue),
      unit,
      note,
      targetId: isEdit && target ? target.id : null,
    });
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    toast.success(res.success ?? "Berhasil disimpan.");
    router.push(res.id ? `/ustadz/target/${res.id}` : "/ustadz/target");
    router.refresh();
  }

  const studentList = props.students;
  const studentLocked = isEdit || studentList.length === 0;

  return (
    <Card className="shadow-card max-w-2xl rounded-2xl">
      <CardHeader>
        <CardTitle>{isEdit ? "Edit Target" : "Buat Target"}</CardTitle>
        <CardDescription>
          Target modul (Tahfidz–Tajwid) dihitung otomatis dari data penilaian; target Custom diperbarui manual.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="student">Santri</Label>
            {studentLocked ? (
              <Input value={studentList.find((s) => s.id === studentId)?.fullName ?? "—"} disabled />
            ) : (
              <Select value={studentId} onValueChange={setStudentId} required>
                <SelectTrigger id="student" className="w-full">
                  <SelectValue placeholder="Pilih santri" />
                </SelectTrigger>
                <SelectContent>
                  {studentList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="module">Modul</Label>
            <Select value={module} onValueChange={setModule} disabled={isEdit}>
              <SelectTrigger id="module" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_MODULES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {TARGET_MODULE_LABELS[m]}
                    {m !== "CUSTOM" ? " (otomatis)" : " (manual)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Judul Target</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Hafal Juz 30"
              required
              maxLength={160}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start">Tanggal Mulai</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Tanggal Akhir</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1.5">
              <Label htmlFor="targetValue">Nilai Target</Label>
              <Input
                id="targetValue"
                type="number"
                min={1}
                step="any"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Satuan</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="surat / hadits / materi"
                maxLength={30}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Deskripsi (opsional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Catatan (opsional)</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className={cn("min-w-40")}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Menyimpan…
                </>
              ) : (
                <>
                  <Save className="size-4" /> Simpan Target
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
