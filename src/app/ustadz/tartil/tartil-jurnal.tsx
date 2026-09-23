"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  BookOpen,
  GraduationCap,
  Loader2,
  MessageSquareText,
  PenLine,
  Plus,
  Save,
  Settings2,
  Star,
  X,
} from "lucide-react";

import {
  generateTartilJilidsAction,
  saveTartilAssessmentAction,
  saveTartilTemplateAction,
  deleteTartilTemplateAction,
  type TartilNoteInput,
} from "@/app/actions/tartil";
import {
  NOTE_SLOTS,
  NOTE_SLOT_LABELS,
  NOTE_SLOT_COLORS,
  type NoteSlot,
} from "@/lib/tartil-shared";
import type { TahfidzMode } from "@/lib/tahfidz";
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
 * V12.16 — JURNAL PENILAIAN TARTIL (sesuai desain guru):
 *   1. Pilih Santri (semua binaan dalam satu form)
 *   2. Jilid (dari METODE lembaga: Iqro/Ummi/Tartili/Tilawati/…) + "Ganti Metode"
 *   3. Dari Halaman + Sampai Halaman
 *   4. Nilai — mengikuti mode lembaga: Centang / Dropdown Huruf (A+…D) / Angka
 *   5. Catatan Guru — teks bebas + TEMPLATE per kategori (Apresiasi, Bacaan,
 *      Tajwid, Kelancaran, Semangat, Saran untuk Orang Tua, dst). Klik chip =
 *      isi catatan, ikon pensil = edit, ikon ✕ = hapus. {nama} diganti otomatis.
 */

type StudentOption = { studentId: string; fullName: string; businessCode: string };
type MaterialOption = { id: string; name: string };
type GradeOption = { label: string; minValue: number; maxValue: number };
type TemplateOption = { id: string; slot: NoteSlot; content: string };

const LABEL_CLS = "flex items-center gap-1.5 text-[0.82rem] font-bold";

const MODE_TABS: { value: TahfidzMode; label: string }[] = [
  { value: "CENTANG", label: "Centang" },
  { value: "HURUF", label: "Huruf" },
  { value: "ANGKA", label: "Angka" },
];

