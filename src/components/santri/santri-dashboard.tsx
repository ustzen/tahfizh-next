"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  BookOpenCheck,
  BookOpenText,
  CalendarCheck,
  CalendarCheck2,
  ChevronRight,
  Clock3,
  HandHeart,
  ListChecks,
  ScrollText,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";

import { QuickMenuGrid, QuickMenuEditorButton } from "@/components/dashboard/quick-menu-editor";
import type { QuickMenuItem } from "@/lib/quick-menu";
import type {
  HalaqahRank,
  MeterTotals,
  PantauanItem,
  PresensiRekap,
  PrestasiCard,
  TargetProgress,
} from "@/lib/santri-pantauan-shared";
import { persen } from "@/lib/santri-pantauan-shared";
import type { MenuIconOverride } from "@/lib/menu-icons";
import type { CustomModuleItem } from "@/lib/custom-module";

/* ------------------------------------------------------------------ */
/* Data & util                                                          */
/* ------------------------------------------------------------------ */
export type SantriDashboardProps = {
  /** Nama lengkap santri/wali dari session (tampil di sapaan hero). */
  namaSantri: string;
  avatarUrl: string | null;
  /** Tanggal panjang Indonesia (server, zona Jakarta). */
  tanggalHariIni: string;
  prestasi: PrestasiCard | null;
  presensi: PresensiRekap | null;
  targets: TargetProgress[];
  meterTotals: MeterTotals | undefined;
  /** Peringkat santri di halaqah (santri_halaqah_rank); null = belum tersedia. */
  rank: HalaqahRank | null;
  aktivitas: PantauanItem[];
  quickMenu: QuickMenuItem[];
  quickMenuDefaults: QuickMenuItem[];
  iconOverrides: MenuIconOverride[];
  customModules: CustomModuleItem[];
  customCounts: Record<string, number>;
  /** Nama & kode lembaga (dari profil → tenants). */
  lembagaNama: string | null;
  lembagaKode: string | null;
};

const MODULE_ICONS: Record<string, typeof BookOpen> = {
  TAHFIDZ: BookOpen,
  TARTIL: BookOpenText,
  TUGAS: ListChecks,
  HADITS: BookOpenText,
  DOA: HandHeart,
  TAJWID: BookOpenText,
  SETORAN: BookOpenCheck,
};

/** Paleta kartu statistik tinted (mockup: hijau / kuning / merah / biru). */
type StatStyle = {
  tile: string;
  iconBg: string;
  labelText: string;
  valueText: string;
  subText: string;
  bar: string;
  track: string;
};

const STAT_STYLES: Record<string, StatStyle> = {
  TAHFIDZ: {
    tile: "border-emerald-100 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    iconBg: "bg-emerald-500",
    labelText: "text-emerald-900 dark:text-emerald-200",
    valueText: "text-emerald-600 dark:text-emerald-300",
    subText: "text-emerald-600/80 dark:text-emerald-300/80",
    bar: "bg-emerald-500",
    track: "bg-emerald-200/70 dark:bg-emerald-500/25",
  },
  HADITS: {
    tile: "border-amber-100 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10",
    iconBg: "bg-amber-400",
    labelText: "text-amber-900 dark:text-amber-200",
    valueText: "text-amber-600 dark:text-amber-300",
    subText: "text-amber-600/80 dark:text-amber-300/80",
    bar: "bg-amber-400",
    track: "bg-amber-200/80 dark:bg-amber-500/25",
  },
  DOA: {
    tile: "border-rose-100 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10",
    iconBg: "bg-rose-500",
    labelText: "text-rose-900 dark:text-rose-200",
    valueText: "text-rose-600 dark:text-rose-300",
    subText: "text-rose-600/80 dark:text-rose-300/80",
    bar: "bg-rose-500",
    track: "bg-rose-200/70 dark:bg-rose-500/25",
  },
  TARTIL: {
    tile: "border-violet-100 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10",
    iconBg: "bg-violet-500",
    labelText: "text-violet-900 dark:text-violet-200",
    valueText: "text-violet-600 dark:text-violet-300",
    subText: "text-violet-600/80 dark:text-violet-300/80",
    bar: "bg-violet-500",
    track: "bg-violet-200/70 dark:bg-violet-500/25",
  },
  PRESENSI: {
    tile: "border-teal-100 bg-teal-50 dark:border-teal-500/20 dark:bg-teal-500/10",
    iconBg: "bg-teal-500",
    labelText: "text-teal-900 dark:text-teal-200",
    valueText: "text-teal-600 dark:text-teal-300",
    subText: "text-teal-600/80 dark:text-teal-300/80",
    bar: "bg-teal-500",
    track: "bg-teal-200/70 dark:bg-teal-500/25",
  },
  TUGAS: {
    tile: "border-blue-100 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10",
    iconBg: "bg-blue-500",
    labelText: "text-blue-900 dark:text-blue-200",
    valueText: "text-blue-600 dark:text-blue-300",
    subText: "text-blue-600/80 dark:text-blue-300/80",
    bar: "bg-blue-500",
    track: "bg-blue-200/70 dark:bg-blue-500/25",
  },
};

