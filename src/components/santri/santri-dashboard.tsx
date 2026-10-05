"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  BookOpenText,
  CalendarCheck2,
  ChevronRight,
  Clock3,
  HandHeart,
  Landmark,
  ListChecks,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

import { Donut } from "@/components/santri/santri-home-card";
import { QuickMenuGrid, QuickMenuEditorButton } from "@/components/dashboard/quick-menu-editor";
import type { QuickMenuItem } from "@/lib/quick-menu";
import type {
  MeterTotals,
  PantauanItem,
  PresensiRekap,
  PrestasiCard,
  TargetProgress,
} from "@/lib/santri-pantauan-shared";
import { persen, targetScopeLabel } from "@/lib/santri-pantauan-shared";
import type { MenuIconOverride } from "@/lib/menu-icons";
import type { CustomModuleItem } from "@/lib/custom-module";

/* ------------------------------------------------------------------ */
/* Data & util                                                          */
/* ------------------------------------------------------------------ */
export type SantriDashboardProps = {
  namaPanggilan: string;
  avatarUrl: string | null;
  /** Tanggal panjang Indonesia (server, zona Jakarta). */
  tanggalHariIni: string;
  prestasi: PrestasiCard | null;
  presensi: PresensiRekap | null;
  targets: TargetProgress[];
  meterTotals: MeterTotals | undefined;
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

/** Chip kartu statistik mockup: ikon lingkaran besar + angka + sublabel. */
function StatCard({
  href,
  icon: Icon,
  chip,
  chipText,
  value,
  label,
  sub,
}: {
  href: string;
  icon: typeof BookOpen;
  chip: string;
  chipText: string;
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-1 rounded-2xl border border-slate-100 bg-white px-3 py-5 text-center transition-colors hover:border-slate-200 dark:border-slate-500/20 dark:bg-card dark:hover:border-slate-500/40"
    >
      <span className={`flex size-12 items-center justify-center rounded-2xl ${chip} ${chipText}`}>
        <Icon className="size-6" />
      </span>
      <span className="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">{label}</span>
      <span className="text-3xl font-extrabold tabular-nums text-[#1D5FAA] dark:text-sky-300">{value}</span>
      <span className="text-[0.72rem] font-semibold text-slate-400">{sub}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Komponen utama                                                       */
/* ------------------------------------------------------------------ */
export function SantriDashboard(props: SantriDashboardProps) {
  const {
    namaPanggilan,
    avatarUrl,
    tanggalHariIni,
    prestasi,
    presensi,
    targets,
    meterTotals,
    aktivitas,
    quickMenu,
    quickMenuDefaults,
    iconOverrides,
    lembagaNama,
    lembagaKode,
  } = props;

  const targetTahfidz = useMemo(
    () => targets.find((t) => t.category === "TAHFIDZ" && t.targetValue > 0) ?? null,
    [targets]
  );
  const hafalanDone = targetTahfidz ? Math.min(targetTahfidz.capaian, targetTahfidz.targetValue) : (prestasi?.surahSelesai ?? 0);
  const hafalanTotal = targetTahfidz ? targetTahfidz.targetValue : (prestasi?.surahTotal ?? 0);
  const hafalanPct = hafalanTotal > 0 ? persen(hafalanDone, hafalanTotal) : 0;

  const tugasTotal = meterTotals?.tugasTotal ?? 0;
  const tugasDone = prestasi?.moduleStats?.TUGAS?.count ?? 0;
  const tartilCount = prestasi?.moduleStats?.TARTIL?.count ?? 0;
  const doaCount = prestasi?.moduleStats?.DOA?.count ?? 0;

  const aktivitasTerbaru = aktivitas.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* ============ HERO: sapaan + tanggal ============ */}
      <div className="shadow-card flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 bg-white px-5 py-5 dark:border-slate-500/20 dark:bg-card sm:px-6">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="size-16 shrink-0 rounded-full object-cover ring-4 ring-sky-100 dark:ring-sky-500/20 sm:size-16"
          />
        ) : (
          <span className="bg-role-soft text-role-strong flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-extrabold ring-4 ring-sky-100 dark:ring-sky-500/20">
            {namaPanggilan.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Assalamu&apos;alaikum</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1D5FAA] dark:text-sky-300 sm:text-3xl">
            {namaPanggilan}
          </h1>
          <p className="text-muted-foreground text-sm">Selamat datang di dashboard santri</p>
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3.5 py-2.5 dark:border-slate-500/20 dark:bg-transparent">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300">
            <CalendarCheck2 className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{tanggalHariIni}</span>
            <span className="text-muted-foreground block text-[0.7rem]">Semoga penuh keberkahan</span>
          </span>
        </div>
      </div>

      {/* ============ BANNER + 4 STATISTIK ============ */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Banner biru */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2563EB] via-[#2E7BD9] to-[#38BDF8] px-6 py-6 text-white sm:px-7">
          <div className="relative z-10 max-w-xs">
            <h2 className="text-xl font-extrabold leading-snug sm:text-2xl">
              Teruslah semangat menghafal Al-Qur&apos;an
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-blue-100">
              Setiap ayat yang kamu hafal, adalah langkah menuju ridha Allah.
            </p>
            <div aria-hidden className="mt-3 h-1.5 w-16 rounded-full bg-amber-400" />
          </div>
          {/* ilustrasi dekoratif kanan */}
          <svg viewBox="0 0 220 120" aria-hidden className="absolute right-0 top-0 h-full w-44 opacity-90">
            <rect x="0" y="0" width="220" height="120" fill="none" />
            <circle cx="180" cy="24" r="30" fill="#ffffff14" />
            <circle cx="205" cy="90" r="38" fill="#ffffff10" />
            <path d="M20 92c22-8 44-8 66 0s44 8 66 0" stroke="#FFD34D" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.9" />
            <path d="M0 104c26-8 52-8 78 0s52 8 78 0 52-8 64 0" stroke="#ffffff22" strokeWidth="9" fill="none" />
          </svg>
        </div>

        {/* 4 kartu statistik */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            href="/santri/tartil"
            icon={BookOpenText}
            chip="bg-emerald-100 dark:bg-emerald-500/15"
            chipText="text-emerald-600 dark:text-emerald-300"
            value={`${tartilCount}`}
            label="Tartil"
            sub="Halaman"
          />
          <StatCard
            href="/santri/tahfidz"
            icon={BookOpen}
            chip="bg-amber-100 dark:bg-amber-500/15"
            chipText="text-amber-500 dark:text-amber-300"
            value={`${hafalanTotal}`}
            label="Hafalan"
            sub="Juz"
          />
          <StatCard
            href="/santri/target"
            icon={ListChecks}
            chip="bg-rose-100 dark:bg-rose-500/15"
            chipText="text-rose-600 dark:text-rose-300"
            value={`${hafalanDone}`}
            label="Tugas"
            sub="Target"
          />
          <StatCard
            href="/santri/doa"
            icon={HandHeart}
            chip="bg-sky-100 dark:bg-sky-500/15"
            chipText="text-sky-600 dark:text-sky-300"
            value={`${doaCount}`}
            label="Doa Harian"
            sub="Hari Ini"
          />
        </div>
      </div>

      {/* ============ GRID UTAMA ============ */}
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1.15fr_0.85fr]">
        {/* ---- KOLOM 1 ---- */}
        <div className="space-y-4">
          {/* Aktivitas Terbaru */}
          <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-500/20 dark:bg-card">
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                <span className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300">
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
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-role-soft text-role-strong">
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

          {/* Progress Hafalan */}
          <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-500/20 dark:bg-card">
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <BookOpen className="size-4.5" />
                </span>
                Progress Hafalan
              </p>
              <Link href="/santri/tahfidz" aria-label="Buka hafalan" className="text-slate-400 hover:text-slate-600">
                <ChevronRight className="size-5" />
              </Link>
            </div>

            <div className="flex items-center gap-5">
              <span className="relative shrink-0">
                <Donut pct={hafalanPct} color="#2563EB" size={92} />
                <span className="absolute inset-0 flex items-center justify-center text-lg font-extrabold tabular-nums text-[#1D5FAA] dark:text-sky-300">
                  {hafalanPct}%
                </span>
              </span>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 dark:text-slate-100">
                  {targetTahfidz ? `Target ${hafalanTotal} surat` : `Hafalan tersimpan`}
                </p>
                {targetTahfidz && (
                  <p className="text-muted-foreground text-sm">
                    {targetTahfidz.items ? targetTahfidz.items.split("\n")[0] : "Sesuai target ustadz"}
                  </p>
                )}
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {targetTahfidz ? targetScopeLabel(targetTahfidz.scope) : "Juz 30 · An-Naba s.d. An-Naba"}
                </p>
                <div className="mt-2 h-2 w-full max-w-[180px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-500/20">
                  <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${Math.max(3, hafalanPct)}%` }} />
                </div>
                <p className="text-muted-foreground mt-1.5 text-xs font-semibold">
                  {hafalanDone} / {hafalanTotal} surat
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ---- KOLOM 2 ---- */}
        <div className="space-y-4">
          {/* Menu Cepat */}
          <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-500/20 dark:bg-card">
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                <span className="flex size-8 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300">
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

          {/* Banner motivasi */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-400 via-sky-300 to-sky-200 px-6 py-6">
            <div className="relative z-10 max-w-[220px]">
              <h3 className="text-lg font-extrabold leading-snug text-[#0B4A7A]">
                Jangan berhenti di sini, masih banyak ayat yang menunggumu!
              </h3>
              <div aria-hidden className="mt-2.5 h-1.5 w-14 rounded-full bg-amber-400" />
            </div>
            <svg viewBox="0 0 200 100" aria-hidden className="absolute right-0 top-0 h-full w-36">
              <rect x="150" y="30" width="12" height="70" rx="3" fill="#EFDDB6" />
              <path d="M150 30c0-8 3-13 6-13s6 5 6 13Z" fill="#2563EB" />
              <ellipse cx="106" cy="66" rx="30" ry="16" fill="#2563EB" />
              <path d="M96 60c6-10 14-10 20 0 6 10-2 16-10 16s-16-6-10-16Z" fill="#F2A33C" />
            </svg>
          </div>

          {/* Informasi Lembaga */}
          <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-500/20 dark:bg-card">
            <p className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <span className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300">
                <Landmark className="size-4.5" />
              </span>
              Informasi Lembaga
            </p>
            <div className="mt-4 flex items-start gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-500/20 dark:bg-transparent">
              <span className="bg-role flex size-11 shrink-0 items-center justify-center rounded-xl text-white">
                <Landmark className="size-5.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-800 dark:text-slate-100">{lembagaNama ?? "TAHFIZH"}</p>
                <p className="text-muted-foreground text-sm">Kode lembaga: {lembagaKode ?? "—"}</p>
              </div>
            </div>
          </div>

          {/* Kartu kutipan */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#38BDF8] px-6 py-6 text-white">
            <Sparkles className="absolute right-4 top-4 size-6 text-white/40" />
            <p className="max-w-[220px] text-lg font-bold leading-snug">
              &ldquo;Al-Qur&apos;an adalah teman terbaik di dunia dan akhirat.&rdquo;
            </p>
            <div aria-hidden className="mt-3 h-1.5 w-16 rounded-full bg-amber-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