export function TartilJurnalForm({
  students,
  materials,
  methods,
  grades,
  mode: initialMode,
  templates,
}: {
  students: StudentOption[];
  materials: MaterialOption[];
  /** Metode baca lembaga: { name: "Ummi", jilidCount: 8 } — dipakai dropdown Jilid & Ganti Metode. */
  methods: { id: string; name: string; jilidCount: number }[];
  grades: GradeOption[];
  /** Mode bawaan dari Pengaturan → Tartil (admin); guru tetap bisa ganti sendiri di form ini. */
  mode: TahfidzMode;
  templates: TemplateOption[];
}) {
  const [studentId, setStudentId] = useState("");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [materialId, setMaterialId] = useState("");
  const [fromPage, setFromPage] = useState("1");
  const [toPage, setToPage] = useState("1");
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  // V33 — mode nilai TIDAK terkunci ke pengaturan admin: guru dapat memilih
  // Centang/Huruf/Angka langsung di form ini (default = pengaturan admin).
  const [mode, setMode] = useState<TahfidzMode>(initialMode);
  const [scoreLabel, setScoreLabel] = useState(grades[0]?.label ?? "");
  const [scoreValue, setScoreValue] = useState("");
  // Mode Centang: guru mencentang sendiri (bukan teks mati).
  const [scoreChecked, setScoreChecked] = useState(true);
  const [freeNote, setFreeNote] = useState("");
  // Editor template: slot yang sedang dibuka + isi edit (null = tambah baru).
  const [editing, setEditing] = useState<{ slot: NoteSlot; id: string | null; content: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [genPending, startGen] = useTransition();

  /** Template dikelompokkan per slot dengan urutan kategori sesuai desain. */
  const grouped = useMemo(() => {
    const map = new Map<NoteSlot, TemplateOption[]>();
    for (const slot of NOTE_SLOTS) map.set(slot, []);
    for (const t of templates) {
      if (!map.has(t.slot)) map.set(t.slot, []);
      map.get(t.slot)!.push(t);
    }
    return map;
  }, [templates]);

  /** Jilid tersedia = materi milik metode terpilih (nama berawalan nama metode). */
  const method = methods.find((m) => m.id === methodId) ?? null;
  const jilids = useMemo(() => {
    if (!method) return materials;
    const prefix = `${method.name} Jilid`;
    const own = materials.filter((m) => m.name.startsWith(prefix));
    return own.length > 0 ? own : materials;
  }, [materials, method]);

  function pickMethod(nextId: string) {
    setMethodId(nextId);
    setMaterialId("");
    setShowMethodPicker(false);
    const m = methods.find((x) => x.id === nextId);
    if (m && m.jilidCount > 0) {
      startGen(async () => {
        const res = await generateTartilJilidsAction(m.id);
        if (res.error) toast.error(res.error);
        else if ((res.created ?? 0) > 0)
          toast.success(`${res.created} jilid "${m.name}" ditambahkan ke daftar materi.`);
      });
    }
  }

  const selectedStudent = students.find((s) => s.studentId === studentId);

  function useTemplate(content: string) {
    setFreeNote(content.replaceAll("{nama}", selectedStudent?.fullName ?? "ananda"));
  }

  function submitTemplate() {
    if (!editing) return;
    const content = editing.content.trim();
    if (content.length < 3) return toast.error("Template minimal 3 karakter.");
    startTransition(async () => {
      const res = await saveTartilTemplateAction({
        id: editing.id,
        slot: editing.slot,
        content,
      });
      if (res.success) {
        toast.success(res.success);
        setEditing(null);
      } else if (res.error) toast.error(res.error);
    });
  }

  function removeTemplate(id: string) {
    startTransition(async () => {
      const res = await deleteTartilTemplateAction(id);
      if (res.success) toast.success(res.success);
      else if (res.error) toast.error(res.error);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!studentId) return toast.error("Pilih santri terlebih dahulu.");
    if (!materialId) return toast.error("Pilih jilid terlebih dahulu.");

    const pages = fromPage === toPage ? fromPage : `${fromPage}-${toPage}`;
    const noteInputs: TartilNoteInput[] = [];
    if (freeNote.trim()) {
      noteInputs.push({ slot: "APRESIASI" as NoteSlot, content: freeNote.trim() });
    }

    startTransition(async () => {
      const res = await saveTartilAssessmentAction({
        studentId,
        materialId,
        pagesLabel: pages,
        status: mode === "CENTANG" && !scoreChecked ? "DIPELAJARI" : "DINILAI",
        scoreValue: mode === "ANGKA" && scoreValue !== "" ? Number(scoreValue) : null,
        scoreLabel: mode === "HURUF" ? scoreLabel : "",
        freeNote: "",
        notes: noteInputs,
      });
      if (res.success) {
        toast.success(res.success);
        setFreeNote("");
        setScoreValue("");
        if (grades[0]) setScoreLabel(grades[0].label);
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  }

  if (students.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Belum ada santri binaan Anda. Pastikan admin sudah menetapkan Anda sebagai pengampu halaqah.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* 1. PILIH SANTRI */}
      <div className="space-y-1.5">
        <Label htmlFor="tj-student" className="text-blue-700 dark:text-blue-400">
          <span className={LABEL_CLS}><GraduationCap className="size-4" /> Pilih Santri</span>
        </Label>
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger id="tj-student" className="h-11 w-full">
            <SelectValue placeholder="Pilih santri…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {students.map((s) => (
              <SelectItem key={s.studentId} value={s.studentId}>
                {s.fullName} ({s.businessCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 2-3. JILID + DARI/SAMPAI HALAMAN */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="tj-jilid" className="text-orange-600 dark:text-orange-300">
              <span className={LABEL_CLS}><BookMarked className="size-4" /> Jilid</span>
            </Label>
            <button
              type="button"
              onClick={() => setShowMethodPicker((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-600"
            >
              <Settings2 className="size-3.5" /> Ganti Metode
            </button>
          </div>
          <Select value={materialId} onValueChange={setMaterialId}>
            <SelectTrigger id="tj-jilid" className="h-11 w-full">
              <SelectValue placeholder={method ? `${method.name} — pilih jilid…` : "Pilih jilid…"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {jilids.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tj-from" className="text-violet-600 dark:text-violet-300">
            <span className={LABEL_CLS}><BookOpen className="size-4" /> Dari Halaman</span>
          </Label>
          <Input
            id="tj-from"
            type="number"
            min={1}
            max={999}
            inputMode="numeric"
            className="h-11"
            value={fromPage}
            onChange={(e) => setFromPage(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tj-to" className="text-violet-600 dark:text-violet-300">
            <span className={LABEL_CLS}><BookOpen className="size-4" /> Sampai Halaman</span>
          </Label>
          <Input
            id="tj-to"
            type="number"
            min={1}
            max={999}
            inputMode="numeric"
            className="h-11"
            value={toPage}
            onChange={(e) => setToPage(e.target.value)}
          />
        </div>
      </div>

      {showMethodPicker && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-yellow-500/30 dark:bg-yellow-500/10">
          <p className="w-full text-xs font-semibold text-amber-800 dark:text-yellow-300">
            Metode baca lembaga — pilih untuk mengganti daftar jilid:
          </p>
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={genPending}
              onClick={() => pickMethod(m.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                m.id === methodId
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              {m.name}
              {m.jilidCount > 0 ? ` (${m.jilidCount} jilid)` : ""}
            </button>
          ))}
          <p className="w-full text-[0.7rem] text-amber-700/80 dark:text-yellow-300/70">
            Jilid baru otomatis ditambahkan ke daftar materi oleh sistem. Kelola daftar metode di
            Pengaturan → Tartil (Admin).
          </p>
        </div>
      )}

      {/* 4. NILAI */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="tj-score" className="text-emerald-700 dark:text-emerald-400">
            <span className={LABEL_CLS}><Star className="size-4" /> Nilai</span>
          </Label>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground mr-0.5 text-[0.7rem] font-semibold">Mode:</span>
            {MODE_TABS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  mode === m.value
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {mode === "CENTANG" ? (
          <label
            htmlFor="tj-score-check"
            className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm transition-colors hover:border-role/40 dark:border-slate-700 dark:bg-slate-900"
          >
            <input
              id="tj-score-check"
              type="checkbox"
              checked={scoreChecked}
              onChange={(e) => setScoreChecked(e.target.checked)}
              className="size-5 cursor-pointer accent-emerald-600"
            />
            {scoreChecked ? (
              <span className="font-bold text-emerald-600 dark:text-emerald-300">✓ Lancar</span>
            ) : (
              <span className="text-muted-foreground">Belum lancar (kosongkan bila belum)</span>
            )}
          </label>
        ) : mode === "HURUF" ? (
          grades.length > 0 ? (
            <Select value={scoreLabel} onValueChange={setScoreLabel}>
              <SelectTrigger id="tj-score" className="h-11 w-full">
                <SelectValue placeholder="Pilih nilai huruf…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {grades.map((g) => (
                  <SelectItem key={g.label} value={g.label}>
                    {g.label}
                    <span className="text-muted-foreground ml-2 text-xs">
                      ({g.minValue}–{g.maxValue})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
              Belum ada pilihan nilai huruf — admin bisa menambahkannya di Pengaturan → Tahfidz.
            </div>
          )
        ) : (
          <Input
            id="tj-score"
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            className="h-11"
            placeholder="1–100"
            value={scoreValue}
            onChange={(e) => setScoreValue(e.target.value)}
            required
          />
        )}
      </div>

      {/* 5. CATATAN GURU + TEMPLATE PER KATEGORI */}
      <div className="space-y-2">
        <Label htmlFor="tj-note" className="text-pink-600">
          <span className={LABEL_CLS}><MessageSquareText className="size-4" /> Catatan Guru</span>
        </Label>
        <Textarea
          id="tj-note"
          rows={4}
          maxLength={500}
          value={freeNote}
          onChange={(e) => setFreeNote(e.target.value)}
          placeholder="Tuliskan catatan, evaluasi, atau apresiasi untuk ananda yang akan dibaca oleh orang tua…"
          className="text-sm"
        />
        {selectedStudent && freeNote.length === 0 && templates.length > 0 && (
          <p className="text-muted-foreground text-[0.7rem]">
            Klik template di bawah untuk mengisi — {"{nama}"} diganti otomatis.
          </p>
        )}

        {/* Editor template (tambah/edit) */}
        {editing && (
          <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
              {editing.id ? "Edit Template" : "Template Baru"} — {NOTE_SLOT_LABELS[editing.slot]}
            </p>
            <div className="flex gap-2">
              <Input
                autoFocus
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                placeholder="Tulis template (gunakan {nama} untuk nama santri)…"
                className="text-sm"
                maxLength={300}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitTemplate();
                  }
                  if (e.key === "Escape") setEditing(null);
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={submitTemplate} disabled={pending}>
                <PenLine className="size-3.5" /> Simpan
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Batal
              </Button>
            </div>
          </div>
        )}

        {/* Kategori template sesuai desain guru */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900">
          {NOTE_SLOTS.filter((slot) => (grouped.get(slot)?.length ?? 0) > 0).map((slot) => (
            <div key={slot}>
              <p className={`text-[0.7rem] font-bold tracking-wide ${NOTE_SLOT_COLORS[slot]}`}>
                {NOTE_SLOT_LABELS[slot].toUpperCase()}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(grouped.get(slot) ?? []).map((t) =>
                  editing?.id === t.id ? null : (
                    <span
                      key={t.id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <button
                        type="button"
                        className="min-w-0 max-w-64 truncate text-left hover:text-role-strong dark:hover:text-blue-400 sm:max-w-96"
                        onClick={() => useTemplate(t.content)}
                        title="Klik untuk memakai template ini"
                      >
                        {t.content}
                      </button>
                      <button
                        type="button"
                        aria-label="Edit template"
                        className="text-muted-foreground/80 transition-colors hover:text-blue-600"
                        onClick={() => setEditing({ slot, id: t.id, content: t.content })}
                      >
                        <PenLine className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Hapus template"
                        className="text-muted-foreground/80 transition-colors hover:text-red-600"
                        onClick={() => removeTemplate(t.id)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  )
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEditing({ slot: "APRESIASI", id: null, content: "" })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
          >
            <Plus className="size-3.5" /> Tambah Template
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={pending || !studentId || !materialId}
        className="bg-gradient-brand w-full sm:w-auto"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Simpan Penilaian
      </Button>
    </form>
  );
}