/** Ilustrasi masjid dekoratif (mockup: kubah biru + menara putih). */
function MosqueArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 120" aria-hidden className={className}>
      <circle cx="30" cy="24" r="14" fill="#ffffff55" />
      <circle cx="58" cy="18" r="10" fill="#ffffff44" />
      <circle cx="190" cy="28" r="12" fill="#ffffff33" />
      <rect x="52" y="46" width="12" height="62" rx="4" fill="#ffffffcc" />
      <path d="M52 46c0-8 3-12 6-12s6 4 6 12Z" fill="#2563EB" />
      <rect x="156" y="46" width="12" height="62" rx="4" fill="#ffffffcc" />
      <path d="M156 46c0-8 3-12 6-12s6 4 6 12Z" fill="#2563EB" />
      <rect x="78" y="66" width="64" height="42" rx="4" fill="#ffffff" />
      <path d="M78 66c0-18 14-28 32-28s32 10 32 28Z" fill="#2563EB" />
      <rect x="108" y="26" width="4" height="12" rx="2" fill="#F59E0B" />
      <path d="M100 108v-16a10 10 0 0 1 20 0v16Z" fill="#BFDBFE" />
    </svg>
  );
}

/** Kartu statistik mockup: lingkaran ikon solid + angka besar + progress bar. */
function StatCard({
  href,
  icon: Icon,
  style,
  label,
  value,
  sub,
  pct,
}: {
  href: string;
  icon: typeof BookOpen;
  style: StatStyle;
  label: string;
  value: string;
  sub: string;
  pct: number;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-1 rounded-2xl border px-3 py-4 text-center transition-transform active:scale-[0.98] ${style.tile}`}
    >
      <span className={`flex size-12 items-center justify-center rounded-full text-white shadow-sm ${style.iconBg}`}>
        <Icon className="size-6" />
      </span>
      <span className={`mt-1.5 text-sm font-bold sm:text-base ${style.labelText}`}>{label}</span>
      <span className={`text-3xl leading-none font-extrabold tabular-nums ${style.valueText}`}>{value}</span>
      <span className={`text-[0.72rem] font-semibold ${style.subText}`}>{sub}</span>
      <span className={`mt-1.5 h-2 w-full max-w-28 overflow-hidden rounded-full ${style.track}`} aria-hidden>
        <span className={`block h-full rounded-full ${style.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Komponen utama                                                       */
/* ------------------------------------------------------------------ */
export function SantriDashboard(props: SantriDashboardProps) {
  const {
    namaSantri,
    avatarUrl,
    tanggalHariIni,
    prestasi,
    presensi,
    targets,
    meterTotals,
    rank,
    aktivitas,
    quickMenu,
    quickMenuDefaults,
    iconOverrides,
  } = props;

  const targetTahfidz = useMemo(
    () => targets.find((t) => t.category === "TAHFIDZ" && t.targetValue > 0) ?? null,
    [targets]
  );
  const hafalanDone = targetTahfidz ? Math.min(targetTahfidz.capaian, targetTahfidz.targetValue) : (prestasi?.surahSelesai ?? 0);
  const hafalanTotal = targetTahfidz ? targetTahfidz.targetValue : (prestasi?.surahTotal ?? 0);

  // Capaian per modul: target guru bila ada, fallback penilaian vs total materi.
  const haditsTarget = targets.find((t) => t.category === "HADITS" && t.targetValue > 0);
  const haditsTotal = haditsTarget?.targetValue ?? meterTotals?.haditsTotal ?? 0;
  const haditsDone = haditsTarget
    ? Math.min(haditsTarget.capaian, haditsTarget.targetValue)
    : (prestasi?.moduleStats?.HADITS?.count ?? 0);

  const doaTarget = targets.find((t) => t.category === "DOA" && t.targetValue > 0);
  const doaTotal = doaTarget?.targetValue ?? meterTotals?.doaTotal ?? 0;
  const doaDone = doaTarget
    ? Math.min(doaTarget.capaian, doaTarget.targetValue)
    : (prestasi?.moduleStats?.DOA?.count ?? 0);

  const tugasTotalV = meterTotals?.tugasTotal ?? prestasi?.moduleStats?.TUGAS?.total ?? 0;
  const tugasDoneV = prestasi?.moduleStats?.TUGAS?.count ?? 0;

  // Tartil: tidak punya penyebut (jilid tak ditargetkan) → jumlah penilaian + rata-rata nilai.
  const tartilStat = prestasi?.moduleStats?.TARTIL;
  const tartilCount = tartilStat?.count ?? 0;
  const tartilAvg = tartilStat?.avgScore ?? null;
  const tartilSub =
    tartilCount > 0 && tartilAvg !== null
      ? `rata-rata ${tartilAvg.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`
      : `${tartilCount} dinilai`;

  // Presensi: hadir / total pertemuan (rekap 6 bulan; fallback ringkasan kartu prestasi).
  const presensiSum = presensi?.summary ?? prestasi?.presensi ?? null;
  const presensiHadir = presensiSum?.hadir ?? 0;
  const presensiTotal = presensiSum?.total ?? 0;

  /** Terakhir dihafal: penilaian terbaru modul; cadangan = item target terakhir yang tercapai. */
  const lastOf = (cat: string): string | null => {
    const fromAssess = prestasi?.moduleStats?.[cat]?.lastTitle;
    if (fromAssess) return fromAssess;
    const t = targets.find((x) => x.category === cat);
    const done = t?.itemStatus?.filter((i) => i.done) ?? [];
    return done.length > 0 ? done[done.length - 1].name : null;
  };
  /** Berikutnya: item pertama target guru yang belum tercapai (null bila tak ada target). */
  const nextOf = (cat: string): string | null => {
    const t = targets.find((x) => x.category === cat && x.targetValue > 0);
    if (!t) return null;
    if (t.itemStatus && t.itemStatus.length > 0) {
      return t.itemStatus.find((i) => !i.done)?.name ?? "Semua target tercapai";
    }
    const lines = (t.items ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    return lines[t.capaian] ?? "Semua target tercapai";
  };

  const hafalanRows = [
    { key: "TAHFIDZ", label: "Tahfidz Al-Qur'an", icon: BookOpen, done: hafalanDone, total: hafalanTotal, unit: "surat" },
    { key: "HADITS", label: "Hadits", icon: ScrollText, done: haditsDone, total: haditsTotal, unit: "hadits" },
    { key: "DOA", label: "Doa Harian", icon: HandHeart, done: doaDone, total: doaTotal, unit: "doa" },
  ].map((r) => ({ ...r, last: lastOf(r.key), next: nextOf(r.key) }));

  const rankNo = rank?.rank ?? null;
  const rankFace =
    rankNo === null
      ? "from-slate-200 to-slate-300 text-slate-600 ring-slate-300"
      : rankNo === 1
        ? "from-amber-300 to-amber-500 text-white ring-amber-400"
        : rankNo === 2
          ? "from-slate-300 to-slate-400 text-white ring-slate-300"
          : rankNo === 3
            ? "from-orange-300 to-orange-500 text-white ring-orange-400"
            : "from-sky-300 to-sky-500 text-white ring-sky-400";

  const aktivitasTerbaru = aktivitas.slice(0, 5);

  /** value besar + sub "d/t (p%)" — bila tak ada penyebut, tampilkan jumlah penilaian. */
  const statValue = (done: number, total: number) => (total > 0 ? `${Math.min(done, total)}` : `${done}`);
  const statSub = (done: number, total: number) =>
    total > 0 ? `${Math.min(done, total)}/${total} (${persen(Math.min(done, total), total)}%)` : `${done} dinilai`;
  const statPct = (done: number, total: number) => (total > 0 ? persen(Math.min(done, total), total) : 0);

  return (
    <div className="-mx-4 -mt-5 -mb-24 space-y-4 bg-gradient-to-b from-sky-200 via-sky-100 to-sky-50 p-3 pb-24 sm:mx-0 sm:mt-0 sm:mb-0 sm:rounded-3xl sm:p-5 sm:pb-24 lg:p-6 lg:pb-6 dark:from-sky-950/60 dark:via-background dark:to-background">
      {/* ============ HERO: sapaan + ilustrasi masjid ============ */}
      <div className="relative flex items-center gap-3.5 sm:gap-5">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="size-14 shrink-0 rounded-full object-cover ring-4 ring-white/80 sm:size-16 dark:ring-slate-500/20"
          />
        ) : (
          <span className="bg-role text-role-ink flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold ring-4 ring-white/80 sm:size-16 dark:ring-slate-500/20">
            {namaSantri.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sky-700/90 dark:text-sky-300">Assalamu&apos;alaikum</p>
          <h1 className="truncate text-xl font-extrabold tracking-tight text-[#1D5FAA] dark:text-sky-300 sm:text-2xl lg:text-3xl">
            {namaSantri}
          </h1>
          <p className="text-muted-foreground text-[0.8rem] sm:text-sm">Selamat datang di dashboard santri</p>
        </div>
        <MosqueArt className="hidden w-44 shrink-0 opacity-90 md:block lg:w-56" />
        <div className="hidden shrink-0 items-center gap-2.5 rounded-2xl border border-white/70 bg-white/80 px-3.5 py-2.5 lg:flex dark:border-slate-500/20 dark:bg-transparent">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300">
            <CalendarCheck2 className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{tanggalHariIni}</span>
            <span className="text-muted-foreground block text-[0.7rem]">Semoga penuh keberkahan</span>
          </span>
        </div>
      </div>

      {/* ============ BANNER KUTIPAN BIRU ============ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2563EB] via-[#2E7BD9] to-[#38BDF8] px-5 py-5 text-white sm:px-7 sm:py-6">
        <div className="relative z-10 max-w-md">
          <h2 className="text-lg leading-snug font-extrabold sm:text-xl lg:text-2xl">
            &ldquo;Sebaik-baik kalian adalah yang belajar Al-Qur&apos;an dan yang mengajarkannya.&rdquo;
          </h2>
          <div aria-hidden className="mt-3 h-1.5 w-16 rounded-full bg-amber-400" />
        </div>
        <MosqueArt className="absolute -right-2 top-1/2 w-36 -translate-y-1/2 opacity-80 sm:w-44" />
      </div>

      {/* ============ 6 KARTU STATISTIK ============ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          href="/santri/target"
          icon={BookOpen}
          style={STAT_STYLES.TAHFIDZ}
          label="Tahfidz"
          value={statValue(hafalanDone, hafalanTotal)}
          sub={statSub(hafalanDone, hafalanTotal)}
          pct={statPct(hafalanDone, hafalanTotal)}
        />
        <StatCard
          href="/santri/prestasi"
          icon={AudioLines}
          style={STAT_STYLES.TARTIL}
          label="Tartil"
          value={`${tartilCount}`}
          sub={tartilSub}
          pct={tartilAvg !== null ? Math.round(tartilAvg) : 0}
        />
        <StatCard
          href="/santri/prestasi"
          icon={ScrollText}
          style={STAT_STYLES.HADITS}
          label="Hadits"
          value={statValue(haditsDone, haditsTotal)}
          sub={statSub(haditsDone, haditsTotal)}
          pct={statPct(haditsDone, haditsTotal)}
        />
        <StatCard
          href="/santri/prestasi"
          icon={HandHeart}
          style={STAT_STYLES.DOA}
          label="Doa Harian"
          value={statValue(doaDone, doaTotal)}
          sub={statSub(doaDone, doaTotal)}
          pct={statPct(doaDone, doaTotal)}
        />
        <StatCard
          href="/santri/pantauan"
          icon={ListChecks}
          style={STAT_STYLES.TUGAS}
          label="Tugas"
          value={statValue(tugasDoneV, tugasTotalV)}
          sub={statSub(tugasDoneV, tugasTotalV)}
          pct={statPct(tugasDoneV, tugasTotalV)}
        />
        <StatCard
          href="/santri/presensi"
          icon={CalendarCheck}
          style={STAT_STYLES.PRESENSI}
          label="Presensi"
          value={`${Math.min(presensiHadir, presensiTotal || presensiHadir)}`}
          sub={presensiTotal > 0 ? statSub(presensiHadir, presensiTotal) : "belum ada data"}
          pct={statPct(presensiHadir, presensiTotal)}
        />
      </div>

      {/* ============ PERINGKAT ============ */}
      <Link
        href="/santri/prestasi"
        className="flex items-center gap-4 rounded-2xl border border-white/70 bg-white p-4 shadow-card transition-transform active:scale-[0.99] dark:border-slate-500/20 dark:bg-card sm:p-5"
      >
        <span
          className={`flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-black tabular-nums ring-4 ${rankFace}`}
          aria-hidden
        >
          {rankNo ?? "–"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-400">
            Peringkat
          </span>
          <span className="block text-lg font-extrabold text-[#1D5FAA] dark:text-sky-300">
            {rankNo === null ? "Belum ada peringkat" : `Peringkat ${rankNo}`}
          </span>
          <span className="text-muted-foreground block truncate text-sm">
            {rankNo === null
              ? "Menunggu nilai dari ustadz"
              : `${rank?.totalRanked ? `dari ${rank.totalRanked} santri` : "di halaqah"}${
                  rank?.halaqahName ? ` · ${rank.halaqahName}` : ""
                }`}
          </span>
          {rank?.avgScore !== null && rank?.avgScore !== undefined && (
            <span className="mt-0.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
              Rata-rata nilai {rank.avgScore.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
            </span>
          )}
        </span>
        <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
      </Link>

      {/* ============ PROGRESS HAFALAN: 3 bagian (Tahfidz, Hadits, Doa) ============ */}
      <div className="rounded-2xl border border-white/70 bg-white p-4 shadow-card dark:border-slate-500/20 dark:bg-card sm:p-5">
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500 text-white">
              <TrendingUp className="size-5" />
            </span>
            Progress Hafalan
          </p>
          <Link href="/santri/target" aria-label="Buka target hafalan" className="text-slate-400 hover:text-slate-600">
            <ChevronRight className="size-5" />
          </Link>
        </div>

        <ul className="divide-y divide-slate-100 dark:divide-slate-500/10">
          {hafalanRows.map((r) => {
            const st = STAT_STYLES[r.key];
            const Icon = r.icon;
            const p = statPct(r.done, r.total);
            return (
              <li key={r.key} className="flex gap-3 py-3.5 last:pb-0">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white ${st.iconBg}`}>
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm font-bold ${st.labelText}`}>{r.label}</span>
                    <span className="shrink-0 text-xs font-bold text-slate-700 dark:text-slate-200">
                      {r.total > 0 ? `${Math.min(r.done, r.total)}/${r.total} ${r.unit} · ${p}%` : `${r.done} dinilai`}
                    </span>
                  </div>
                  <div className={`h-1.5 overflow-hidden rounded-full ${st.track}`} aria-hidden>
                    <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.min(100, p)}%` }} />
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.65rem] font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-400">
                        Terakhir
                      </p>
                      <p className="truncate text-[0.8rem] font-bold text-slate-800 dark:text-slate-100">
                        {r.last ?? "Belum ada"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[0.65rem] font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-400">
                        Berikutnya
                      </p>
                      <p className="truncate text-[0.8rem] font-bold text-slate-800 dark:text-slate-100">
                        {r.next ?? "Belum ada target"}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ============ BANNER MOTIVASI ============ */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-sky-100/70 px-5 py-4 dark:border-sky-500/20 dark:bg-sky-500/10">
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-snug font-extrabold text-[#1D5FAA] dark:text-sky-300 sm:text-base">
              Jangan berhenti di sini, masih banyak ayat yang menunggumu!
            </p>
            <div aria-hidden className="mt-1.5 h-1 w-12 rounded-full bg-amber-400" />
          </div>
        </div>
        <svg viewBox="0 0 120 80" aria-hidden className="absolute top-1/2 right-3 hidden w-24 -translate-y-1/2 sm:block">
          <path d="M10 55c15-10 30-10 45 0V20C40 10 25 10 10 20Z" fill="#fff" stroke="#2563EB" strokeWidth="3" />
          <path d="M110 55c-15-10-30-10-45 0V20c15-10 30-10 45 0Z" fill="#fff" stroke="#2563EB" strokeWidth="3" />
          <path d="M55 20v35" stroke="#2563EB" strokeWidth="3" />
        </svg>
      </div>

      {/* ============ MENU CEPAT ============ */}
      <div className="rounded-2xl border border-white/70 bg-white p-4 shadow-card dark:border-slate-500/20 dark:bg-card sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300">
              <Zap className="size-4.5" />
            </span>
            Menu Cepat
          </p>
          <QuickMenuEditorButton
            defaults={quickMenuDefaults}
            visible={quickMenu}
            defaultVisible={quickMenuDefaults}
            iconOverrides={iconOverrides}
          />
        </div>
        <QuickMenuGrid items={quickMenu} iconOverrides={iconOverrides} />
      </div>

      {/* ============ GRID BAWAH: aktivitas | lembaga + kutipan ============ */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* ---- Aktivitas Terbaru ---- */}
        <div className="rounded-2xl border border-white/70 bg-white p-4 shadow-card dark:border-slate-500/20 dark:bg-card sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300">
                <Clock3 className="size-4.5" />
              </span>
              Aktivitas Terbaru
            </p>
            <Link href="/santri/pantauan" className="flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
              Lihat Semua <ArrowRight className="size-4" />
            </Link>
          </div>

          {aktivitasTerbaru.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Belum ada aktivitas. Mulai dengan setoran pertamamu!
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-500/10">
              {aktivitasTerbaru.map((a, i) => {
                const Icon = MODULE_ICONS[a.module] ?? BookOpenCheck;
                return (
                  <li key={`${a.studentId}-${i}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="bg-role-soft text-role-strong flex size-9 shrink-0 items-center justify-center rounded-full">
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{a.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {a.detail ?? a.module}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.7rem] font-semibold text-slate-500">
                        {a.assessedDate ? new Date(a.assessedDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—"}
                      </p>
                      {a.scoreValue !== null && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.62rem] font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                          <Star className="size-3" /> {a.scoreValue}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---- Kolom kanan: lembaga + kutipan ---- */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#38BDF8] px-6 py-6 text-white">
            <Sparkles className="absolute top-4 right-4 size-6 text-white/40" />
            <p className="max-w-[220px] text-lg leading-snug font-bold">
              &ldquo;Al-Qur&apos;an adalah teman terbaik di dunia dan akhirat.&rdquo;
            </p>
            <div aria-hidden className="mt-3 h-1.5 w-16 rounded-full bg-amber-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
