"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  CircleDashed,
  GraduationCap,
  Layers,
  Loader2,
  Search,
  Settings2,
  Square,
} from "lucide-react";

import {
  generateTartilJilidsAction,
  getTartilOnDateEntriesAction,
  saveTartilAssessmentsBulkAction,
  type TartilOnDateEntry,
} from "@/app/actions/tartil";
import type { TahfidzMode } from "@/lib/tahfidz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * V67 — INPUT NILAI TARTIL SECARA MASSAL.
 * Untuk lembaga baru yang datanya masih di kertas: guru memilih jilid + rentang
 * halaman (sama untuk semua santri), lalu mengisi nilai per santri dalam satu
 * tabel. Baris yang kosong tidak ikut tersimpan; tombol "Set Semua" membantu
 * bila nilainya seragam. Semua aturan (binaan, materi aktif, mode lembaga)
 * tetap ditegakkan oleh RPC — client tidak pernah dipercaya.
 *
 * V74 — santri yang SUDAH bernilai pada tanggal terpilih langsung tampil di
 * baris pengisiannya (prefill). Guru bisa membiarkan nilainya (simpan = update
 * baris yang sama lewat assessment_id — bukan duplikat) atau menggantinya;
 * baris yang dikosongkan tidak diubah sama sekali.
 *
 * V76 — perbaikan & penegasan:
 *   * Nilai lama otomatis tampil begitu tanggal dipilih (jilid & halaman ikut
 *     terpilih bila guru belum memilih jilid).
 *   * Tiap baris diberi penanda "Sudah dinilai" / "Belum dinilai" + ringkasan
 *     dan filter, supaya guru langsung tahu siapa yang belum bernilai.
 *   * Hanya baris BARU atau yang nilainya DIUBAH yang dikirim saat simpan —
 *     nilai lama yang dibiarkan tidak ditulis ulang.
 *   * Nilai di jilid LAIN pada tanggal itu hanya ditampilkan sebagai badge,
 *     tidak lagi ikut tersimpan sebagai penilaian baru di jilid terpilih.
 *   * Baris lama yang diedit mempertahankan halaman aslinya.
 *   * Entri terbaru yang dipakai (bukan yang terlama) + anti balapan fetch.
 */

type StudentOption = { studentId: string; fullName: string; nis: string | null };
type MaterialOption = { id: string; name: string };
type GradeOption = { label: string; minValue: number; maxValue: number };

const LABEL_CLS = "flex items-center gap-1.5 text-[0.82rem] font-bold";

const MODE_TABS: { value: TahfidzMode; label: string }[] = [
  { value: "CENTANG", label: "Centang" },
  { value: "HURUF", label: "Huruf" },
  { value: "ANGKA", label: "Angka" },
];

