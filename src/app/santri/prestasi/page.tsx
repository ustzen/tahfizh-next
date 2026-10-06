import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  BookOpenCheck,
  BookOpenText,
  CalendarCheck,
  ChevronLeft,
  HandHeart,
  ListChecks,
  Medal,
  SpellCheck,
  Star,
  TrendingUp,
  Trophy,
  UserRound,
} from "lucide-react";

import { cleanNis } from "@/lib/nis";
import { signAvatarPath } from "@/lib/avatar";
import { MosqueGlyph } from "@/components/dashboard/mosque-glyph";
import { requireRole } from "@/lib/auth";
import { getPrestasiCards, getHalaqahRank, getMeterTotals, getSantriTargetProgress } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import {
  EMPTY_MODULE_STAT,
  badgesFor,
  moduleLabel,
  persen,
  targetScopeLabel,
  tanggalId,
  type MeterTotals,
  type ModuleKey,
  type PersenMeter,
  type PrestasiCard,
  type TargetProgress,
} from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Kartu Prestasi" };

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TAHFIDZ: BookOpenCheck,
  HADITS: BookOpenText,
  DOA: HandHeart,
  TAJWID: SpellCheck,
  TUGAS: ListChecks,
  KEHADIRAN: CalendarCheck,
};

/** Label ubin sesuai mockup ("Doa Harian", bukan "Doa"). */
const TILE_LABEL: Record<string, string> = {
  TAHFIDZ: "Tahfidz",
  HADITS: "Hadits",
  DOA: "Doa Harian",
  TAJWID: "Tajwid",
  TUGAS: "Tugas",
  KEHADIRAN: "Kehadiran",
};

/**
 * Palet ubin per modul — mockup: Tahfidz hijau, Hadits biru, Doa Harian
 * ungu, Tugas oranye (Tajwid rose, Kehadiran biru langit).
 */
const TILE_STYLE: Record<
  string,
  {
    tile: string;
    iconBg: string;
    name: string;
    count: string;
    frac: string;
    pill: string;
    ribbon: string;
    bar: string;
    track: string;
  }
> = {
  TAHFIDZ: {
    tile: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10",
    iconBg: "bg-emerald-500",
    name: "text-emerald-700 dark:text-emerald-300",
    count: "text-emerald-600 dark:text-emerald-300",
    frac: "text-emerald-600 dark:text-emerald-300",
    pill: "bg-emerald-500",
    ribbon: "bg-emerald-600",
    bar: "bg-emerald-500",
    track: "bg-emerald-200/70 dark:bg-emerald-500/20",
  },
  HADITS: {
    tile: "border-blue-200 bg-blue-50 dark:border-blue-500/25 dark:bg-blue-500/10",
    iconBg: "bg-blue-500",
    name: "text-blue-700 dark:text-blue-300",
    count: "text-blue-600 dark:text-blue-300",
    frac: "text-blue-600 dark:text-blue-300",
    pill: "bg-blue-500",
    ribbon: "bg-blue-600",
    bar: "bg-blue-500",
    track: "bg-blue-200/70 dark:bg-blue-500/20",
  },
  DOA: {
    tile: "border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10",
    iconBg: "bg-violet-500",
    name: "text-violet-700 dark:text-violet-300",
    count: "text-violet-600 dark:text-violet-300",
    frac: "text-violet-600 dark:text-violet-300",
    pill: "bg-violet-500",
    ribbon: "bg-violet-600",
    bar: "bg-violet-500",
    track: "bg-violet-200/70 dark:bg-violet-500/20",
  },
  TUGAS: {
    tile: "border-orange-200 bg-orange-50 dark:border-orange-500/25 dark:bg-orange-500/10",
    iconBg: "bg-orange-500",
    name: "text-orange-700 dark:text-orange-300",
    count: "text-orange-600 dark:text-orange-300",
    frac: "text-orange-600 dark:text-orange-300",
    pill: "bg-orange-500",
    ribbon: "bg-orange-600",
    bar: "bg-orange-500",
    track: "bg-orange-200/70 dark:bg-orange-500/20",
  },
  TAJWID: {
    tile: "border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10",
    iconBg: "bg-rose-500",
    name: "text-rose-700 dark:text-rose-300",
    count: "text-rose-600 dark:text-rose-300",
    frac: "text-rose-600 dark:text-rose-300",
    pill: "bg-rose-500",
    ribbon: "bg-rose-600",
    bar: "bg-rose-500",
    track: "bg-rose-200/70 dark:bg-rose-500/20",
  },
  KEHADIRAN: {
    tile: "border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10",
    iconBg: "bg-sky-500",
    name: "text-sky-700 dark:text-sky-300",
    count: "text-sky-600 dark:text-sky-300",
    frac: "text-sky-600 dark:text-sky-300",
    pill: "bg-sky-500",
    ribbon: "bg-sky-600",
    bar: "bg-sky-500",
    track: "bg-sky-200/70 dark:bg-sky-500/20",
  },
};

