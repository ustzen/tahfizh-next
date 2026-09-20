"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { saveTaskAction } from "@/app/actions/v7";
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
import { TASK_MODULE_OPTIONS } from "@/lib/v7-shared";

export type StudentOption = { id: string; fullName: string; businessCode: string };

type Props = {
  mode: "create" | "edit";
  students: StudentOption[];
  /** Pre-select a santri (deep-link from student detail). */
  defaultStudentId?: string;
  task?: {
    id: string;
    studentId: string;
    moduleType: string;
    title: string;
    description: string | null;
    instruction: string;
    dueDate: string;
  };
};

export function TaskForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit" && !!props.task;
  const task = props.task;

  const [studentId, setStudentId] = useState(
    isEdit ? task!.studentId : (props.defaultStudentId ?? "")
  );
  const [module, setModule] = useState(isEdit ? task!.moduleType : "TAHFIDZ");
  const [title, setTitle] = useState(isEdit ? task!.title : "");
  const [description, setDescription] = useState(isEdit ? (task!.description ?? "") : "");
  const [instruction, setInstruction] = useState(isEdit ? task!.instruction : "");
  const [dueDate, setDueDate] = useState(
    isEdit ? task!.dueDate : new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await saveTaskAction({
      studentId,
      module,
      title,
      description,
      instruction,
      dueDate,
      taskId: isEdit && task ? task.id : null,
    });
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    toast.success(res.success ?? "Berhasil disimpan.");
    router.push(res.id ? `/ustadz/tugas/${res.id}` : "/ustadz/tugas");
    router.refresh();
  }

  const studentList = props.students;
  const studentLocked = isEdit || studentList.length === 0;

  return (
    <Card className="shadow-card max-w-2xl rounded-2xl">
      <CardHeader>
        <CardTitle>{isEdit ? "Edit Tugas" : "Buat Tugas"}</CardTitle>
        <CardDescription>Judul, instruksi, dan deadline wajib diisi (rule #53).</CardDescription>
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
            <Select value={module} onValueChange={setModule}>
              <SelectTrigger id="module" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_MODULE_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Judul Tugas</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Setorkan hafalan An-Nas"
              required
              maxLength={160}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instruction">Instruksi</Label>
            <Textarea
              id="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              required
              maxLength={1000}
              placeholder="Instruksi pengerjaan untuk santri…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="due">Deadline</Label>
              <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Deskripsi (opsional)</Label>
              <Input
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">{error}</p>
          )}

          <Button type="submit" disabled={saving} className="min-w-40">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Menyimpan…
              </>
            ) : (
              <>
                <Save className="size-4" /> Simpan Tugas
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
