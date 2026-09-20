"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, X } from "lucide-react";

import { saveGradesAction } from "@/app/actions/tahfidz-admin";
import type { ActionResult } from "@/app/actions/crud";
import type { GradeConfig } from "@/lib/tahfidz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = { key: string; label: string; min: string; max: string };

const DEFAULT_ROWS: Row[] = [
  { key: "a+", label: "A+", min: "96", max: "100" },
  { key: "a", label: "A", min: "91", max: "95" },
  { key: "a-", label: "A-", min: "86", max: "90" },
  { key: "b+", label: "B+", min: "81", max: "85" },
  { key: "b", label: "B", min: "76", max: "80" },
  { key: "b-", label: "B-", min: "71", max: "75" },
  { key: "c+", label: "C+", min: "66", max: "70" },
  { key: "c", label: "C", min: "61", max: "65" },
  { key: "c-", label: "C-", min: "56", max: "60" },
  { key: "d", label: "D", min: "1", max: "55" },
];

/** Rule #14 — grades are fully admin-configurable, never hard-coded. */
export function GradeConfigForm({ grades }: { grades: GradeConfig[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    grades.length > 0
      ? grades.map((g, i) => ({ key: `${g.id}-${i}`, label: g.label, min: String(g.minValue), max: String(g.maxValue) }))
      : DEFAULT_ROWS
  );
  const [pending, startTransition] = useTransition();

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const r of rows) {
      if (!r.label.trim()) continue;
      fd.append("gradeLabel", r.label.trim());
      fd.append("gradeMin", r.min);
      fd.append("gradeMax", r.max);
    }
    startTransition(async () => {
      const res: ActionResult = await saveGradesAction(null, fd);
      if (res.success) toast.success(res.success);
      else if (res.error) toast.error(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2">
            <Input
              value={r.label}
              onChange={(e) => update(r.key, { label: e.target.value })}
              placeholder="Label (mis. A)"
              maxLength={10}
              className="w-24 font-bold"
              aria-label={`Label grade ${i + 1}`}
            />
            <Input
              type="number"
              min={1}
              max={100}
              value={r.min}
              onChange={(e) => update(r.key, { min: e.target.value })}
              placeholder="Min"
              className="w-24"
              aria-label={`Nilai minimum ${i + 1}`}
            />
            <span className="text-muted-foreground text-xs">s/d</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={r.max}
              onChange={(e) => update(r.key, { max: e.target.value })}
              placeholder="Maks"
              className="w-24"
              aria-label={`Nilai maksimum ${i + 1}`}
            />
            <button
              type="button"
              aria-label="Hapus baris"
              onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
              className="rounded-md p-1.5 text-muted-foreground/80 hover:bg-red-50 hover:text-red-600"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { key: `new-${Date.now()}`, label: "", min: "1", max: "100" },
            ])
          }
        >
          <Plus className="size-4" /> Tambah Grade
        </Button>
        <Button type="submit" size="sm" disabled={pending} className="bg-gradient-brand hover:opacity-90">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Simpan Grade
        </Button>
      </div>
    </form>
  );
}
