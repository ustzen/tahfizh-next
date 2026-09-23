"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save, Wand2 } from "lucide-react";

import { saveTartilAssessmentAction, type TartilNoteInput } from "@/app/actions/tartil";
import { NOTE_SLOT_LABELS, type NoteSlot } from "@/lib/tartil-shared";
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

type MaterialOption = { id: string; name: string; pagesLabel: string | null };
type GradeOption = { label: string; minValue: number; maxValue: number };
type TemplateOption = { slot: NoteSlot; content: string };

const NOTE_SLOTS: NoteSlot[] = ["APRESIASI", "BACAAN", "FASHOHAH", "SARAN", "CATATAN_ORANG_TUA"];

/**
 * Rules #9-#10 flow (mobile-first), #11 V3 scoring, #12-#13 structured notes
 * with template pre-fill, #34 explicit Simpan, #35 double-submit guard,
 * #37 form values survive failures.
 */
export function TartilAssessmentForm({
  studentId,
  mode,
  grades,
  materials,
  templates,
}: {
  studentId: string;
  mode: TahfidzMode;
  grades: GradeOption[];
  materials: MaterialOption[];
  templates: TemplateOption[];
}) {
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [pagesLabel, setPagesLabel] = useState(materials[0]?.pagesLabel ?? "");
  const [scoreLabel, setScoreLabel] = useState(grades[0]?.label ?? "");
  const [scoreValue, setScoreValue] = useState("");
  const [status, setStatus] = useState<"BELUM" | "DIPELAJARI" | "DINILAI">("DINILAI");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [freeNote, setFreeNote] = useState("");
  const [pending, startTransition] = useTransition();

  const activeMaterial = useMemo(
    () => materials.find((m) => m.id === materialId),
    [materials, materialId]
  );

  // Templates grouped per slot for the "gunakan template" selector.
  const templatesBySlot = useMemo(() => {
    const map = new Map<string, TemplateOption[]>();
    for (const t of templates) {
      const list = map.get(t.slot) ?? [];
      list.push(t);
      map.set(t.slot, list);
    }
    return map;
  }, [templates]);

  function onMaterialChange(next: string) {
    setMaterialId(next);
    const m = materials.find((x) => x.id === next);
    setPagesLabel(m?.pagesLabel ?? "");
  }

  function applyTemplates() {
    const filled: Record<string, string> = {};
    for (const slot of NOTE_SLOTS) {
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
    if (!materialId) {
      toast.error("Pilih materi terlebih dahulu.");
      return;
    }
    const noteInputs: TartilNoteInput[] = NOTE_SLOTS.filter((s) => (notes[s] ?? "").trim())
      .map((s) => ({ slot: s, content: notes[s].trim() }));

    startTransition(async () => {
      const res = await saveTartilAssessmentAction({
        studentId,
        materialId,
        pagesLabel,
        status,
        scoreValue: status === "DINILAI" && mode === "ANGKA" && scoreValue !== "" ? Number(scoreValue) : null,
        scoreLabel: status === "DINILAI" && mode === "HURUF" ? scoreLabel : "",
        freeNote,
        notes: noteInputs,
      });
      if (res.success) {
        toast.success(res.success);
        // Clear the form for the next entry (history refreshes via revalidation).
        setNotes({});
        setFreeNote("");
      } else if (res.error) {
        toast.error(res.error); // form values intentionally kept (rule #37)
      }
    });
  }

  if (materials.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Lembaga Anda belum mengaktifkan materi Tartil. Hubungi Admin melalui Pengaturan → Tartil.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="material">Materi</Label>
          <Select value={materialId} onValueChange={onMaterialChange}>
            <SelectTrigger id="material" className="w-full">
              <SelectValue placeholder="Pilih materi" />
            </SelectTrigger>
            <SelectContent>
              {materials.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pages">Halaman / Bagian</Label>
          <Input
            id="pages"
            value={pagesLabel}
            onChange={(e) => setPagesLabel(e.target.value)}
            maxLength={60}
            placeholder={activeMaterial?.pagesLabel ?? "mis. 3–4"}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tstatus">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger id="tstatus" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DINILAI">Sudah dinilai</SelectItem>
              <SelectItem value="DIPELAJARI">Sedang dipelajari</SelectItem>
              <SelectItem value="BELUM">Belum mulai</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tscore">Penilaian</Label>
          {mode === "CENTANG" ? (
            <div className="border-input bg-background flex h-9 w-full items-center rounded-xl border px-3 text-sm">
              {status === "DINILAI" ? (
                <span className="font-bold text-emerald-600 dark:text-emerald-300">✓ Lancar</span>
              ) : (
                <span className="text-muted-foreground">— (belum dinilai)</span>
              )}
            </div>
          ) : mode === "HURUF" ? (
            <Select value={scoreLabel} onValueChange={setScoreLabel}>
              <SelectTrigger id="tscore" className="w-full">
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
              id="tscore"
              type="number"
              min={1}
              max={100}
              step={1}
              inputMode="numeric"
              placeholder="1-100"
              value={scoreValue}
              onChange={(e) => setScoreValue(e.target.value)}
              required={status === "DINILAI"}
              disabled={status !== "DINILAI"}
              className="max-w-40"
            />
          )}
        </div>
      </div>

      {/* Structured notes (rule #12-#13) */}
      <div className="space-y-3 rounded-xl border border-role/15 bg-role-soft/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">Catatan Terstruktur</p>
          <Button type="button" variant="outline" size="sm" onClick={applyTemplates}>
            <Wand2 className="size-3.5" /> Gunakan Template
          </Button>
        </div>
        {NOTE_SLOTS.map((slot) => (
          <div key={slot} className="space-y-1">
            <Label htmlFor={`note-${slot}`} className="text-xs font-semibold text-muted-foreground">
              {NOTE_SLOT_LABELS[slot]}
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
          placeholder="Catatan singkat untuk histori."
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
