"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { BookOpenText, HandHeart, Loader2, Pencil, Plus, Save, ScrollText, X } from "lucide-react";

import { saveSetoranAction } from "@/app/actions/setoran";
import { saveSetoranLearningAction } from "@/app/actions/setoran-learning";
import {
  createInlineTemplateAction,
  deleteInlineTemplateAction,
  updateInlineTemplateAction,
} from "@/app/actions/setoran-template-inline";
import { SUBMISSION_RESULTS, SUBMISSION_RESULT_LABELS } from "@/lib/setoran-shared";
import { NOTE_SLOT_LABELS } from "@/lib/learning-shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/loading";

/**
 * TAHFIZH V12.12 — Form "Setoran Hafalan" langsung di menu Setoran.
 *
 * Sesuai desain: 3 tab (Tahfidz Al-Qur'an / Hadits / Doa Harian), guru memilih
 * SANTRI di dalam form (bukan lewat daftar dulu). Setoran tersimpan ke modul
 * terkait (Tahfidz → tahfidz_submissions; Hadits/Doa → learning_assessments)
 * sehingga otomatis sinkron ke menu modul & dasbor wali murid. Mode nilai
 * dipilih sendiri per setoran. "Pilih Surat" otomatis mengarah ke materi
 * berikutnya yang belum disetorkan (bisa diubah manual).
 */

type Tab = "TAHFIDZ" | "HADITS" | "DOA";
type Mode = "CENTANG" | "HURUF" | "ANGKA";

type StudentOption = { id: string; name: string; code: string | null };
type SurahOption = { id: string; name: string };
type MaterialOption = { id: string; title: string; subtitle: string | null };
type GradeOption = { label: string; minValue: number; maxValue: number };
type TemplateOption = { id: string; slot: string; content: string };

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

/** Slot catatan per tab (label grup template cepat sesuai contoh). */
const NOTE_SLOTS_BY_TAB: Record<Tab, string[]> = {
  TAHFIDZ: ["APRESIASI", "BACAAN", "TAJWID_FASHAHAH", "SEMANGAT", "CATATAN_ORANG_TUA"],
  HADITS: ["APRESIASI", "BACAAN", "TAJWID_FASHAHAH", "SEMANGAT", "CATATAN_ORANG_TUA"],
  DOA: ["APRESIASI", "BACAAN", "TAJWID_FASHAHAH", "SEMANGAT", "CATATAN_ORANG_TUA"],
};

/** Label slot tampilan (mengikuti contoh: Apresiasi, Bacaan, Tajwid & Fashahah, Semangat, Saran untuk Orang Tua). */
const SETORAN_SLOT_LABELS: Record<string, string> = {
  APRESIASI: "Apresiasi",
  BACAAN: "Bacaan",
  TAJWID_FASHAHAH: "Tajwid & Fashahah",
  SEMANGAT: "Semangat",
  CATATAN_ORANG_TUA: "Saran untuk Orang Tua",
  // fallback slot lama (bila masih ada template berlabel lama)
  KELANCARAN: "Kelancaran",
  KESALAHAN: "Kesalahan",
  SARAN: "Saran",
  HAFALAN: "Hafalan",
  PELAFALAN: "Pelafalan",
  PENGAMALAN: "Pengamalan",
};

/** Warna badge label per slot (Apresiasi merah, Bacaan biru, Tajwid kuning, Semangat hijau, Orang Tua ungu). */
const SLOT_BADGE_COLORS: Record<string, string> = {
  APRESIASI: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  BACAAN: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  TAJWID_FASHAHAH: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  SEMANGAT: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  CATATAN_ORANG_TUA: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  // fallback slot lama
  KELANCARAN: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  KESALAHAN: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  SARAN: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  HAFALAN: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  PELAFALAN: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  PENGAMALAN: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
};

function noteSlotLabel(tab: Tab, slot: string): string {
  return SETORAN_SLOT_LABELS[slot] ?? NOTE_SLOT_LABELS[slot] ?? slot;
}

