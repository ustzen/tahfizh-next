"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { BookOpenText, HandHeart, Loader2, Plus, Save, ScrollText, Wand2 } from "lucide-react";

import { saveSetoranAction, type SetoranNoteInput } from "@/app/actions/setoran";
import { saveSetoranLearningAction } from "@/app/actions/setoran-learning";
import {
  SUBMISSION_KINDS,
  SUBMISSION_KIND_LABELS,
  SUBMISSION_RESULTS,
  SUBMISSION_RESULT_LABELS,
} from "@/lib/setoran-shared";
import type { SubmissionNoteSlot } from "@/lib/setoran-shared";
import { NOTE_SLOT_LABELS } from "@/lib/learning-shared";
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
import { Textarea } from "@/components/ui/textarea";

/**
 * TAHFIZH V12.11 — Form Setoran 3 Tab (Tahfidz / Hadits / Doa Harian).
 *
 * Sesuai desain: guru memilih tab modul yang disetorkan — data OTOMATIS
 * terinput ke modul terkait (Tahfidz → tahfidz_submissions; Hadits/Doa →
 * learning_assessments) sehingga langsung tampil di menu modul & dasbor
 * santri. Mode nilai (Centang/Huruf/Angka) dipilih SENDIRI per tab. Catatan
 * punya tombol "+ Tambah Template" — memakai template lembaga per slot.
 */

type Tab = "TAHFIDZ" | "HADITS" | "DOA";
type Mode = "CENTANG" | "HURUF" | "ANGKA";

type SurahOption = { id: string; name: string };
type MaterialOption = { id: string; title: string; subtitle: string | null };
type GradeOption = { label: string; minValue: number; maxValue: number };
type TemplateOption = { slot: string; content: string };

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "TAHFIDZ", label: "Tahfidz Al-Qur'an", icon: <ScrollText className="size-4" /> },
  { key: "HADITS", label: "Hadits", icon: <BookOpenText className="size-4" /> },
  { key: "DOA", label: "Doa Harian", icon: <HandHeart className="size-4" /> },
];

const MODE_OPTIONS: { key: Mode; label: string }[] = [
  { key: "CENTANG", label: "Centang (Menguasai)" },
  { key: "HURUF", label: "Huruf (A/B/C/D)" },
  { key: "ANGKA", label: "Angka (0-100)" },
];

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Slot catatan per tab (harus cocok dengan vocab RPC server). */
const NOTE_SLOTS_BY_TAB: Record<Tab, string[]> = {
  TAHFIDZ: ["APRESIASI", "KELANCARAN", "KESALAHAN", "SARAN", "CATATAN_ORANG_TUA"],
  HADITS: ["APRESIASI", "HAFALAN", "BACAAN", "SARAN", "CATATAN_ORANG_TUA"],
  DOA: ["APRESIASI", "HAFALAN", "PELAFALAN", "PENGAMALAN", "CATATAN_ORANG_TUA"],
};

function noteSlotLabel(tab: Tab, slot: string): string {
  if (tab === "TAHFIDZ") return SUBMISSION_NOTE_SLOT_LABELS_FALLBACK[slot] ?? slot;
  return NOTE_SLOT_LABELS[slot] ?? slot;
}

const SUBMISSION_NOTE_SLOT_LABELS_FALLBACK: Record<string, string> = {
  APRESIASI: "Apresiasi",
  KELANCARAN: "Kelancaran",
  KESALAHAN: "Kesalahan",
  SARAN: "Saran",
  CATATAN_ORANG_TUA: "Catatan untuk Orang Tua",
};