/** Pita predikat (desktop) dari persentase capaian. */
function ribbonLabel(pct: number | null): string {
  if (pct === null) return "Belum Dinilai";
  if (pct >= 90) return "Sangat Baik";
  if (pct >= 75) return "Baik";
  if (pct >= 60) return "Cukup";
  return "Semangat!";
}

/** Rosase medali kecil di pojok ubin capaian (mockup). */
function Rosette() {
  return (
    <span className="absolute top-1.5 right-1.5" aria-hidden>
      <span className="relative block size-7">
        <span className="absolute top-2.5 left-1/2 h-3 w-1.5 -translate-x-[135%] rotate-[18deg] rounded-b-sm bg-sky-600" />
        <span className="absolute top-2.5 left-1/2 h-3 w-1.5 -translate-x-[-35%] rotate-[-18deg] rounded-b-sm bg-sky-500" />
        <span className="shadow-card absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 ring-2 ring-white/80">
          <Star className="size-3.5 fill-white text-white" />
        </span>
      </span>
    </span>
  );
}

/**
 * Ubin capaian: MOBILE = kartu menyamping (ikon bundar kiri, nama, pecahan
 * besar, progress bar, pil persen) seperti mockup; DESKTOP = kartu tegak
 * (ikon atas, angka besar, pecahan kecil, pil persen, pita predikat).
 */
function AchievementTile({
  tileKey,
  count,
  frac,
  pct,
  title,
}: {
  tileKey: string;
  count: number;
  frac: string | null;
  pct: number | null;
  title: string;
}) {
  const s = TILE_STYLE[tileKey] ?? TILE_STYLE.KEHADIRAN;
  const Icon = MODULE_ICONS[tileKey] ?? BookOpenCheck;
  const kosong = count === 0;
  return (
    <div
      className={cn(
        "shadow-card relative flex flex-row items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3 lg:flex-col lg:items-center lg:gap-1 lg:px-2 lg:pt-3.5 lg:pb-3 lg:text-center",
        s.tile
      )}
      title={title}
    >
      <Rosette />
      <span aria-hidden className="bg-dots pointer-events-none absolute -top-1 right-0 h-12 w-16 text-white/60 dark:text-white/10" />
      <span
        className={cn(
          "shadow-card flex size-12 shrink-0 items-center justify-center rounded-full text-white lg:size-11",
          kosong ? "bg-slate-400 dark:bg-slate-500" : s.iconBg
        )}
      >
        <Icon className="size-6 lg:size-5.5" />
      </span>

      <div className="min-w-0 flex-1 lg:contents">
        <p className={cn("text-base font-bold lg:text-sm", s.name)}>{TILE_LABEL[tileKey] ?? tileKey}</p>
        {/* Angka besar — hanya desktop (mobile memakai pecahan besar) */}
        <p className={cn("tabular hidden text-2xl leading-none font-extrabold lg:block", kosong && "opacity-60", s.count)}>
          {count}
        </p>
        <p className={cn("tabular text-xl leading-none font-extrabold lg:text-xs lg:font-semibold", kosong && "opacity-60", s.frac)}>
          {frac ?? "—"}
        </p>
        {/* Progress bar — hanya mobile */}
        <div className={cn("mt-1 h-2 overflow-hidden rounded-full lg:hidden", s.track)}>
          <div
            className={cn("h-full rounded-full transition-all", kosong ? "bg-slate-400" : s.bar)}
            style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
          />
        </div>
        <span
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 self-start rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold text-white lg:self-auto lg:px-2.5",
            kosong ? "bg-slate-400 dark:bg-slate-500" : s.pill
          )}
        >
          <Star className="size-3 fill-current" aria-hidden />
          {pct === null ? "0%" : `${pct}%`}
        </span>
        {/* Pita predikat — hanya desktop */}
        <span
          className={cn(
            "mt-1 hidden px-3.5 py-0.5 text-[0.68rem] font-bold text-white [clip-path:polygon(0_0,100%_0,calc(100%-8px)_50%,100%_100%,0_100%,8px_50%)] lg:inline-block",
            kosong ? "bg-slate-400 dark:bg-slate-500" : s.ribbon
          )}
        >
          {ribbonLabel(pct)}
        </span>
      </div>
    </div>
  );
}