/** Isi template tanpa titik di akhir — klik 2 template tak menghasilkan tanda baca ganda. */
function stripTrailingDot(s: string): string {
  return (s ?? "").trim().replace(/[.\s]+$/u, "").trim();
}

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function SetoranDirectForm({
  students,
  surahs,
  haditsMaterials,
  doaMaterials,
  defaultMode,
  grades,
  templatesByTab,
  studentId,
}: {
  students: StudentOption[];
  surahs: SurahOption[];
  haditsMaterials: MaterialOption[];
  doaMaterials: MaterialOption[];
  defaultMode: Mode;
  grades: GradeOption[];
  templatesByTab: Record<Tab, TemplateOption[]>;
  studentId?: string;
}) {
  // studentId prop = mode detail santri; undefined = dropdown pilih santri.
  const [selectedStudent, setSelectedStudent] = useState(studentId ?? students[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("TAHFIDZ");
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [passed, setPassed] = useState(false); // "Sudah menguasai / lulus setoran"

  // Tahfidz — jenis setoran dihilangkan (default Hafalan Baru, server-side).
  const [surahId, setSurahId] = useState(surahs[0]?.id ?? "");
  const [ayatLabel, setAyatLabel] = useState("");

  // Hadits / Doa.
  const [haditsId, setHaditsId] = useState(haditsMaterials[0]?.id ?? "");
  const [doaId, setDoaId] = useState(doaMaterials[0]?.id ?? "");

  // Umum.
  const [assessedDate, setAssessedDate] = useState(todayIso());
  const [scoreLabel, setScoreLabel] = useState(grades[0]?.label ?? "");
  const [scoreValue, setScoreValue] = useState("");
  const [freeNote, setFreeNote] = useState("");
  const [pending, startTransition] = useTransition();

  // V12.12 — kelola template cepat langsung dari form.
  const [addOpen, setAddOpen] = useState(false);
  const [addSlot, setAddSlot] = useState(NOTE_SLOTS_BY_TAB[tab][0]);
  const [addContent, setAddContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  const templates = templatesByTab[tab] ?? [];

  /** Template cepat dikelompokkan per slot (label: Apresiasi, Kelancaran, dll). */
  const templateGroups = useMemo(() => {
    const map = new Map<string, TemplateOption[]>();
    for (const t of templates) {
      const list = map.get(t.slot) ?? [];
      // Isi sudah tanpa titik akhiran (chip, klik, dan tooltip sama rata).
      list.push({ ...t, content: stripTrailingDot(t.content) });
      map.set(t.slot, list);
    }
    const order = NOTE_SLOTS_BY_TAB[tab];
    return order
      .filter((slot) => map.has(slot))
      .map((slot) => ({ slot, label: noteSlotLabel(tab, slot), items: map.get(slot)! }));
  }, [templates, tab]);

  /** Tambah template baru pada label terpilih. */
  function onAddTemplate() {
    startTransition(async () => {
      const res = await createInlineTemplateAction({ module: tab, slot: addSlot, content: addContent });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Template ditambahkan — langsung dipakai di form ini.");
        setAddContent("");
        setAddOpen(false);
      }
    });
  }

  /** Simpan hasil edit isi template. */
  function onSaveEditTemplate() {
    if (!editingId) return;
    startTransition(async () => {
      const res = await updateInlineTemplateAction({ module: tab, templateId: editingId, content: editingContent });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Template diperbarui.");
        setEditingId(null);
        setEditingContent("");
      }
    });
  }

  /** Hapus template (ikon × pada chip). */
  function onDeleteTemplate(templateId: string) {
    startTransition(async () => {
      const res = await deleteInlineTemplateAction({ module: tab, templateId });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Template dihapus.");
      }
    });
  }

  function resetAfterSave() {
    setAyatLabel("");
    setFreeNote("");
    setScoreValue("");
    setPassed(false);
  }

  /** Pilih surat otomatis: materi berikutnya yang belum disetorkan santri ini. */
  function pickNextSurah() {
    if (surahs.length === 0) return;
    const idx = surahs.findIndex((s) => s.id === surahId);
    const next = surahs[(idx + 1 + surahs.length) % surahs.length];
    setSurahId(next.id);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedStudent) {
      toast.error("Pilih santri terlebih dahulu.");
      return;
    }
    // Centang "Sudah menguasai" = LULUS; tidak dicentang = PERLU_MENGULANG.
    const result = passed ? "LULUS" : "PERLU_MENGULANG";

    if (tab === "TAHFIDZ") {
      if (!surahId) {
        toast.error("Pilih surat terlebih dahulu.");
        return;
      }
      if (mode === "ANGKA" && scoreValue === "") {
        toast.error("Nilai wajib diisi untuk mode Angka.");
        return;
      }

      startTransition(async () => {
        const res = await saveSetoranAction({
          studentId: selectedStudent,
          tenantSurahId: surahId,
          kind: "HAFALAN_BARU", // jenis setoran dihilangkan dari UI — default hafalan baru
          ayatLabel,
          assessedDate,
          result,
          scoreValue: mode === "ANGKA" && scoreValue !== "" ? Number(scoreValue) : null,
          scoreLabel: mode === "HURUF" ? scoreLabel : "",
          freeNote,
          notes: [],
          mode,
        });
        if (res.success) {
          toast.success("Setoran Tahfidz tersimpan — masuk ke menu Tahfidz & dasbor wali murid.");
          resetAfterSave();
          pickNextSurah();
        } else if (res.error) {
          toast.error(res.error);
        }
      });
      return;
    }

    const materialId = tab === "HADITS" ? haditsId : doaId;
    if (!materialId) {
      toast.error(`Pilih materi ${tab === "HADITS" ? "hadits" : "doa"} terlebih dahulu.`);
      return;
    }
    if (mode === "ANGKA" && scoreValue === "") {
      toast.error("Nilai wajib diisi untuk mode Angka.");
      return;
    }
    startTransition(async () => {
      const res = await saveSetoranLearningAction({
        module: tab,
        studentId: selectedStudent,
        materialId,
        assessedDate,
        result: result as "LULUS" | "PERLU_MENGULANG" | "DITUNDA",
        mode,
        scoreValue: mode === "ANGKA" && scoreValue !== "" ? Number(scoreValue) : null,
        scoreLabel: mode === "HURUF" ? scoreLabel : "",
        freeNote,
        notes: [],
      });
      if (res.success) {
        toast.success(`Setoran ${tab === "HADITS" ? "hadits" : "doa"} tersimpan — masuk ke menu modul & dasbor wali murid.`);
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

      {/* Tanggal setoran — di bagian atas sebelum Pilih Santri */}
      <div className="space-y-1.5">
        <Label htmlFor="setoran-date">Tanggal Setoran</Label>
        <Input
          id="setoran-date"
          type="date"
          value={assessedDate}
          onChange={(e) => setAssessedDate(e.target.value)}
          required
          className="w-full sm:max-w-56"
        />
      </div>

      {/* Pilih Santri */}
      {!studentId && (
        <div className="space-y-1.5">
          <Label htmlFor="setoran-student">Pilih Santri</Label>
          <Select value={selectedStudent} onValueChange={setSelectedStudent}>
            <SelectTrigger id="setoran-student" className="w-full">
              <SelectValue placeholder="Pilih santri" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.code ?? "—"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Pilihan materi sesuai tab */}
      {tab === "TAHFIDZ" ? (
        <>
          {/* Kolom Surat & Ayat berdampingan kanan-kiri */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="surah">Pilih Surat</Label>
              <Select value={surahId} onValueChange={setSurahId}>
                <SelectTrigger id="surah" className="w-full text-blue-700 dark:text-blue-300">
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
                Otomatis memilih materi berikutnya yang belum disetorkan. Bisa diubah manual jika perlu.
              </p>
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

      {/* Nilai Setoran + Mode Nilai */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Nilai Setoran</Label>
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
          <label className="border-input flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-muted/50 dark:hover:bg-slate-800/40">
            <Checkbox checked={passed} onCheckedChange={(v) => setPassed(v === true)} />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Sudah menguasai / lulus setoran
            </span>
          </label>
        ) : mode === "HURUF" ? (
          <Select value={scoreLabel} onValueChange={setScoreLabel}>
            <SelectTrigger className="w-full">
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
            type="number"
            min={1}
            max={100}
            step={1}
            inputMode="numeric"
            placeholder="1-100"
            value={scoreValue}
            onChange={(e) => setScoreValue(e.target.value)}
            required
            className="max-w-40"
          />
        )}
        <p className="text-muted-foreground text-xs">
          Mode nilai ini juga berlaku untuk penilaian {tab === "TAHFIDZ" ? "Tahfidz Al-Qur'an" : tab === "HADITS" ? "Hadits" : "Doa Harian"} di menu Hafalan terkait.
        </p>
      </div>

      {/* Catatan Khusus ke Orang Tua — SATU kolom isian + template cepat di bawah */}
      <div className="space-y-2.5 rounded-xl border border-slate-100 p-1 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Catatan Khusus ke Orang Tua</p>
        </div>
        <Textarea
          id="note-parent"
          rows={3}
          maxLength={500}
          value={freeNote}
          onChange={(e) => setFreeNote(e.target.value)}
          placeholder="Tuliskan pesan, evaluasi, atau apresiasi untuk ananda yang akan dibaca oleh orang tua…"
        />

        {/* Template cepat (di bawah textarea) — dikelompokkan per label:
            Apresiasi (2 contoh), Kelancaran (2 contoh), dll.
            Klik = tulisan template langsung masuk ke textarea. */}
        {/* Template cepat — klik chip = tulis ke textarea; pensil = edit; + = tambah dengan pilih label */}
        <div className="space-y-2 px-1 pb-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs font-semibold">Template Cepat — klik untuk menambahkan ke catatan (dipisahkan tanda koma):</p>
            <button
              type="button"
              onClick={() => {
                setAddSlot(NOTE_SLOTS_BY_TAB[tab][0]);
                setAddOpen((v) => !v);
              }}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              <Plus className="size-3.5" /> Tambah Template
            </button>
          </div>

          {/* Form tambah: pilih label + isi template */}
          {addOpen && (
            <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-500/20 dark:bg-blue-500/5">
              <div className="space-y-1">
                <Label htmlFor="tpl-slot" className="text-xs font-semibold">Label Template</Label>
                <Select value={addSlot} onValueChange={setAddSlot}>
                  <SelectTrigger id="tpl-slot" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_SLOTS_BY_TAB[tab].map((slot) => (
                      <SelectItem key={slot} value={slot}>
                        {noteSlotLabel(tab, slot)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-content" className="text-xs font-semibold">Isi Template</Label>
                <Textarea
                  id="tpl-content"
                  rows={2}
                  maxLength={300}
                  value={addContent}
                  onChange={(e) => setAddContent(e.target.value)}
                  placeholder="Tuliskan template baru…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)} disabled={pending}>
                  Batal
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onAddTemplate}
                  disabled={pending || !addContent.trim()}
                  className="bg-role text-role-ink hover:brightness-95"
                >
                  {pending ? <Spinner /> : <Plus className="size-3.5" />} Tambah
                </Button>
              </div>
            </div>
          )}

          {templateGroups.length === 0 && (
            <p className="text-muted-foreground px-1 text-xs italic">
              Belum ada template. Klik “Tambah Template” untuk membuatnya — pilih label Apresiasi, Kelancaran, dll.
            </p>
          )}

          {templateGroups.map((g) => (
            <div key={g.slot} className="space-y-1">
              <span
                className={`inline-block rounded-md px-2 py-0.5 text-[0.7rem] font-bold tracking-wide uppercase ${
                  SLOT_BADGE_COLORS[g.slot] ?? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {g.label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white pl-3 pr-1 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {editingId === t.id ? (
                      <span className="flex w-64 items-center gap-1 py-0.5">
                        <Input
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          maxLength={300}
                          className="h-6 border-none bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onSaveEditTemplate();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={onSaveEditTemplate}
                          title="Simpan perubahan"
                          className="rounded p-0.5 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          title="Batal"
                          className="rounded p-0.5 text-muted-foreground/80 hover:bg-muted"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setFreeNote((prev) => {
                              // Menyambung, bukan mengganti: tiap template yang
                              // diklik ditambahkan di akhir catatan, dipisah koma.
                              // {nama} diganti nama depan santri terpilih.
                              const studentName = students.find((s) => s.id === selectedStudent)?.name;
                              const firstName = studentName?.trim().split(/\s+/)[0];
                              const text = firstName ? t.content.replaceAll("{nama}", firstName) : t.content;
                              const base = prev.trim();
                              return base ? `${base}, ${text}` : text;
                            })
                          }
                          title={t.content}
                          className="py-1 text-left"
                        >
                          {t.content.length > 46 ? `${t.content.slice(0, 46)}…` : t.content}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(t.id);
                            setEditingContent(t.content);
                          }}
                          title="Ubah template ini"
                          className="rounded p-1 text-muted-foreground/80 hover:bg-muted hover:text-role-strong dark:hover:bg-slate-800"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTemplate(t.id)}
                          title="Hapus template ini"
                          className="rounded p-1 text-muted-foreground/80 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/20"
                        >
                          <X className="size-3" />
                        </button>
                      </>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
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
      </div>
    </form>
  );
}
