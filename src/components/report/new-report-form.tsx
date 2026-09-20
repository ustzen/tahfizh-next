"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createReportAction } from "@/app/actions/report";

type Student = { id: string; fullName: string; businessCode: string };

/**
 * TAHFIZH V9 — draft creation form (rule #30/#32). Values come from the
 * learning modules — the guru never re-types scores (rule #29).
 */
export function NewReportForm({
  templateId,
  students,
  defaults,
}: {
  templateId: string;
  students: Student[];
  defaults: { academicYear: string; semester: string; periodStart: string; periodEnd: string };
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("LAPORAN HASIL PEMBELAJARAN AL-QUR'AN");
  const [academicYear, setAcademicYear] = useState(defaults.academicYear);
  const [semester, setSemester] = useState(defaults.semester);
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);
  const [periodLabel, setPeriodLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await createReportAction({
      templateId,
      studentId,
      title,
      academicYear,
      semester,
      periodLabel,
      periodStart,
      periodEnd,
    }).catch(() => ({ error: "Raport belum berhasil disimpan. Silakan coba lagi.", id: undefined as string | undefined }));
    setSaving(false);
    if (res.error || !res.id) {
      setError(res.error || "Raport belum berhasil disimpan.");
      return;
    }
    router.push(`/admin/raport/builder/${templateId}?report=${res.id}`);
  }

  return (
    <Card className="mx-auto max-w-2xl shadow-card">
      <CardContent className="space-y-4 p-6">
        {!templateId ? (
          <p className="rounded-lg bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            Template belum dipilih. Kembali ke menu Raport lalu “Pakai Template”.
          </p>
        ) : null}
        {error ? <p className="rounded-lg bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p> : null}

        <div className="space-y-1.5">
          <Label>Santri</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih santri" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Judul raport</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tahun ajaran</Label>
            <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2026/2027" />
          </div>
          <div className="space-y-1.5">
            <Label>Semester</Label>
            <Select value={semester} onValueChange={setSemester}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Semester 1">Semester 1</SelectItem>
                <SelectItem value="Semester 2">Semester 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Periode mulai</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Periode selesai</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Label periode (opsional)</Label>
            <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="Juli–Desember 2026" />
          </div>
        </div>

        <Button
          className="w-full bg-primary text-white"
          disabled={saving || !templateId || !studentId}
          onClick={() => void submit()}
        >
          <FilePlus2 className="mr-2 h-4 w-4" />
          {saving ? "Menyimpan..." : "Buat Draft Raport"}
        </Button>
        <p className={cn("text-center text-xs text-muted-foreground/80")}>
          Setelah dibuka, atur layout di Report Builder lalu Preview/Final.
        </p>
      </CardContent>
    </Card>
  );
}
