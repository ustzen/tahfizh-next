"use client";

/**
 * TAHFIZH V12 — Export & Import Excel untuk data Guru & Santri.
 *
 * - Export: SheetJS menulis .xlsx langsung di browser (tanpa round-trip
 *   server). Nama file otomatis mengikuti nama lembaga + tahun ajaran aktif,
 *   contoh: "Data Guru TPQ Al-Hikmah Tahun Ajaran 2025-2026.xlsx".
 * - Import (V12.14): dialog sesuai desain — kotak info format kolom, tombol
 *   unduh contoh file (10 baris contoh), lalu dropzone .XLSX/.CSV (maks 10 MB).
 *   File dibaca di browser → header dipetakan lewat alias (tidak peka huruf
 *   besar/kecil; cadangan: urutan kolom A, B, C…) → PRATINJAU (jumlah baris,
 *   kolom terdeteksi, baris bermasalah) → import dikirim BERTAHAP (potongan
 *   kecil + progres) → LAPORAN hasil dengan alasan tiap baris yang gagal.
 *   Validasi ulang total tetap dilakukan di server action.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, Upload } from "lucide-react";

import {
  importStudentsAction,
  importTeachersAction,
  type ImportSummary,
} from "@/app/actions/import-export";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  importColumnsFor,
  parseSheetMatrix,
  previewValidate,
  rowNumberOf,
  type ImportIssue,
  type ImportKind as Kind,
  type ImportRow,
  type ParsedSheet,
} from "@/lib/import-shared";
import { cn } from "@/lib/utils";

const MAX_FILE_MB = 10;
/** Batas baris per file (import dikirim bertahap, jadi lebih longgar dari batas per-permintaan server). */
const MAX_FILE_ROWS = 1000;
/** Baris per permintaan ke server — tiap baris membuat akun login (beberapa panggilan Supabase Auth). */
const CHUNK_SIZE: Record<Kind, number> = { guru: 15, santri: 25 };

const TEACHER_SAMPLE: Record<string, (i: number) => string> = {
  A: (i) => `1985001${i}`,
  B: (i) => `Ustadz Contoh Ke-${i}`,
  C: (i) => `Ust. Contoh ${i}`,
  D: () => "",
  E: () => "S.Pd",
  F: (i) => (i % 2 === 1 ? "L" : "P"),
  G: () => "",
  H: (i) => `0812345678${String(i).padStart(2, "0")}`,
  I: (i) => `ustadz${i}`,
  J: (i) => `ustadz${i}1234`,
};

const STUDENT_SAMPLE: Record<string, (i: number, halaqah: string) => string> = {
  A: (i) => `2026${String(i).padStart(4, "0")}`,
  // NISN = 10 digit persis (contoh lama menghasilkan 11 digit pada baris ke-10).
  B: (i) => `${String(i).padStart(2, "0")}00123456`,
  C: (i) => `Santri Contoh Ke-${i}`,
  D: (i) => `Contoh ${i}`,
  E: (i) => (i % 2 === 1 ? "L" : "P"),
  F: (i) => `Bapak Wali ${i}`,
  G: (i, halaqah) => (i <= 5 ? halaqah : ""),
  H: (i) => `0898765432${String(i).padStart(2, "0")}`,
};

function buildWorkbookSheet(kind: Kind, halaqah: string, count = 10): XLSX.WorkSheet {
  const columns = importColumnsFor(kind);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i <= count; i++) {
    const row: Record<string, string> = {};
    for (const col of columns) {
      row[col.key] =
        kind === "guru" ? TEACHER_SAMPLE[col.key]?.(i) ?? "" : STUDENT_SAMPLE[col.key]?.(i, halaqah) ?? "";
    }
    rows.push(row);
  }
  const header: Record<string, string> = {};
  for (const col of columns) header[col.key] = col.label;
  const ws = XLSX.utils.json_to_sheet([header, ...rows], {
    header: columns.map((c) => c.key),
    skipHeader: true,
  });
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(14, c.label.length + 2) }));
  return ws;
}

function downloadExample(kind: Kind, lembaga: string, halaqah: string) {
  const ws = buildWorkbookSheet(kind, halaqah);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, kind === "guru" ? "Data Guru" : "Data Santri");
  const label = kind === "guru" ? "Data Guru" : "Data Santri";
  XLSX.writeFile(wb, `${label} ${lembaga} (Contoh).xlsx`);
  toast.success("Contoh file Excel berhasil diunduh.");
}

