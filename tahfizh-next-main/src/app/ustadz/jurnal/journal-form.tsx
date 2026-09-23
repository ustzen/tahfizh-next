"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { saveJournalEntryAction } from "@/app/actions/v7";
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
import { Checkbox } from "@/components/ui/checkbox";
import type { JournalFieldDto, JournalTemplateDto } from "@/lib/v7";
import type { StudentOption } from "@/app/ustadz/tugas/task-form";

type ValuesState = Record<string, string | boolean>;

function initial(values: Record<string, string>, fields: JournalFieldDto[]): ValuesState {
  const out: ValuesState = {};
  for (const f of fields) {
    const v = values[f.id];
    if (v === undefined) continue;
    out[f.id] = f.type === "CHECKBOX" ? v === "true" : v;
  }
  return out;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: JournalFieldDto;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const id = `field-${field.id}`;
  switch (field.type) {
    case "TEXTAREA":
      return (
        <Textarea
          id={id}
          rows={3}
          maxLength={500}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case "NUMBER":
      return (
        <Input
          id={id}
          type="number"
          step="any"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case "DATE":
      return (
        <Input
          id={id}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case "CHECKBOX":
      return (
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(c) => onChange(c === true)}
          />
          <Label htmlFor={id} className="text-muted-foreground text-xs font-normal">
            {field.label}
          </Label>
        </div>
      );
    case "SELECT":
      return (
        <Select value={(value as string) ?? ""} onValueChange={onChange} required={field.required}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={`Pilih ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    default:
      return (
        <Input
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
          required={field.required}
        />
      );
  }
}

export function JournalForm({
  templates,
  students,
  defaultStudentId,
  entry,
}: {
  templates: JournalTemplateDto[];
  students: StudentOption[];
  /** Pre-select a santri (deep-link from student detail). */
  defaultStudentId?: string;
  entry?: {
    id: string;
    templateId: string;
    studentId: string;
    entryDate: string;
    freeText: string | null;
    valuesJson: Record<string, string>;
  };
}) {
  const router = useRouter();
  const isEdit = !!entry;

  const [templateId, setTemplateId] = useState(entry?.templateId ?? "");
  const [studentId, setStudentId] = useState(entry?.studentId ?? (defaultStudentId ?? ""));
  const [entryDate, setEntryDate] = useState(entry?.entryDate ?? new Date().toISOString().slice(0, 10));
  const [freeText, setFreeText] = useState(entry?.freeText ?? "");
  const template = templates.find((t) => t.id === templateId);
  const [values, setValues] = useState<ValuesState>(
    entry ? initial(entry.valuesJson, template?.fields ?? []) : {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setValue(fieldId: string, v: string | boolean) {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await saveJournalEntryAction({
      templateId,
      studentId,
      entryDate,
      values,
      freeText,
      entryId: entry?.id ?? null,
    });
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    toast.success(res.success ?? "Jurnal berhasil disimpan.");
    router.push("/ustadz/jurnal");
    router.refresh();
  }

  if (templates.length === 0) {
    return (
      <Card className="shadow-card max-w-2xl rounded-2xl">
        <CardContent className="px-6 py-10 text-center">
          <p className="font-semibold text-foreground">Belum ada template jurnal.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Admin lembaga perlu membuat template di Pengaturan → Custom Jurnal.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card max-w-2xl rounded-2xl">
      <CardHeader>
        <CardTitle>{isEdit ? "Edit Jurnal" : "Jurnal Baru"}</CardTitle>
        <CardDescription>
          Field dengan tanda * wajib diisi. Validasi dijalankan di form dan server (rule #54).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Template Jurnal</Label>
            <Select
              value={templateId}
              onValueChange={(v) => {
                setTemplateId(v);
                setValues({});
              }}
              disabled={isEdit}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.showInAchievement ? " (⭐ Kartu Prestasi)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Santri</Label>
            {isEdit ? (
              <Input value={students.find((s) => s.id === studentId)?.fullName ?? "—"} disabled />
            ) : (
              <Select value={studentId} onValueChange={setStudentId} required>
                <SelectTrigger className="w-full">
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
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entryDate">Tanggal</Label>
            <Input id="entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </div>

          {template && (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-slate-50/60 p-4">
              {template.fields.map((f) => (
                <div key={f.id} className={f.type === "CHECKBOX" ? "" : "space-y-1.5"}>
                  {f.type !== "CHECKBOX" && (
                    <Label htmlFor={`field-${f.id}`}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </Label>
                  )}
                  <FieldInput
                    field={f}
                    value={values[f.id]}
                    onChange={(v) => setValue(f.id, v)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="freeText">Catatan Bebas (opsional)</Label>
            <Textarea
              id="freeText"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ringkasan atau catatan tambahan…"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">{error}</p>
          )}

          <Button type="submit" disabled={saving || !templateId || !studentId} className="min-w-40">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Menyimpan…
              </>
            ) : (
              <>
                <Save className="size-4" /> Simpan Jurnal
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