/**
 * Medali peringkat ala mockup: medali bundar + pita biru di belakang.
 */
function RankMedal({ rank }: { rank: number | null }) {
  const face =
    rank === null
      ? "from-slate-200 to-slate-300 ring-slate-300 dark:from-slate-600 dark:to-slate-700 dark:ring-slate-500/40"
      : rank === 1
        ? "from-amber-300 to-amber-500 ring-amber-400"
        : rank === 2
          ? "from-slate-200 to-slate-400 ring-slate-300"
          : rank === 3
            ? "from-orange-300 to-orange-500 ring-orange-400"
            : "from-sky-300 to-sky-500 ring-sky-400";
  return (
    <div className="relative mx-auto size-20 shrink-0 lg:size-28">
      {/* Pita medali */}
      <span aria-hidden className="absolute top-[58%] left-1/2 h-9 w-5 -translate-x-[135%] rotate-[20deg] rounded-b-md bg-sky-600 lg:h-11 lg:w-6" />
      <span aria-hidden className="absolute top-[58%] left-1/2 h-9 w-5 -translate-x-[-35%] rotate-[-20deg] rounded-b-md bg-sky-500 lg:h-11 lg:w-6" />
      <div
        className={cn(
          "shadow-card-lg relative z-10 flex size-full items-center justify-center rounded-full bg-gradient-to-br ring-4",
          face
        )}
      >
        <span className="tabular text-3xl font-black text-white drop-shadow-sm lg:text-5xl">
          {rank === null ? "–" : rank}
        </span>
      </div>
    </div>
  );
}

/**
 * V40 — bangun meter persentase untuk satu anak (dipakai ubin capaian).
 */