/** Export data nyata ke .xlsx dengan nama file sesuai lembaga + tahun ajaran. */
export function ExportButton({
  kind,
  lembaga,
  tahunAjaran,
  rows,
}: {
  kind: Kind;
  lembaga: string;
  tahunAjaran: string | null;
  rows: Record<string, string | number>[];
}) {
  const columns = importColumnsFor(kind);

  const doExport = () => {
    const header: Record<string, string> = {};
    for (const col of columns) header[col.key] = col.label;
    const data = [header, ...rows];
    const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.key), skipHeader: true });
    ws["!cols"] = columns.map((c) => ({ wch: Math.max(14, c.label.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind === "guru" ? "Data Guru" : "Data Santri");
    const ta = tahunAjaran ? ` Tahun Ajaran ${tahunAjaran}` : "";
    const label = kind === "guru" ? "Data Guru" : "Data Santri";
    XLSX.writeFile(wb, `${label} ${lembaga}${ta}.xlsx`);
    toast.success("File Excel berhasil diunduh.");
  };

  return (
    <Button variant="outline" onClick={doExport} disabled={rows.length === 0}>
      <Download className="size-4" /> Export
    </Button>
  );
}

/**
 * Baca file → matriks sel mentah (angka tetap angka agar angka 0 di depan bisa
 * dipulihkan) → parse header + baris di modul bersama.
 * CSV dibaca sebagai teks UTF-8 dengan raw:true (menjaga nol di depan NIS/NISN/
 * WhatsApp; pemisah koma maupun titik-koma dikenali otomatis oleh SheetJS).
 */
async function parseImportFile(file: File, kind: Kind): Promise<ParsedSheet> {
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: "string", raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
    });
    const firstRow = XLSX.utils.decode_range(ws["!ref"]).s.r + 1;
    if (matrix.every((r) => r.every((c) => String(c ?? "").trim() === ""))) continue;
    return parseSheetMatrix(kind, matrix, firstRow);
  }
  throw new Error("File tidak berisi data.");
}

type Preview = { sheet: ParsedSheet; valid: number; issues: ImportIssue[] };
type Report = {
  total: number;
  inserted: number;
  skipped: number;
  issues: ImportIssue[];
  fatal: string | null;
};

