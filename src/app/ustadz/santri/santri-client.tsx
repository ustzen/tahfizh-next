"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, GraduationCap, RotateCcw } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WaChatButton } from "@/components/santri/wa-chat-button";
import { OnlineCell } from "@/components/santri/online-cell";
import { genderLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { TeacherStudentRow } from "@/lib/teacher-students";
import type { TeacherStudentRank } from "@/lib/santri-pantauan-shared";
import { gradeFor, rankModuleLabel, type GradeBand } from "@/lib/rank-settings-shared";

const ALL_HALAQAH = "ALL";

/** V81 — kolom yang bisa diurutkan di tabel Data Santri. */
type SortKey =
  | "nis"
  | "nisn"
  | "nama"
  | "peringkat"
  | "skor"
  | "panggilan"
  | "gender"
  | "halaqah"
  | "wali"
  | "online";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

/** Klik pertama: Skor & Online mulai dari yang tertinggi/terbaru, sisanya A→Z / terkecil. */
function firstDir(key: SortKey): SortDir {
  return key === "skor" || key === "online" ? "desc" : "asc";
}

function SortHead({
  label,
  k,
  sort,
  onSort,
  className,
  center,
}: {
  label: string;
  k: SortKey;
  sort: SortState | null;
  onSort: (k: SortKey) => void;
  className?: string;
  center?: boolean;
}) {
  const active = sort?.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={!active ? "none" : sort.dir === "asc" ? "ascending" : "descending"}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        title={`Urutkan berdasarkan ${label}`}
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1 whitespace-nowrap transition-colors",
          center && "w-full justify-center",
          active && "text-foreground"
        )}
      >
        {label}
        <Icon className={cn("size-3.5 shrink-0", !active && "opacity-40")} />
      </button>
    </TableHead>
  );
}

/** V85 — skor dengan 1 angka di belakang koma (format Indonesia, mis. 85,4). */
function fmtScore(n: number): string {
  return n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** V45 — badge peringkat: warna medali untuk 3 besar, netral setelahnya. */
function RankBadge({ rank, totalRanked, avgScore, moduls }: TeacherStudentRank) {
  if (rank === null) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const tone =
    rank === 1
      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
      : rank === 2
        ? "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200"
        : rank === 3
          ? "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  return (
    <span
      className={cn("tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", tone)}
      title={`Rata-rata nilai ${avgScore !== null ? fmtScore(avgScore) : "–"} · dari ${totalRanked} santri bernilai${
        moduls && Object.keys(moduls).length > 0
          ? ` · ${Object.entries(moduls)
              .map(([k, v]) => `${rankModuleLabel(k)} ${v}`)
              .join(", ")}`
          : ""
      }`}
    >
      #{rank}
      <span className="text-[0.65rem] font-medium opacity-70">/{totalRanked}</span>
    </span>
  );
}

/**
 * TAHFIZH V21.2 — Filter Halaqah pada Data Santri (guru).
 *
 * Berguna terutama untuk guru yang mengampu lebih dari satu halaqah: tanpa
 * filter, tabel mencampur santri dari semua halaqah dan sulit dipilah.
 * Pilihan halaqah dibangun dari data santri itu sendiri (bukan RPC kedua)
 * supaya daftar filter selalu sinkron dengan apa yang benar-benar tampil.
 */