export function TartilBulkForm({
  students,
  materials,
  methods,
  grades,
  mode: initialMode,
  today,
}: {
  students: StudentOption[];
  materials: MaterialOption[];
  methods: { id: string; name: string; jilidCount: number }[];
  grades: GradeOption[];
  /** Mode bawaan Pengaturan → Tartil (admin); guru bisa ganti langsung di sini. */
  mode: TahfidzMode;
  /** Hari ini (WIB, YYYY-MM-DD) — default & batas input tanggal. */
  today: string;
}) {
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [materialId, setMaterialId] = useState("");
  const [fromPage, setFromPage] = useState("1");
  const [toPage, setToPage] = useState("1");
  /** V68 — tanggal penilaian (sesuai kertas untuk data lama). */
  const [assessedDate, setAssessedDate] = useState(today);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  /** Entry per santri: "" = belum diisi (baris dilewati saat simpan). */
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<TahfidzMode>(initialMode);
  /** HURUF: nilai acuan tombol "Set Semua". */
  const [bulkGrade, setBulkGrade] = useState(grades[0]?.label ?? "");
  /** ANGKA: angka acuan tombol "Set Semua". */
  const [bulkValue, setBulkValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [genPending, startGen] = useTransition();

  /** V76 — metadata baris yang sudah tersimpan (studentId → id, nilai awal, halaman asli). */
  const [existing, setExisting] = useState<
    Record<string, { id: string; value: string; pages: string | null }>
  >({});

  // V73 — fetch entri guru pada tanggal terpilih.
  const [onDateEntries, setOnDateEntries] = useState<TartilOnDateEntry[]>([]);
  const [loadingDate, setLoadingDate] = useState(false);
  /** Anti balapan: hanya respons fetch terakhir yang dipakai. */
  const fetchSeq = useRef(0);
  /** True bila guru sendiri sudah memilih jilid (jangan di-override auto-pilih). */
  const userPickedMaterial = useRef(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "belum" | "sudah">("all");

  const fetchOnDate = useCallback(async (date: string | "") => {
    const seq = ++fetchSeq.current;
    if (!date) {
      setOnDateEntries([]);
      setLoadingDate(false);
      return;
    }
    setLoadingDate(true);
    try {
      const { entries } = await getTartilOnDateEntriesAction(date);
      if (seq === fetchSeq.current) setOnDateEntries(entries);
    } catch {
      if (seq === fetchSeq.current) setOnDateEntries([]);
    } finally {
      if (seq === fetchSeq.current) setLoadingDate(false);
    }
  }, []);
  useEffect(() => {
    void fetchOnDate(assessedDate);
  }, [assessedDate, fetchOnDate]);

  /** Semua entri per santri pada tanggal terpilih (terbaru dulu — urutan RPC). */
  const entriesByStudent = useMemo(() => {
    const map = new Map<string, TartilOnDateEntry[]>();
    for (const e of onDateEntries) {
      const arr = map.get(e.studentId);
      if (arr) arr.push(e);
      else map.set(e.studentId, [e]);
    }
    return map;
  }, [onDateEntries]);

  /** Santri yang sudah punya nilai (status DINILAI) pada tanggal terpilih. */
  const gradedIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of onDateEntries) if (e.status === "DINILAI") set.add(e.studentId);
    return set;
  }, [onDateEntries]);

  /** Nilai entri → string input sesuai mode aktif ("" bila tak bisa diwakili mode ini). */
  const entryToValue = useCallback(
    (e: TartilOnDateEntry): string => {
      if (e.status !== "DINILAI") return "";
      if (mode === "CENTANG") return e.scoreLabel === null && e.scoreValue === null ? "1" : "";
      if (mode === "HURUF") {
        const label = (e.scoreLabel ?? "").trim().toUpperCase();
        if (!label) return "";
        return grades.find((g) => g.label.trim().toUpperCase() === label)?.label ?? "";
      }
      return e.scoreValue !== null ? String(e.scoreValue) : "";
    },
    [mode, grades]
  );

  // V76 — Auto-pilih jilid (& halaman) dari nilai yang sudah ada, bila guru
  // belum memilih jilid sendiri. Jilid yang paling banyak dipakai menang.
  useEffect(() => {
    if (userPickedMaterial.current || materialId || onDateEntries.length === 0) return;
    const count = new Map<string, number>();
    for (const e of onDateEntries) {
      if (e.status !== "DINILAI") continue;
      if (!materials.some((m) => m.id === e.materialId)) continue;
      count.set(e.materialId, (count.get(e.materialId) ?? 0) + 1);
    }
    let best = "";
    let bestN = 0;
    for (const [id, n] of count) if (n > bestN) { best = id; bestN = n; }
    if (!best) return;
    const mat = materials.find((m) => m.id === best);
    const owner = mat ? methods.find((m) => mat.name.startsWith(`${m.name} Jilid`)) : null;
    if (owner) setMethodId(owner.id);
    setMaterialId(best);
    const pg = onDateEntries.find((e) => e.materialId === best && e.pagesLabel)?.pagesLabel ?? "";
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(pg.trim());
    if (m) {
      setFromPage(m[1]);
      setToPage(m[2] ?? m[1]);
    }
  }, [onDateEntries, materialId, materials, methods]);

  // V76 — PREFILL: nilai lama pada JILID TERPILIH langsung masuk ke kolom
  // pengisian (siap diubah / dibiarkan). Entri jilid lain TIDAK diprefill —
  // hanya tampil sebagai badge, supaya tidak tersimpan sebagai nilai baru.
  useEffect(() => {
    const next: Record<string, string> = {};
    const meta: Record<string, { id: string; value: string; pages: string | null }> = {};
    if (materialId) {
      for (const [studentId, list] of entriesByStudent) {
        // terbaru dulu; ambil entri jilid terpilih yang bisa diwakili mode ini
        const e = list.find((x) => x.materialId === materialId && entryToValue(x) !== "");
        if (!e) continue;
        const v = entryToValue(e);
        next[studentId] = v;
        meta[studentId] = { id: e.assessmentId, value: v, pages: e.pagesLabel };
      }
    }
    setEntries(next);
    setExisting(meta);
  }, [materialId, entriesByStudent, entryToValue]);

  const method = methods.find((m) => m.id === methodId) ?? null;
  const methodJilids = method
    ? materials.filter((m) => m.name.startsWith(`${method.name} Jilid`))
    : [];
  const jilids = methodJilids.length > 0 ? methodJilids : materials;

  const q = query.trim().toLowerCase();
  const visibleStudents = students.filter((s) => {
    if (q && !s.fullName.toLowerCase().includes(q) && !(s.nis ?? "").toLowerCase().includes(q)) {
      return false;
    }
    if (statusFilter === "belum") return !gradedIds.has(s.studentId);
    if (statusFilter === "sudah") return gradedIds.has(s.studentId);
    return true;
  });
  const gradedTotal = students.filter((s) => gradedIds.has(s.studentId)).length;
  const belumTotal = students.length - gradedTotal;

  /** Baris yang perlu dikirim: BARU, atau nilai lama yang DIUBAH. */
  function isDirty(studentId: string): boolean {
    const v = entries[studentId] ?? "";
    if (v === "") return false;
    const ex = existing[studentId];
    return !ex || ex.value !== v;
  }
  const filledCount = visibleStudents.filter((s) => isDirty(s.studentId)).length;

  function pickMethod(nextId: string) {
    userPickedMaterial.current = true;
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

  function setEntry(studentId: string, value: string) {
    setEntries((prev) => ({ ...prev, [studentId]: value }));
  }

  function checkEntry(studentId: string, on: boolean) {
    setEntries((prev) => ({ ...prev, [studentId]: on ? "1" : "" }));
  }

  function setAllCentang(on: boolean) {
    setEntries((prev) => {
      const next = { ...prev };
      for (const s of visibleStudents) next[s.studentId] = on ? "1" : "";
      return next;
    });
  }

  function setAllValue() {
    if (mode === "HURUF") {
      if (!bulkGrade) return toast.error("Pilih nilai huruf terlebih dahulu.");
      setEntries((prev) => {
        const next = { ...prev };
        for (const s of visibleStudents) next[s.studentId] = bulkGrade;
        return next;
      });
      return;
    }
    if (!/^\d+$/.test(bulkValue)) return toast.error("Isi angka 1-100 untuk Set Semua.");
    const n = Number(bulkValue);
    if (n < 1 || n > 100) return toast.error("Nilai harus angka 1-100.");
    setEntries((prev) => {
      const next = { ...prev };
      for (const s of visibleStudents) next[s.studentId] = bulkValue;
      return next;
    });
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!materialId) return toast.error("Pilih jilid terlebih dahulu.");
    if (filledCount === 0) {
      return toast.error(
        gradedTotal > 0
          ? "Belum ada nilai baru atau perubahan untuk disimpan."
          : "Isi nilai minimal satu santri."
      );
    }

    const pagesLabel = fromPage === toPage ? fromPage : `${fromPage}-${toPage}`;
    const items = visibleStudents
      .filter((s) => isDirty(s.studentId))
      .map((s) => {
        const raw = entries[s.studentId];
        const ex = existing[s.studentId];
        // Edit nilai lama → pertahankan halaman aslinya; baris baru → halaman form.
        const pages = ex ? ex.pages ?? "" : pagesLabel;
        const assessmentId = ex?.id ?? null;
        if (mode === "HURUF") {
          return {
            studentId: s.studentId, materialId, pagesLabel: pages, status: "DINILAI",
            scoreValue: null, scoreLabel: raw, assessmentId,
          };
        }
        if (mode === "ANGKA") {
          return {
            studentId: s.studentId, materialId, pagesLabel: pages, status: "DINILAI",
            scoreValue: Number(raw), scoreLabel: "", assessmentId,
          };
        }
        return {
          studentId: s.studentId, materialId, pagesLabel: pages, status: "DINILAI",
          scoreValue: null, scoreLabel: "", assessmentId,
        };
      });

    startTransition(async () => {
      const res = await saveTartilAssessmentsBulkAction(items, assessedDate === today ? null : assessedDate);
      if (res.success) {
        toast.success(res.success);
        void fetchOnDate(assessedDate); // V76 — segarkan: nilai baru jadi "sudah dinilai"
      } else if (res.error) toast.error(res.error);
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
    <form onSubmit={onSave} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-6">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tb-tanggal" className="text-rose-600 dark:text-rose-300">
            <span className={LABEL_CLS}><CalendarDays className="size-4" /> Tanggal Penilaian</span>
          </Label>
          <Input
            id="tb-tanggal" type="date" required
            className="h-11" value={assessedDate} max={today}
            onChange={(e) => {
              setAssessedDate(e.target.value);
              // Ganti tanggal tanpa jilid pilihan sendiri → boleh auto-pilih lagi.
            }}
            aria-label="Tanggal penilaian (sesuai catatan kertas)"
          />
          <p className="text-muted-foreground text-[0.7rem]">
            Ubah untuk data kertas lama — semua nilai di batch ini memakai tanggal ini.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="tb-jilid" className="text-orange-600 dark:text-orange-300">
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
          <Select
            value={materialId}
            onValueChange={(v) => {
              userPickedMaterial.current = true;
              setMaterialId(v);
            }}
          >
            <SelectTrigger id="tb-jilid" className="h-11 w-full">
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
          <Label htmlFor="tb-from" className="text-violet-600 dark:text-violet-300">
            <span className={LABEL_CLS}><BookOpen className="size-4" /> Dari Halaman</span>
          </Label>
          <Input
            id="tb-from" type="number" min={1} max={999} inputMode="numeric"
            className="h-11" value={fromPage} onChange={(e) => setFromPage(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tb-to" className="text-violet-600 dark:text-violet-300">
            <span className={LABEL_CLS}><BookOpen className="size-4" /> Sampai Halaman</span>
          </Label>
          <Input
            id="tb-to" type="number" min={1} max={999} inputMode="numeric"
            className="h-11" value={toPage} onChange={(e) => setToPage(e.target.value)}
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

      {/* 2. MODE NILAI + SET SEMUA */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
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
        {mode === "CENTANG" ? (
          <div className="flex items-center gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setAllCentang(true)}>
              <CheckSquare className="size-3.5" /> Centang semua
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => setAllCentang(false)}>
              <Square className="size-3.5" /> Kosongkan
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {mode === "HURUF" ? (
              <Select value={bulkGrade} onValueChange={setBulkGrade}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue placeholder="Nilai…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {grades.map((g) => (
                    <SelectItem key={g.label} value={g.label}>
                      {g.label} <span className="text-muted-foreground text-[0.65rem]">({g.minValue}–{g.maxValue})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                inputMode="numeric"
                maxLength={3}
                placeholder="1–100"
                className="h-8 w-20 text-xs"
                aria-label="Nilai untuk Set Semua"
              />
            )}
            <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={setAllValue}>
              <Layers className="size-3.5" /> Set semua
            </Button>
          </div>
        )}
      </div>

      {/* 3. DAFTAR SANTRI — isi nilai per baris */}
      {grades.length === 0 && mode === "HURUF" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
          Belum ada pilihan nilai huruf — admin bisa menambahkannya di Pengaturan → Tahfidz.
        </div>
      )}

      <div className="space-y-1.5">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Cari nama santri… (${students.length} santri binaan Anda)`}
            className="pl-9"
            aria-label="Cari santri binaan"
          />
        </div>
        <p className="text-muted-foreground text-[0.7rem]">
          Baris yang dikosongkan tidak ikut tersimpan — lengkapi bertahap jika data belum semua.
          Nilai yang sudah ada pada tanggal ini tampil otomatis; ubah nilainya untuk memperbarui.
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {loadingDate ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
              <Loader2 className="size-3.5 animate-spin" /> Memeriksa nilai pada tanggal ini…
            </span>
          ) : (
            <>
              {([
                { v: "all", label: `Semua (${students.length})` },
                { v: "belum", label: `Belum dinilai (${belumTotal})` },
                { v: "sudah", label: `Sudah dinilai (${gradedTotal})` },
              ] as const).map((f) => (
                <button
                  key={f.v}
                  type="button"
                  onClick={() => setStatusFilter(f.v)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    statusFilter === f.v
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="max-h-[24rem] space-y-1.5 overflow-y-auto pr-1">
        {visibleStudents.map((s) => {
          const value = entries[s.studentId] ?? "";
          return (
            <div
              key={s.studentId}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                value !== ""
                  ? "border-role/40 bg-role-soft/40"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              }`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300" aria-hidden>
                {s.fullName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{s.fullName}</p>
                <p className="text-muted-foreground font-mono text-[0.7rem]">{s.nis ?? "—"}</p>
              </div>

              {/* V76 — penanda status pada tanggal terpilih:
                  • nilai di jilid terpilih sudah ada → "Sudah dinilai" (atau "Diubah")
                  • hanya ada nilai di jilid lain / tak terwakili mode ini → badge info
                  • belum ada apa pun → "Belum dinilai" */}
              {(() => {
                const list = entriesByStudent.get(s.studentId) ?? [];
                const ex = existing[s.studentId];
                if (ex) {
                  const changed = value !== ex.value;
                  return (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-[0.65rem] font-bold ${
                        changed
                          ? "bg-amber-100 text-amber-800 dark:bg-yellow-500/15 dark:text-yellow-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                      }`}
                    >
                      <CheckCircle2 className="size-3" />
                      {changed ? "Akan diubah" : "Sudah dinilai"}
                    </span>
                  );
                }
                const prev = list.find((e) => e.status === "DINILAI") ?? list[0];
                if (!prev) {
                  return (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <CircleDashed className="size-3" /> Belum dinilai
                    </span>
                  );
                }
                const mat = materials.find((m) => m.id === prev.materialId);
                const score = prev.status !== "DINILAI"
                  ? prev.status === "DIPELAJARI" ? "Dipelajari" : "Belum lancar"
                  : prev.scoreLabel ?? (prev.scoreValue !== null ? String(prev.scoreValue) : "✓ Lancar");
                return (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-100 px-2 py-0.5 text-[0.65rem] font-bold text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
                    title={`Sudah tercatat pada tanggal ini: ${mat?.name ?? "jilid lain"}`}
                  >
                    <CheckCircle2 className="size-3" />
                    {mat?.name ?? "Jilid lain"} · {score}
                  </span>
                );
              })()}

              {mode === "CENTANG" ? (
                <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-foreground/85">
                  <Checkbox
                    checked={value === "1"}
                    onCheckedChange={(c) => checkEntry(s.studentId, c === true)}
                    aria-label={`Lancar — ${s.fullName}`}
                  />
                  Lancar
                </label>
              ) : mode === "HURUF" ? (
                <Select value={value} onValueChange={(v) => setEntry(s.studentId, v)}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {grades.map((g) => (
                      <SelectItem key={g.label} value={g.label}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={value}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
                    setEntry(s.studentId, digits);
                  }}
                  inputMode="numeric"
                  placeholder="1–100"
                  className="h-8 w-20 text-center text-xs"
                  aria-label={`Nilai angka — ${s.fullName}`}
                />
              )}
            </div>
          );
        })}
        {visibleStudents.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">Tidak ada santri yang cocok.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || filledCount === 0 || !materialId} className="bg-gradient-brand">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
          {gradedTotal > 0 ? `Simpan ${filledCount} Penilaian / Perubahan` : `Simpan ${filledCount} Penilaian Sekaligus`}
        </Button>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <GraduationCap className="size-3.5" />
          {gradedTotal} dari {students.length} santri sudah dinilai pada tanggal ini
          {filledCount > 0 ? ` · ${filledCount} menunggu disimpan` : ""}
        </span>
      </div>
    </form>
  );
}