function buildMeters(
  c: PrestasiCard,
  targets: TargetProgress[],
  totals: MeterTotals | undefined,
): PersenMeter[] {
  const milik = targets.filter((t) => t.studentId === c.studentId && t.targetValue > 0);
  const meters: PersenMeter[] = [];

  const tTahfidz = milik.find((t) => t.category === "TAHFIDZ");
  const targetTahfidz = tTahfidz ? tTahfidz.targetValue : c.surahTotal || 0;
  if (targetTahfidz > 0) {
    meters.push({
      key: "TAHFIDZ",
      label: "Target Hafalan",
      done: Math.min(tTahfidz ? tTahfidz.capaian : c.surahSelesai, targetTahfidz),
      total: targetTahfidz,
      unit: "surat",
      hint: tTahfidz ? `Target ustadz · ${targetScopeLabel(tTahfidz.scope)}` : "Semua surat aktif di tenant",
    });
  }

  const tugasStat = c.moduleStats?.TUGAS;
  const tugasDiberikan = (totals?.tugasTotal || 0) || tugasStat?.count || 0;
  if (tugasDiberikan > 0) {
    meters.push({
      key: "TUGAS",
      label: "Pengerjaan Tugas",
      done: Math.min(tugasStat?.count ?? 0, tugasDiberikan),
      total: tugasDiberikan,
      unit: "tugas",
      hint: "Tugas halaqah yang sudah dikerjakan",
    });
  }

  const modulMateri: Array<{ key: string; label: string; total: number }> = [
    { key: "HADITS", label: "Target Hadits", total: totals?.haditsTotal ?? 0 },
    { key: "DOA", label: "Target Doa", total: totals?.doaTotal ?? 0 },
    { key: "TAJWID", label: "Target Tajwid", total: totals?.tajwidTotal ?? 0 },
  ];
  for (const modul of modulMateri) {
    const t = milik.find((x) => x.category === modul.key);
    const targetGuru = t?.targetValue ?? 0;
    const total = targetGuru > 0 ? targetGuru : modul.total;
    if (total <= 0) continue;
    const stat = c.moduleStats?.[modul.key];
    const done = Math.min(t ? t.capaian : stat?.count ?? 0, total);
    meters.push({
      key: modul.key,
      label: modul.label,
      done,
      total,
      unit: modul.key === "TAJWID" ? "materi" : modul.key === "HADITS" ? "hadits" : "doa",
      hint: t ? `Target ustadz · ${targetScopeLabel(t.scope)}` : "Materi aktif di lembaga",
    });
  }

  return meters;
}