export function SetoranMultiForm({
  studentId,
  surahs,
  haditsMaterials,
  doaMaterials,
  grades,
  defaultMode,
  templatesByTab,
}: {
  studentId: string;
  surahs: SurahOption[];
  haditsMaterials: MaterialOption[];
  doaMaterials: MaterialOption[];
  grades: GradeOption[];
  defaultMode: Mode;
  templatesByTab: Record<Tab, TemplateOption[]>;
}) {
  const [tab, setTab] = useState<Tab>("TAHFIDZ");
  const [mode, setMode] = useState<Mode>(defaultMode);

  // Field setoran Tahfidz.
  const [kind, setKind] = useState<"HAFALAN_BARU" | "MUROJAAH">("HAFALAN_BARU");
  const [surahId, setSurahId] = useState(surahs[0]?.id ?? "");
  const [ayatLabel, setAyatLabel] = useState("");

  // Field setoran Hadits/Doa.
  const [haditsId, setHaditsId] = useState(haditsMaterials[0]?.id ?? "");
  const [doaId, setDoaId] = useState(doaMaterials[0]?.id ?? "");

  // Umum.
  const [assessedDate, setAssessedDate] = useState(todayIso());
  const [result, setResult] = useState<"LULUS" | "PERLU_MENGULANG" | "DITUNDA">("LULUS");
  const [scoreLabel, setScoreLabel] = useState(grades[0]?.label ?? "");
  const [scoreValue, setScoreValue] = useState("");
  const [freeNote, setFreeNote] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const noteSlots = NOTE_SLOTS_BY_TAB[tab];
  const templates = templatesByTab[tab] ?? [];

  const templatesBySlot = useMemo(() => {
    const map = new Map<string, TemplateOption[]>();
    for (const t of templates) {
      const list = map.get(t.slot) ?? [];
      list.push(t);
      map.set(t.slot, list);
    }
    return map;
  }, [templates]);

  /** + Tambah Template: isi semua slot yang kosong dengan template lembaga. */
  function applyTemplates() {
    const filled: Record<string, string> = {};
    for (const slot of noteSlots) {
      const first = templatesBySlot.get(slot)?.[0]?.content;
      if (first) filled[slot] = first;
    }
    setNotes((prev) => ({ ...filled, ...prev })); // jangan menimpa yang sudah diketik
    if (Object.keys(filled).length > 0) {
      toast("Template catatan diterapkan. Silakan sesuaikan isinya.");
    } else {
      toast("Belum ada template aktif untuk modul ini.");
    }
  }

  /** Isi satu slot dengan template pertama slot itu (template cepat per slot). */
  function applySlotTemplate(slot: string) {
    const first = templatesBySlot.get(slot)?.[0]?.content;
    if (first) setNotes((prev) => ({ ...prev, [slot]: first }));
  }

  function resetAfterSave() {
    setAyatLabel("");
    setNotes({});
    setFreeNote("");
    setScoreValue("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (tab === "TAHFIDZ") {
      if (!surahId) {
        toast.error("Pilih surat terlebih dahulu.");
        return;
      }
      if (mode === "ANGKA" && result !== "DITUNDA" && scoreValue === "") {
        toast.error("Nilai wajib diisi untuk mode Angka.");
        return;
      }
      const noteInputs: SetoranNoteInput[] = noteSlots
        .filter((s) => (notes[s] ?? "").trim())
        .map((s) => ({ slot: s as SubmissionNoteSlot, content: notes[s].trim() }));

      startTransition(async () => {
        const res = await saveSetoranAction({
          studentId,
          tenantSurahId: surahId,
          kind,
          ayatLabel,
          assessedDate,
          result,
          scoreValue: mode === "ANGKA" && result !== "DITUNDA" && scoreValue !== "" ? Number(scoreValue) : null,
          scoreLabel: mode === "HURUF" && result !== "DITUNDA" ? scoreLabel : "",
          freeNote,
          notes: noteInputs,
          mode,
        });
        if (res.success) {
          toast.success("Setoran Tahfidz tersimpan — masuk ke menu Tahfidz & dasbor santri.");
          resetAfterSave();
        } else if (res.error) {
          toast.error(res.error);
        }
      });
      return;
    }

    // Tab Hadits / Doa — otomatis masuk modul terkait.
    const materialId = tab === "HADITS" ? haditsId : doaId;
    if (!materialId) {
      toast.error(`Pilih materi ${tab === "HADITS" ? "hadits" : "doa"} terlebih dahulu.`);
      return;
    }
    if (mode === "ANGKA" && result !== "DITUNDA" && scoreValue === "") {
      toast.error("Nilai wajib diisi untuk mode Angka.");
      return;
    }
    const noteInputs = noteSlots
      .filter((s) => (notes[s] ?? "").trim())
      .map((s) => ({ slot: s, content: notes[s].trim() }));

    startTransition(async () => {
      const res = await saveSetoranLearningAction({
        module: tab,
        studentId,
        materialId,
        assessedDate,
        result,
        mode,
        scoreValue: mode === "ANGKA" && result !== "DITUNDA" && scoreValue !== "" ? Number(scoreValue) : null,
        scoreLabel: mode === "HURUF" && result !== "DITUNDA" ? scoreLabel : "",
        freeNote,
        notes: noteInputs,
      });
      if (res.success) {
        toast.success(`Setoran ${tab === "HADITS" ? "hadits" : "doa"} tersimpan — masuk ke menu modul & dasbor santri.`);
        resetAfterSave();
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  }

  const activeMaterials = tab === "HADITS" ? haditsMaterials : doaMaterials;
  const activeMaterialId = tab === "HADITS" ? haditsId : doaId;
  const setActiveMaterialId = tab === "HADITS" ? setHaditsId : setDoaId;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* 3 Tab modul */}
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1.5 dark:bg-slate-800/60">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition sm:text-sm ${
              tab === t.key
                ? "bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="setoran-date">Tanggal</Label>
        <Input
          id="setoran-date"
          type="date"
          value={assessedDate}
          onChange={(e) => setAssessedDate(e.target.value)}
          required
          className="w-full"
        />
      </div>

      {/* Pilihan materi sesuai tab */}
      {tab === "TAHFIDZ" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kind">Jenis Setoran</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger id="kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBMISSION_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {SUBMISSION_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ayat">Ayat / Bagian</Label>
              <Input
                id="ayat"
                value={ayatLabel}
                onChange={(e) => setAyatLabel(e.target.value)}
                maxLength={60}
                placeholder="mis. 1–6 atau Awal surat"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="surah">Pilih Surat</Label>
            <Select value={surahId} onValueChange={setSurahId}>
              <SelectTrigger id="surah" className="w-full">
                <SelectValue placeholder="Pilih surat" />
              </SelectTrigger>
              <SelectContent>
                {surahs.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Otomatis memilih surat berikutnya yang belum disetorkan. Bisa diubah manual jika perlu.
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="material">Pilih Materi {tab === "HADITS" ? "Hadits" : "Doa"}</Label>
          <Select value={activeMaterialId} onValueChange={setActiveMaterialId}>
            <SelectTrigger id="material" className="w-full">
              <SelectValue placeholder="Pilih materi" />
            </SelectTrigger>
            <SelectContent>
              {activeMaterials.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                  {m.subtitle ? ` — ${m.subtitle}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Status + Nilai dengan mode per tab */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="result">Status</Label>
          <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
            <SelectTrigger id="result" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBMISSION_RESULTS.map((r) => (
                <SelectItem key={r} value={r}>
                  {SUBMISSION_RESULT_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="score">Nilai Setoran</Label>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Mode Nilai:</span>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {mode === "CENTANG" ? (
            <div className="border-input bg-background flex h-9 w-full items-center rounded-xl border px-3 text-sm">
              {result !== "DITUNDA" ? (
                <span className="font-bold text-emerald-600 dark:text-emerald-300">✓</span>
              ) : (
                <span className="text-muted-foreground">— (ditunda)</span>
              )}
            </div>
          ) : mode === "HURUF" ? (
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
              required={result !== "DITUNDA"}
              disabled={result === "DITUNDA"}
            />
          )}
          <p className="text-muted-foreground text-xs">
            Mode nilai ini berlaku untuk penilaian {tab === "TAHFIDZ" ? "Tahfidz Al-Qur'an" : tab === "HADITS" ? "Hadits" : "Doa Harian"} di menu modul terkait.
          </p>
        </div>
      </div>

      {/* Catatan dengan template cepat */}
      <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 dark:border-blue-500/20 dark:bg-blue-500/5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Catatan Khusus ke Orang Tua</p>
          <Button type="button" variant="ghost" size="sm" onClick={applyTemplates} className="h-8 text-blue-700 hover:bg-blue-100 dark:text-blue-300">
            <Plus className="size-3.5" /> Tambah Template
          </Button>
        </div>
        {noteSlots.map((slot) => (
          <div key={slot} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`note-${slot}`} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {noteSlotLabel(tab, slot)}
              </Label>
              {templatesBySlot.get(slot)?.[0] && (
                <button
                  type="button"
                  onClick={() => applySlotTemplate(slot)}
                  className="text-muted-foreground inline-flex items-center gap-1 text-[0.7rem] hover:text-role-strong dark:hover:text-blue-300"
                >
                  <Wand2 className="size-3" /> cepat
                </button>
              )}
            </div>
            <Textarea
              id={`note-${slot}`}
              rows={2}
              maxLength={500}
              value={notes[slot] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [slot]: e.target.value }))}
              placeholder={templatesBySlot.get(slot)?.[0]?.content ?? "Tuliskan pesan, evaluasi, atau apresiasi untuk ananda…"}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="freeNote">Catatan Bebas (opsional)</Label>
        <Textarea
          id="freeNote"
          rows={2}
          maxLength={500}
          value={freeNote}
          onChange={(e) => setFreeNote(e.target.value)}
          placeholder="Catatan singkat untuk setoran ini."
        />
      </div>

      <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Menyimpan…
          </>
        ) : (
          <>
            <Save className="size-4" /> Simpan Setoran
          </>
        )}
      </Button>
    </form>
  );
}
