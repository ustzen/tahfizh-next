"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save, Wand2 } from "lucide-react";

import { saveLearningAssessmentAction, type LearningNoteInput } from "@/app/actions/learning";
import {
  LEARNING_MODULE_CONFIGS,
  NOTE_SLOT_LABELS,
  type LearningModule,
} from "@/lib/learning-shared";
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

type MaterialOption = { id: string; title: string; subtitle: string | null; arabicText: string | null; translation: string | null };
type GradeOption = { label: string; minValue: number; maxValue: number };
type TemplateOption = { slot: string; content: string };

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Generic form for the three V6 modules (rule #2 pattern). Mobile-first
 * (rule #40), V3 scoring (rule #8/#14), template pre-fill (rule #10/#19),
 * explicit Simpan (rule #34 V5), double-submit guard (rule #45), values
 * survive failures (rule #46).
 */
export function LearningAssessmentForm({
  module,
  studentId,
  mode,
  grades,
  materials,
  templates,
}: {
  module: LearningModule;
  studentId: string;
  mode: TahfidzMode;
  grades: GradeOption[];
  materials: MaterialOption[];
  templates: TemplateOption[];
}) {
  const config = LEARNING_MODULE_CONFIGS[module];
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [assessedDate, setAssessedDate] = useState(todayIso());
  // V12.7 — mode penilaian BEBAS DIPILIH per penilaian; default = mode lembaga.
  const [selectedMode, setSelectedMode] = useState<TahfidzMode>(mode);
  const [scoreLabel, setScoreLabel] = useState(grades[0]?.label ?? "");
  const [scoreValue, setScoreValue] = useState("");
  const [status, setStatus] = useState(config.statuses[0].value);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [freeNote, setFreeNote] = useState("");
  const [pending, startTransition] = useTransition();

  const MODE_TABS: { key: TahfidzMode; label: string }[] = [
    { key: "CENTANG", label: "Centang" },
    { key: "HURUF", label: "Huruf" },
    { key: "ANGKA", label: "Angka" },
  ];

  const activeMaterial = useMemo(
    () => materials.find((m) => m.id === materialId),
    [materials, materialId]
  );

  const templatesBySlot = useMemo(() => {
    const map = new Map<string, TemplateOption[]>();
    for (const t of templates) {
      const list = map.get(t.slot) ?? [];
      list.push(t);
      map.set(t.slot, list);
    }
    return map;
  }, [templates]);

  function applyTemplates() {
    const filled: Record<string, string> = {};
    for (const slot of config.noteSlots) {
      const first = templatesBySlot.get(slot)?.[0]?.content;
      if (first) filled[slot] = first;
    }
    setNotes((prev) => ({ ...filled, ...prev })); // don't overwrite typed content
    if (Object.keys(filled).length > 0) {
      toast("Template catatan diterapkan. Silakan sesuaikan isinya.");
    } else {
      toast("Belum ada template aktif untuk lembaga Anda.");
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Rule #44 client-side checks (RPC re-validates authoritatively).
    if (!materialId) {
      toast.error("Pilih materi terlebih dahulu.");
      return;
    }
    if (!assessedDate) {
      toast.error("Tanggal penilaian wajib diisi.");
      return;
    }

    const noteInputs: LearningNoteInput[] = config.noteSlots
      .filter((s) => (notes[s] ?? "").trim())
      .map((s) => ({ slot: s, content: notes[s].trim() }));

    startTransition(async () => {
      const res = await saveLearningAssessmentAction({
        module,
        studentId,
        materialId,
        assessedDate,
        status,
        mode: selectedMode, // V12.7 — mode bebas per penilaian
        scoreValue: selectedMode === "ANGKA" && scoreValue !== "" ? Number(scoreValue) : null,
        scoreLabel: selectedMode === "HURUF" ? scoreLabel : "",
        freeNote,
        notes: noteInputs,
      });
      if (res.success) {
        toast.success(res.success);
        setNotes({});
        setFreeNote("");
      } else if (res.error) {
        toast.error(res.error); // form values kept (rule #46)
      }
    });
  }

  if (materials.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Lembaga Anda belum memiliki materi {config.label.toLowerCase()}. Hubungi Admin melalui
        Pengaturan → Materi Pembelajaran.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="material">Materi</Label>
          <Select value={materialId} onValueChange={setMaterialId}>
            <SelectTrigger id="material" className="w-full">
              <SelectValue placeholder="Pilih materi" />
            </SelectTrigger>
            <SelectContent>
              {materials.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                  {m.subtitle ? ` — ${m.subtitle}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="date">Tanggal</Label>
          <Input
            id="date"
            type="date"
            value={assessedDate}
            onChange={(e) => setAssessedDate(e.target.value)}
            required
            className="w-full"
          />
        </div>
      </div>

      {/* Material preview (Arabic + translation when provided, rule #5/#12/#16) */}
      {activeMaterial?.arabicText && (
        <div className="rounded-xl border border-role/15 bg-role-soft/40 p-4">
          <p dir="rtl" className="text-right text-xl leading-loose text-foreground">
            {activeMaterial.arabicText}
          </p>
          {activeMaterial.translation && (
            <p className="text-muted-foreground mt-2 text-sm italic">“{activeMaterial.translation}”</p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.statuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* V3 scoring engine (rule #8/#14) + V12.7: mode bebas dipilih. */}
        <div className="space-y-1.5">
          <Label htmlFor="score">Mode Penilaian</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {MODE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelectedMode(t.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedMode === t.key
                    ? "border-blue-300 bg-blue-100 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {selectedMode === "CENTANG" ? (
            <div className="border-input bg-background flex h-9 w-full items-center rounded-xl border px-3 text-sm">
              <span className="font-bold text-emerald-600 dark:text-emerald-300">✓</span>
              <span className="text-muted-foreground ml-2 text-xs">Lancar (centang)</span>
            </div>
          ) : selectedMode === "HURUF" ? (
            <Select value={scoreLabel} onValueChange={setScoreLabel}>
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
          ) : (
            <Input
              id="score"
              type="number"
              min={1}
              max={100}
              step={1}
              inputMode="numeric"
              placeholder="1-100"
              value={scoreValue}
              onChange={(e) => setScoreValue(e.target.value)}
              className="max-w-40"
            />
          )}
        </div>
      </div>

      {/* Structured notes (rule #10/#19) */}
      <div className="space-y-3 rounded-xl border border-role/15 bg-role-soft/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">Catatan Terstruktur</p>
          <Button type="button" variant="outline" size="sm" onClick={applyTemplates}>
            <Wand2 className="size-3.5" /> Gunakan Template
          </Button>
        </div>
        {config.noteSlots.map((slot) => (
          <div key={slot} className="space-y-1">
            <Label htmlFor={`note-${slot}`} className="text-xs font-semibold text-muted-foreground">
              {NOTE_SLOT_LABELS[slot] ?? slot}
            </Label>
            <textarea
              id={`note-${slot}`}
              rows={2}
              maxLength={500}
              value={notes[slot] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [slot]: e.target.value }))}
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
              placeholder={templatesBySlot.get(slot)?.[0]?.content ?? "Tulis catatan (opsional)"}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="freeNote">Catatan Bebas (opsional)</Label>
        <textarea
          id="freeNote"
          rows={2}
          maxLength={500}
          value={freeNote}
          onChange={(e) => setFreeNote(e.target.value)}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-xl border px-3.5 py-2.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
          placeholder="Catatan singkat untuk penilaian ini."
        />
      </div>

      <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Menyimpan…
          </>
        ) : (
          <>
            <Save className="size-4" /> Simpan Penilaian
          </>
        )}
      </Button>
    </form>
  );
}
