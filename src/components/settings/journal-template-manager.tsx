"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, NotebookPen, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  deleteJournalTemplateAction,
  moveJournalTemplateAction,
  saveJournalTemplateAction,
  setJournalTemplateActiveAction,
} from "@/app/actions/v7";
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
import { Badge } from "@/components/ui/badge";
import {
  JOURNAL_FIELD_TYPES,
  JOURNAL_FIELD_TYPE_LABELS,
  type JournalFieldDef,
  type JournalFieldType,
} from "@/lib/v7-shared";
import type { JournalAdminTemplateDto } from "@/lib/v7";
import { cn } from "@/lib/utils";

const EMPTY_FIELD: JournalFieldDef = { label: "", type: "TEXT", required: false, options: null };

export function JournalTemplateManager({ templates }: { templates: JournalAdminTemplateDto[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showInAchievement, setShowInAchievement] = useState(false);
  const [fields, setFields] = useState<JournalFieldDef[]>([{ ...EMPTY_FIELD }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setName("");
    setDescription("");
    setShowInAchievement(false);
    setFields([{ ...EMPTY_FIELD }]);
    setCreating(true);
    setError(null);
  }

  function openEdit(t: JournalAdminTemplateDto) {
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description ?? "");
    setShowInAchievement(t.showInAchievement);
    setFields(
      t.fields.map((f) => ({
        label: f.label,
        type: f.type as JournalFieldType,
        required: f.required,
        options: f.options,
      }))
    );
    setCreating(true);
    setError(null);
  }

  function closeForm() {
    setCreating(false);
    setEditingId(null);
  }

  function updateField(idx: number, patch: Partial<JournalFieldDef>) {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await saveJournalTemplateAction({
      templateId: editingId,
      name,
      description,
      showInAchievement,
      fields,
    });
    if (res.error) {
      setError(res.error);
      setBusy(false);
      return;
    }
    toast.success(res.success ?? "Template tersimpan.");
    setBusy(false);
    closeForm();
    router.refresh();
  }

  async function run(fn: () => Promise<{ error?: string; success?: string }>) {
    const res = await fn();
    if (res.error) toast.error(res.error);
    else {
      toast.success(res.success ?? "Berhasil.");
      router.refresh();
    }
  }

  return (
    <Card className="shadow-card rounded-2xl">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="size-4 text-role" /> Template Jurnal
          </CardTitle>
          <CardDescription>
            Template tenant-specific dengan field dinamis (teks, angka, pilihan, checkbox, tanggal). Template
            ber-ikon ⭐ tampil di Kartu Prestasi (rule #31).
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" /> Template Baru
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {creating && (
          <form onSubmit={onSave} className="space-y-4 rounded-2xl border border-role/15 bg-role-soft/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nama Template *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Jurnal Akhlak"
                  required
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Deskripsi</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Field Form</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFields((p) => [...p, { ...EMPTY_FIELD }])}
                  disabled={fields.length >= 40}
                >
                  <Plus className="size-3.5" /> Tambah Field
                </Button>
              </div>

              {fields.map((f, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-card p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                    <Input
                      value={f.label}
                      onChange={(e) => updateField(idx, { label: e.target.value })}
                      placeholder={`Label field ${idx + 1} (mis. Kedisiplinan)`}
                      maxLength={80}
                    />
                    <Select
                      value={f.type}
                      onValueChange={(v) => updateField(idx, { type: v as JournalFieldType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JOURNAL_FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {JOURNAL_FIELD_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Hapus field"
                      onClick={() => setFields((p) => p.filter((_, i) => i !== idx))}
                      disabled={fields.length === 1}
                      className="text-muted-foreground/80 hover:text-red-600"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <label className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={f.required}
                        onCheckedChange={(c) => updateField(idx, { required: c === true })}
                      />
                      Wajib diisi
                    </label>
                    {f.type === "SELECT" && (
                      <div className="flex-1">
                        <Input
                          value={(f.options ?? []).join(", ")}
                          onChange={(e) =>
                            updateField(idx, {
                              options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                            })
                          }
                          placeholder="Opsi dipisah koma: Baik, Cukup, Perlu Bimbingan"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showInAchievement} onCheckedChange={(c) => setShowInAchievement(c === true)} />
              Tampilkan entry jurnal ini di Kartu Prestasi (rule #31)
            </label>

            {error && (
              <p className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">{error}</p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="min-w-40">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {editingId ? "Simpan Perubahan" : "Buat Template"}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                Batal
              </Button>
            </div>
          </form>
        )}

        {templates.length === 0 && !creating ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Belum ada template jurnal.</p>
        ) : (
          <ul className="space-y-3">
            {templates.map((t, i) => (
              <li key={t.id} className="rounded-2xl border border-border/60 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{t.name}</p>
                      {t.showInAchievement && (
                        <Badge className="bg-amber-100 dark:bg-amber-500/15 text-[10px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100">
                          ⭐ Kartu Prestasi
                        </Badge>
                      )}
                      {!t.isActive && (
                        <Badge variant="outline" className="text-[10px]">
                          Nonaktif
                        </Badge>
                      )}
                    </div>
                    {t.description && <p className="text-muted-foreground mt-0.5 text-xs">{t.description}</p>}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t.fields.length} field · {t.entryCount} jurnal tersimpan
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.fields.map((f) => f.label).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Naikkan urutan"
                      disabled={busy || i === 0}
                      onClick={() => run(() => moveJournalTemplateAction({ templateId: t.id, direction: "UP" }))}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Turunkan urutan"
                      disabled={busy || i === templates.length - 1}
                      onClick={() => run(() => moveJournalTemplateAction({ templateId: t.id, direction: "DOWN" }))}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit template"
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t.isActive ? "Nonaktifkan" : "Aktifkan"}
                      onClick={() =>
                        run(() => setJournalTemplateActiveAction({ templateId: t.id, active: !t.isActive }))
                      }
                    >
                      <Power className={cn("size-4", t.isActive ? "text-emerald-600" : "text-slate-400")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Hapus template"
                      disabled={busy || t.entryCount > 0}
                      title={t.entryCount > 0 ? "Sudah dipakai — nonaktifkan saja" : "Hapus"}
                      className="text-muted-foreground/80 hover:text-red-600"
                      onClick={() => {
                        if (window.confirm(`Hapus template \"${t.name}\"?`)) {
                          run(() => deleteJournalTemplateAction({ templateId: t.id }));
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