export function ImportDialog({
  kind,
  lembaga,
  halaqahHint,
}: {
  kind: Kind;
  lembaga: string;
  halaqahHint: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<Report | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const columns = importColumnsFor(kind);
  const label = kind === "guru" ? "Guru" : "Siswa";
  const noun = kind === "guru" ? "guru" : "santri";

  const reset = () => {
    setFile(null);
    setPreview(null);
    setParseError(null);
    setReport(null);
    setProgress({ done: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = "";
  };

  const acceptFile = async (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(f.name)) {
      toast.error("Format file harus .XLSX atau .CSV");
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Ukuran file maksimal ${MAX_FILE_MB}MB.`);
      return;
    }
    setFile(f);
    setPreview(null);
    setParseError(null);
    setReport(null);
    setReading(true);
    try {
      const sheet = await parseImportFile(f, kind);
      if (sheet.rows.length === 0) {
        setParseError("File tidak berisi baris data di bawah header.");
      } else if (sheet.rows.length > MAX_FILE_ROWS) {
        setParseError(`Maksimal ${MAX_FILE_ROWS} baris data per file (file ini ${sheet.rows.length} baris). Pecah menjadi beberapa file.`);
      } else {
        const { valid, issues } = previewValidate(kind, sheet.rows);
        setPreview({ sheet, valid, issues });
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Gagal membaca file. Pastikan format .XLSX / .CSV valid.");
    } finally {
      setReading(false);
    }
  };

  const startImport = async () => {
    if (!preview || importing) return;
    const { sheet, issues: clientIssues } = preview;
    const invalid = new Set(clientIssues.map((i) => i.row));
    const sendRows: ImportRow[] = sheet.rows.filter((r, i) => !invalid.has(rowNumberOf(r, i)));
    if (sendRows.length === 0) {
      toast.error("Tidak ada baris valid untuk diimport.");
      return;
    }

    setImporting(true);
    setReport(null);
    setProgress({ done: 0, total: sendRows.length });

    const action = kind === "guru" ? importTeachersAction : importStudentsAction;
    const size = CHUNK_SIZE[kind];
    let inserted = 0;
    let skipped = clientIssues.length;
    const issues: ImportIssue[] = [...clientIssues];
    let fatal: string | null = null;

    for (let i = 0; i < sendRows.length; i += size) {
      const slice = sendRows.slice(i, i + size);
      const fd = new FormData();
      fd.set("payload", JSON.stringify(slice));
      let res: ImportSummary;
      try {
        res = await action(null, fd);
      } catch {
        fatal =
          "Koneksi ke server terputus atau waktu habis. Data yang sudah terkirim sebelumnya tersimpan — " +
          "periksa daftar, lalu import ulang sisanya.";
        break;
      }
      if (res.data) {
        inserted += res.data.inserted;
        skipped += res.data.skipped;
        issues.push(...res.data.errors);
        if (res.data.fatal) {
          fatal = res.error ?? "Import dihentikan karena kesalahan database.";
          break;
        }
      } else if (res.error) {
        fatal = res.error;
        break;
      }
      setProgress({ done: Math.min(i + slice.length, sendRows.length), total: sendRows.length });
    }

    setImporting(false);
    setReport({ total: sheet.rows.length, inserted, skipped, issues, fatal });
    if (inserted > 0) {
      toast.success(`${inserted} ${noun} berhasil diimport.`);
      router.refresh();
    } else {
      toast.error(fatal ?? "Tidak ada data yang berhasil diimport.");
    }
  };

  const errorIssues = report?.issues.filter((i) => i.level === "error").sort((a, b) => a.row - b.row) ?? [];
  const warningIssues = report?.issues.filter((i) => i.level === "warning").sort((a, b) => a.row - b.row) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && importing) return; // jangan tutup saat import berjalan
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Import
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Data {label}</DialogTitle>
        </DialogHeader>

        {/* Kotak format penulisan */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
          <p className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
            <Info className="size-4 shrink-0" /> Format Penulisan Excel
          </p>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Pastikan baris pertama (header) pada file Anda memuat kolom secara urut:
          </p>
          <p className="mt-1.5 text-xs leading-relaxed font-semibold text-blue-800 dark:text-blue-200">
            {columns.map((c) => `${c.key}. ${c.label}`).join(" | ")}
          </p>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Judul kolom dikenali otomatis (huruf besar/kecil tidak berpengaruh). Kolom bertanda wajib:{" "}
            {columns.filter((c) => c.required).map((c) => c.label).join(", ")}. Format kolom NIS, NISN, dan
            nomor WhatsApp sebagai <b>Teks</b> agar angka 0 di depan tidak hilang.
          </p>
          {kind === "santri" && (
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              *Kode Halaqah/Kelas pada kolom G sebaiknya sama persis dengan kode halaqah yang sudah
              terdaftar ({halaqahHint.slice(0, 3).join(", ") || "belum ada"}). Jika kosong atau belum
              terdaftar, santri tetap diimport dengan status &ldquo;Tidak ada halaqah&rdquo; dan bisa diatur
              manual belakangan.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full border-blue-300 text-blue-700 hover:bg-blue-100 dark:text-blue-200"
            onClick={() => downloadExample(kind, lembaga, halaqahHint[0] ?? "")}
          >
            <Download className="size-4" /> Unduh Contoh File Excel (10 Data {label})
          </Button>
        </div>

        {/* LAPORAN HASIL */}
        {report ? (
          <div className="space-y-3" aria-live="polite">
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4",
                report.inserted > 0
                  ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                  : "border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/10"
              )}
            >
              {report.inserted > 0 ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
              ) : (
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-300" />
              )}
              <div className="text-sm">
                <p className="font-semibold">
                  {report.inserted} dari {report.total} baris berhasil diimport
                </p>
                {report.skipped > 0 && (
                  <p className="text-muted-foreground mt-0.5 text-xs">{report.skipped} baris tidak diimport.</p>
                )}
                {report.inserted > 0 && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Akun login dibuat otomatis: username = nama panggilan, password = panggilan+1234 (wajib
                    diganti saat login pertama).
                  </p>
                )}
              </div>
            </div>

            {report.fatal && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                {report.fatal}
              </p>
            )}

            {errorIssues.length > 0 && (
              <IssueList title={`Baris tidak diimport (${errorIssues.length})`} tone="error" issues={errorIssues} />
            )}
            {warningIssues.length > 0 && (
              <IssueList
                title={`Catatan — data tetap tersimpan (${warningIssues.length})`}
                tone="warning"
                issues={warningIssues}
              />
            )}
          </div>
        ) : (
          <>
            {/* Dropzone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Pilih atau seret file Excel"
              onClick={() => !importing && inputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !importing) inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!importing) void acceptFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
                dragOver
                  ? "border-blue-400 bg-blue-50/60 dark:bg-blue-500/10"
                  : "border-slate-300 hover:border-blue-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-500/5",
                importing && "pointer-events-none opacity-60"
              )}
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-role text-role-ink shadow-sm">
                {reading ? <Spinner className="size-6" /> : <FileSpreadsheet className="size-6" />}
              </span>
              {file ? (
                <p className="text-sm font-semibold break-all text-blue-700 dark:text-blue-300">{file.name}</p>
              ) : (
                <p className="text-sm font-semibold">Klik atau seret file .XLSX / .CSV ke sini</p>
              )}
              <p className="text-muted-foreground text-xs">Maksimal ukuran file: {MAX_FILE_MB}MB</p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv"
                className="hidden"
                onChange={(e) => void acceptFile(e.target.files?.[0])}
              />
            </div>

            {parseError && (
              <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {parseError}
              </p>
            )}

            {/* PRATINJAU */}
            {preview && !importing && (
              <div className="space-y-2 rounded-xl border p-3 text-xs">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  {preview.sheet.rows.length} baris data terbaca — {preview.valid} siap diimport
                  {preview.issues.length > 0 ? `, ${preview.issues.length} bermasalah` : ""}
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Kolom terdeteksi:{" "}
                  {preview.sheet.mapped.map((m) => `${m.key}. ${m.label}`).join(", ")}
                </p>
                {preview.sheet.positional && (
                  <p className="leading-relaxed text-amber-700 dark:text-amber-300">
                    Judul kolom tidak dikenali — urutan kolom (A, B, C, …) dipakai. Periksa apakah sesuai.
                  </p>
                )}
                {preview.sheet.ignored.length > 0 && (
                  <p className="text-muted-foreground leading-relaxed">
                    Kolom diabaikan: {preview.sheet.ignored.join(", ")}
                  </p>
                )}
                {preview.issues.length > 0 && (
                  <IssueList
                    title="Baris ini akan dilewati"
                    tone="warning"
                    issues={preview.issues.slice(0, 50)}
                    more={Math.max(0, preview.issues.length - 50)}
                  />
                )}
              </div>
            )}

            {/* PROGRES */}
            {importing && (
              <div className="space-y-2 rounded-xl border p-3" aria-live="polite">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Spinner /> Mengimpor {progress.done} / {progress.total} baris…
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="bg-gradient-brand h-full transition-all"
                    style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Akun login dibuat satu per satu — jangan tutup halaman ini sampai selesai.
                </p>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          {report ? (
            <>
              <Button variant="outline" onClick={reset}>
                Import File Lain
              </Button>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="bg-gradient-brand hover:opacity-90"
              >
                Selesai
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={importing}
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Batal
              </Button>
              <Button
                onClick={() => void startImport()}
                disabled={importing || reading || !preview || preview.valid === 0}
                className="bg-gradient-brand hover:opacity-90"
              >
                {importing ? (
                  <>
                    <Spinner /> Mengimpor…
                  </>
                ) : preview && preview.valid > 0 ? (
                  `Mulai Import (${preview.valid} baris)`
                ) : (
                  "Mulai Import"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueList({
  title,
  tone,
  issues,
  more = 0,
}: {
  title: string;
  tone: "error" | "warning";
  issues: ImportIssue[];
  more?: number;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "error"
          ? "border-red-200 bg-red-50/60 dark:border-red-500/20 dark:bg-red-500/10"
          : "border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/10"
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold",
          tone === "error" ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"
        )}
      >
        {title}
      </p>
      <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto pr-1 text-xs leading-relaxed">
        {issues.map((it, idx) => (
          <li key={`${it.row}-${idx}`} className="text-slate-700 dark:text-slate-300">
            <span className="font-mono font-semibold">{it.row > 0 ? `Baris ${it.row}` : "Umum"}</span> — {it.reason}
          </li>
        ))}
        {more > 0 && <li className="text-muted-foreground">…dan {more} lainnya</li>}
      </ul>
    </div>
  );
}