/** Satu frame Kartu Prestasi (mockup): mobile menyamping, desktop tegak. */
function PrestasiFrame({
  c,
  meters,
  rankInfo,
  avatarUrl,
  isPlaceholder,
}: {
  c: PrestasiCard;
  meters: PersenMeter[];
  rankInfo: { rank: number | null; totalRanked: number; avgScore: number | null; halaqahName: string | null } | undefined;
  avatarUrl: string | null;
  isPlaceholder: boolean;
}) {
  const initial = c.studentName.trim().charAt(0).toUpperCase() || "?";
  const nisTampil = cleanNis(c.nis, c.businessCode);
  const lencana = badgesFor(c).slice(0, 3);
  const meterMap = new Map(meters.map((m) => [m.key, m]));

  const tileOf = (key: string, stat: { count: number }) => {
    const m = meterMap.get(key);
    return {
      key,
      count: stat.count,
      frac: m ? `${m.done}/${m.total}` : null,
      pct: m ? persen(m.done, m.total) : null,
      title: stat.count === 0
        ? `${moduleLabel(key as ModuleKey)} · belum ada penilaian`
        : `${moduleLabel(key as ModuleKey)} · ${m ? `${m.done}/${m.total} ${m.unit ?? ""}` : ""} · ${m?.hint ?? ""}`,
    };
  };

  // 4 ubin mockup selalu tampil; Tajwid & Kehadiran muncul saat ada datanya.
  const tiles = [
    tileOf("TAHFIDZ", c.moduleStats?.TAHFIDZ ?? EMPTY_MODULE_STAT),
    tileOf("HADITS", c.moduleStats?.HADITS ?? EMPTY_MODULE_STAT),
    tileOf("DOA", c.moduleStats?.DOA ?? EMPTY_MODULE_STAT),
    tileOf("TUGAS", c.moduleStats?.TUGAS ?? EMPTY_MODULE_STAT),
    ...(c.moduleStats?.TAJWID && c.moduleStats.TAJWID.count > 0 ? [tileOf("TAJWID", c.moduleStats.TAJWID)] : []),
    ...(c.presensi.total > 0
      ? [
          {
            key: "KEHADIRAN",
            count: c.presensi.hadir,
            frac: `${c.presensi.hadir}/${c.presensi.total}`,
            pct: persen(c.presensi.hadir, c.presensi.total),
            title: `Kehadiran · ${c.presensi.izin} izin · ${c.presensi.sakit} sakit · ${c.presensi.alpa} alpa`,
          },
        ]
      : []),
  ];

  const rank = rankInfo?.rank ?? null;
  const totalRanked = rankInfo?.totalRanked ?? 0;

  return (
    <div className="shadow-card-lg bg-card relative flex flex-col overflow-hidden rounded-3xl border">
      {/* ================= HERO: langit + masjid ================= */}
      <div className="relative overflow-hidden bg-gradient-to-b from-sky-300 via-sky-200 to-sky-100 px-5 pt-5 pb-8 sm:px-7 dark:from-sky-950 dark:via-sky-900/70 dark:to-sky-900/40">
        {/* Awan */}
        <span aria-hidden className="absolute top-3 left-10 h-8 w-28 rounded-full bg-white/60 blur-md" />
        <span aria-hidden className="absolute top-9 left-1/3 h-6 w-20 rounded-full bg-white/50 blur-md" />
        <span aria-hidden className="absolute -top-2 right-1/4 h-9 w-32 rounded-full bg-white/55 blur-md" />
        {/* Masjid kanan */}
        <span aria-hidden className="absolute right-3 bottom-0 text-sky-600/80 sm:right-8 dark:text-sky-300/40">
          <MosqueGlyph className="size-24 lg:size-32" />
        </span>

        <div className="relative flex items-start gap-3">
          {/* Tombol kembali — mode mobile (mockup) */}
          <Link
            href="/santri"
            aria-label="Kembali ke dasbor"
            className="shadow-card mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-white/90 text-sky-900/80 transition-colors hover:bg-white lg:hidden dark:bg-white/15 dark:text-sky-100/80"
          >
            <ChevronLeft className="size-5.5" />
          </Link>
          {/* Chip piala — mode desktop */}
          <span className="shadow-card hidden size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-sky-600 text-white ring-2 ring-white/70 lg:flex">
            <Trophy className="size-7" />
            <span aria-hidden className="mt-0.5 block h-1 w-1 rounded-full bg-white/90" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight text-sky-950 sm:text-3xl dark:text-white">
              Kartu Prestasi
            </h2>
            <p className="mt-0.5 max-w-xs text-sm font-medium text-sky-900/75 dark:text-sky-100/75">
              Langkah kecil hari ini, untuk masa depan yang mulia.
            </p>
          </div>
          <p className="hidden max-w-56 shrink-0 text-right text-sm leading-snug font-medium text-sky-900/80 italic lg:block dark:text-sky-100/80">
            “Jadilah santri yang berprestasi, berakhlak mulia, dan bermanfaat untuk sesama.”
            <span aria-hidden className="mx-auto mt-1 block h-1 w-14 rounded-full bg-amber-300" />
          </p>
        </div>
      </div>

      {/* ================= STRIP IDENTITAS ================= */}
      <div className="bg-card relative -mt-4 px-4 sm:px-6">
        <div className="shadow-card flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-100/80 to-sky-50 px-4 py-4 sm:gap-4 sm:px-5 dark:border-sky-500/20 dark:from-sky-500/10 dark:to-transparent">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={c.studentName}
              className="size-16 shrink-0 rounded-full object-cover ring-2 ring-sky-200 lg:size-20 dark:ring-sky-500/30"
            />
          ) : (
            <span className="bg-role-soft text-role-strong flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-bold ring-2 ring-sky-200 lg:size-20 dark:ring-sky-500/30">
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
              <UserRound className="text-role size-3.5" />
              Nama Santri
            </p>
            <p className="text-role-strong truncate text-xl font-extrabold tracking-tight sm:text-2xl">
              {c.studentName}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-sm">
              {c.halaqahName ?? "Belum tergabung halaqah"}
              {nisTampil ? <span className="ml-2 font-mono text-xs">{nisTampil}</span> : null}
            </p>
          </div>

          {/* Gelembung kutipan — mode mobile (mockup) */}
          <div className="relative hidden min-w-44 max-w-[46%] shrink-0 items-center rounded-3xl bg-sky-400/80 px-4 py-3 sm:flex lg:hidden dark:bg-sky-500/25">
            <span aria-hidden className="absolute -top-1 left-3 text-lg leading-none font-black text-white/90">“</span>
            <span aria-hidden className="absolute right-3 -bottom-2 text-lg leading-none font-black text-white/90">”</span>
            <p className="text-center text-[0.72rem] leading-snug font-semibold text-white italic">
              Jadi santri hebat dengan ilmu, amal dan akhlak mulia.
              <span aria-hidden className="mx-auto mt-1 block h-1 w-10 rounded-full bg-amber-300" />
            </p>
          </div>

          {/* Kartu "Kamu hebat!" — mode desktop */}
          <div className="relative hidden min-w-52 flex-1 rounded-2xl bg-sky-100/80 px-4 py-3 sm:max-w-xs lg:flex dark:bg-sky-500/10">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-sm">
                <Medal className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-sky-950 dark:text-sky-100">Kamu hebat!</p>
                <p className="mt-0.5 text-xs leading-relaxed text-sky-900/70 dark:text-sky-100/70">
                  Teruslah belajar, karena setiap usaha adalah ibadah.
                </p>
                <span aria-hidden className="mt-1 block h-1 w-12 rounded-full bg-amber-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= PENCAPAIAN SAYA + PERINGKAT ================= */}
      <div className="mt-4 grid gap-4 px-4 pb-2 sm:px-6 lg:grid-cols-[1fr_300px]">
        {/* Pencapaian Saya */}
        <div className="shadow-card rounded-2xl border px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="bg-role text-role-ink shadow-card flex size-9 items-center justify-center rounded-xl">
                <Trophy className="size-4.5" />
              </span>
              <h3 className="text-role-strong text-lg font-extrabold tracking-tight">Pencapaian Saya</h3>
            </div>
            <span className="text-muted-foreground hidden text-xs lg:block">
              {c.lastAssessedAt ? `Terakhir dinilai ${tanggalId(c.lastAssessedAt)}` : "Belum ada penilaian"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {tiles.map((t) => (
              <AchievementTile key={t.key} tileKey={t.key} count={t.count} frac={t.frac} pct={t.pct} title={t.title} />
            ))}
          </div>

          {/* Lencana pencapaian */}
          {lencana.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {lencana.map((b) => (
                <span
                  key={b.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold",
                    b.tone
                  )}
                >
                  <span aria-hidden>{b.emoji}</span>
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {/* Catatan apresiasi guru */}
          {c.catatanApresiasi && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              “{c.catatanApresiasi}”
            </p>
          )}
        </div>

        {/* Peringkat */}
        <div className="shadow-card flex flex-col rounded-2xl border px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="bg-role text-role-ink shadow-card flex size-9 items-center justify-center rounded-xl">
              <Trophy className="size-4.5" />
            </span>
            <h3 className="text-role-strong text-lg font-extrabold tracking-tight">Peringkat</h3>
          </div>

          {/* Mobile: medali kiri + teks kanan; Desktop: tengah bertumpuk */}
          <div className="mt-3 flex flex-1 flex-row items-center gap-4 lg:flex-col lg:justify-center lg:gap-3 lg:text-center">
            <RankMedal rank={rank} />
            <div className="min-w-0 flex-1 lg:flex-none">
              <p className="text-role-strong text-lg font-extrabold tracking-tight lg:mt-2">
                {rank === null ? "Belum ada peringkat" : `Peringkat ${rank}`}
              </p>
              <p className="text-muted-foreground text-sm">
                {rank === null
                  ? "Menunggu nilai dari ustadz"
                  : totalRanked > 0
                    ? `dari ${totalRanked} santri`
                    : "di halaqah"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-sky-100/70 px-3.5 py-3 dark:bg-sky-500/10">
            <TrendingUp className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-300" />
            <p className="text-xs leading-relaxed font-medium text-sky-900/80 dark:text-sky-100/80">
              {rank === null
                ? "Raih nilai terbaik dari ustadz untuk mendapatkan peringkat."
                : rank === 1
                  ? "Juara 1! Pertahankan prestasimu, hebat!"
                  : "Pertahankan prestasi, raih peringkat lebih baik lagi!"}
            </p>
          </div>
        </div>
      </div>

      {/* ================= FOOTER ================= */}
      {/* Banner kutipan — mode mobile (mockup) */}
      <div className="mt-4 px-4 sm:px-6 lg:hidden">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-4 dark:from-sky-900 dark:to-sky-900/70">
          <span aria-hidden className="absolute right-2 -bottom-3 text-white/25">
            <MosqueGlyph className="size-16" />
          </span>
          <div className="relative flex items-center gap-3">
            <BookOpen className="size-6 shrink-0 text-white" aria-hidden />
            <p className="min-w-0 flex-1 text-center text-[0.8rem] leading-snug font-medium text-white italic">
              “Ilmu adalah cahaya, amal adalah buahnya, dan akhlak adalah keindahannya.”
            </p>
          </div>
          {!isPlaceholder && (
            <Link
              href={`/santri/pantauan?student=${c.studentId}`}
              className="relative mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-white/95 underline-offset-2 hover:underline"
            >
              Pantauan lengkap
              <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Gelombang — mode desktop */}
      <div className="relative mt-4 hidden h-14 overflow-hidden bg-gradient-to-r from-sky-500 via-sky-400 to-sky-300 lg:block dark:from-sky-900 dark:via-sky-900/80 dark:to-sky-900/50">
        <span aria-hidden className="absolute right-6 -bottom-3 text-white/25">
          <MosqueGlyph className="size-16" />
        </span>
        <span aria-hidden className="absolute right-28 -bottom-4 text-white/15">
          <MosqueGlyph className="size-12" />
        </span>
        {!isPlaceholder && (
          <Link
            href={`/santri/pantauan?student=${c.studentId}`}
            className="relative inline-flex h-full items-center gap-1 pl-5 text-sm font-semibold text-white hover:underline sm:pl-8"
          >
            Pantauan lengkap
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Kartu Prestasi (mockup terbaru) — frame besar: hero langit + masjid,
 * strip identitas + pesan motivasi, Pencapaian Saya (ubin modul berwarna),
 * kartu Peringkat medali, dan footer kutipan. Mode mobile mengikuti mockup
 * mobile (tombol kembali, gelembung kutipan, ubin menyamping dengan progress
 * bar, Peringkat menyamping, banner kutipan). Kartu selalu dirender meski
 * belum ada penilaian (angka 0).
 */
export default async function SantriPrestasiPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri/prestasi");
  const [data, targets, meterTotals, ranks] = await Promise.all([
    getPrestasiCards(),
    getSantriTargetProgress(),
    getMeterTotals(),
    getHalaqahRank(),
  ]);

  // V49 — foto santri: path storage dari profil akun di-sign per render.
  const avatarUrls = new Map<string, string>();
  await Promise.all(
    data.map(async (c) => {
      if (!c.avatarPath) return;
      const url = await signAvatarPath(c.avatarPath);
      if (url) avatarUrls.set(c.studentId, url);
    })
  );

  const cards: PrestasiCard[] =
    data.length > 0
      ? data
      : [
          {
            studentId: "placeholder",
            studentName: profile.fullName,
            businessCode: null,
            halaqahName: null,
            surahSelesai: 0,
            surahTotal: 0,
            avgScore: null,
            totalPenilaian: 0,
            penilaian30Hari: 0,
            lastAssessedAt: null,
            modules: {},
            moduleStats: {},
            presensi: { total: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 },
            catatanApresiasi: null,
          },
        ];

  return (
    <div className="space-y-5">
      {cards.map((c) => {
        const meters = buildMeters(c, targets, meterTotals.get(c.studentId));
        const rankInfo = ranks.get(c.studentId);
        return (
          <PrestasiFrame
            key={c.studentId}
            c={c}
            meters={meters}
            rankInfo={rankInfo}
            avatarUrl={avatarUrls.get(c.studentId) ?? null}
            isPlaceholder={c.studentId === "placeholder"}
          />
        );
      })}
    </div>
  );
}