export function SantriClient({
  students,
  ranks,
  scale,
  santriLabel,
  halaqahLabel,
}: {
  students: TeacherStudentRow[];
  ranks: Map<string, TeacherStudentRank>;
  /** V78 — skala nilai huruf milik guru. */
  scale: GradeBand[];
  santriLabel: string;
  halaqahLabel: string;
}) {
  const halaqahOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of students) {
      if (s.halaqah_id && !seen.has(s.halaqah_id)) {
        seen.set(s.halaqah_id, s.halaqah_name ?? "(Tanpa nama)");
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const [selected, setSelected] = useState<string>(ALL_HALAQAH);

  const filtered = useMemo(() => {
    if (selected === ALL_HALAQAH) return students;
    return students.filter((s) => s.halaqah_id === selected);
  }, [students, selected]);

  // Filter hanya relevan bila guru punya >1 halaqah — sembunyikan bila cuma 1.
  const showFilter = halaqahOptions.length > 1;

  // V81 — pengurutan kolom. null = urutan awal dari server (kode santri).
  const [sort, setSort] = useState<SortState | null>(null);

  function onSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: firstDir(key) };
      if (prev.dir === firstDir(key)) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return null; // klik ketiga → kembali ke urutan awal
    });
  }

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const mul = sort.dir === "asc" ? 1 : -1;

    const valueOf = (s: TeacherStudentRow): string | number | null => {
      const r = ranks.get(s.id ?? "");
      switch (sort.key) {
        case "nis":
          return s.nis?.trim() || null;
        case "nisn":
          return s.nisn?.trim() || null;
        case "nama":
          return s.full_name;
        case "peringkat":
          return r?.rank ?? null;
        case "skor":
          return r?.avgScore ?? null;
        case "panggilan":
          return s.nickname?.trim() || null;
        case "gender":
          return s.gender ? genderLabel(s.gender) : null;
        case "halaqah":
          return s.halaqah_name?.trim() || null;
        case "wali":
          return s.guardian_name?.trim() || null;
        case "online": {
          const t = s.wali_last_online ? Date.parse(s.wali_last_online) : NaN;
          return Number.isNaN(t) ? null : t;
        }
      }
    };

    return [...filtered].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      // Data kosong selalu di paling bawah, apa pun arah urutannya.
      if (va === null && vb === null) return a.full_name.localeCompare(b.full_name, "id");
      if (va === null) return 1;
      if (vb === null) return -1;
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "id", { numeric: true, sensitivity: "base" });
      return c * mul || a.full_name.localeCompare(b.full_name, "id");
    });
  }, [filtered, sort, ranks]);

  return (
    <div className="space-y-4">
      {showFilter && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter {halaqahLabel.toLowerCase()}:</span>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_HALAQAH}>Semua {halaqahLabel.toLowerCase()}</SelectItem>
              {halaqahOptions.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground/80">
            {filtered.length} dari {students.length} {santriLabel.toLowerCase()}
          </span>
        </div>
      )}

      {filtered.length > 1 && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>Klik judul kolom untuk mengurutkan (NIS, NISN, Peringkat, Terakhir Online, dll).</span>
          {sort && (
            <button
              type="button"
              onClick={() => setSort(null)}
              className="hover:text-foreground inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              <RotateCcw className="size-3" /> Urutan awal
            </button>
          )}
        </div>
      )}

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-0 py-0">
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 px-3">No.</TableHead>
                    <SortHead label="NIS" k="nis" sort={sort} onSort={onSort} className="px-5" />
                    <SortHead label="NISN" k="nisn" sort={sort} onSort={onSort} />
                    <SortHead label="Nama Lengkap" k="nama" sort={sort} onSort={onSort} />
                    <SortHead label="Nama Panggilan" k="panggilan" sort={sort} onSort={onSort} />
                    <SortHead label="Gender" k="gender" sort={sort} onSort={onSort} />
                    <SortHead label={halaqahLabel} k="halaqah" sort={sort} onSort={onSort} />
                    <SortHead label="Peringkat" k="peringkat" sort={sort} onSort={onSort} className="text-center" center />
                    <SortHead label="Skor" k="skor" sort={sort} onSort={onSort} className="text-center" center />
                    <SortHead label="Wali" k="wali" sort={sort} onSort={onSort} />
                    <SortHead label="Terakhir Online" k="online" sort={sort} onSort={onSort} />
                    <TableHead className="px-5 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((s, i) => (
                    <TableRow key={s.id}>
                      <TableCell className="px-3 text-muted-foreground text-xs">{i + 1}</TableCell>
                      <TableCell className="px-5 font-mono text-xs text-muted-foreground">{s.nis ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.nisn ?? "—"}</TableCell>
                      <TableCell className="font-medium">{s.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.nickname ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{genderLabel(s.gender)}</TableCell>
                      <TableCell>
                        {s.halaqah_name ? (
                          <Badge variant="secondary" className="font-medium">{s.halaqah_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const r = ranks.get(s.id ?? "");
                          return r ? (
                            <RankBadge {...r} />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="tabular text-center text-sm font-semibold">
                        {(() => {
                          const avg = ranks.get(s.id ?? "")?.avgScore ?? null;
                          if (avg === null) {
                            return <span className="text-muted-foreground font-normal">—</span>;
                          }
                          const huruf = gradeFor(avg, scale);
                          return (
                            <span className="inline-flex items-center justify-center gap-1.5">
                              {fmtScore(avg)}
                              {huruf && (
                                <span className="bg-gradient-brand rounded-md px-1.5 py-0.5 text-[0.7rem] font-bold text-white">
                                  {huruf}
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="leading-tight">
                          <div>{s.guardian_name ?? "—"}</div>
                          {s.guardian_whatsapp && (
                            <div className="mt-0.5 font-mono text-xs text-muted-foreground/70">
                              {s.guardian_whatsapp}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <OnlineCell iso={s.wali_last_online} />
                      </TableCell>
                      <TableCell className="px-5">
                        <div className="flex items-center justify-end">
                          <WaChatButton
                            number={s.guardian_whatsapp}
                            studentName={s.full_name}
                            senderLabel="ustadz/ustadzah halaqah"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GraduationCap /></EmptyMedia>
                <EmptyTitle>
                  {students.length === 0
                    ? `Belum ada ${santriLabel.toLowerCase()} di halaqah Anda.`
                    : `Tidak ada ${santriLabel.toLowerCase()} di halaqah ini.`}
                </EmptyTitle>
                <EmptyDescription>
                  {students.length === 0
                    ? `Anda akan melihat ${santriLabel.toLowerCase()} di sini setelah admin menetapkan Anda sebagai pengampu halaqah.`
                    : `Coba pilih ${halaqahLabel.toLowerCase()} lain, atau lihat "Semua ${halaqahLabel.toLowerCase()}".`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
