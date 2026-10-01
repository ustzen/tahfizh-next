"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  BookOpenCheck,
  CalendarCheck2,
  ChevronRight,
  Flame,
  HandHeart,
  ScrollText,
  SpellCheck,
  Star,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { persen, predikat } from "@/lib/santri-pantauan-shared";
import type { MeterTotals, PrestasiCard, PresensiRekap, TargetProgress } from "@/lib/santri-pantauan-shared";
import type { CustomModuleItem } from "@/lib/custom-module";
import { customModuleIconFor, customModuleToneFor } from "@/components/akademik/custom-module-shared";

/**
 * TAHFIZH V57 — Dasbor santri bergaya "Santri Hebat".
 *
 * Tiga kartu utama: pil statistik (nilai, pencapaian target, total surat,
 * kehadiran, aktivitas 30 hari), Modul Pembelajaran (tile per modul dengan
 * bar kemajuan), dan Kehadiran bulanan (donut + toggle 6/3/1 bulan) —
 * ditutup banner motivasi. Angka tetap murni dari penilaian guru (RPC).
 */

/** Pil statistik: ikon bulat pastel + nilai besar + label, latar putih. */
function StatPill({
  href,
  icon,
  chip,
  accent,
  value,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  chip: string;
  accent: string;
  value: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "shadow-card group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 transition-transform active:scale-[0.98] dark:border-slate-500/20 dark:bg-card"
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", chip)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg leading-tight font-extrabold tracking-tight">{value}</span>
        <span className="text-muted-foreground block truncate text-[0.68rem] font-semibold">{label}</span>
      </span>
      <ChevronRight className={cn("size-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-400", accent)} />
    </Link>
  );
}

/** Donut persentase berbasis conic-gradient — ringan tanpa library. */
function Donut({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(${color} ${p}%, #e2e8f0 ${p}%)` }}
        aria-hidden
      />
      <div className="absolute inset-[7px] flex items-center justify-center rounded-full bg-white dark:bg-card">
        <span className="text-[0.68rem] font-extrabold tabular-nums">{p}%</span>
      </div>
    </div>
  );
}

/** Warna donut per bulan — dirotasi. */
const MONTH_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"];

export function SantriHomeCard({
  cards,
  presensi,
  targets,
  meterTotals,
  customModules,
  customCounts,
}: {
  cards: PrestasiCard[];
  presensi: PresensiRekap[];
  /** V57b — target guru per anak (RPC santri_target_progress) utk tile Tahfidz. */
  targets: TargetProgress[];
  /** V57c — penyebut modul lain (tugas/hadits/doa/tajwid) per anak. */
  meterTotals: MeterTotals[];
  /** V58 — modul kustom lembaga + jumlah poin per anak (kunci anakId:moduleId). */
  customModules: CustomModuleItem[];
  customCounts: Record<string, number>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = cards.find((c) => c.studentId === selectedId) ?? cards[0];
  const [bulanMode, setBulanMode] = useState<6 | 3 | 1>(6);

  const pres = useMemo(
    () => presensi.find((p) => p.studentId === selected.studentId) ?? null,
    [presensi, selected.studentId]
  );

  if (!selected) return null;

  const pred = predikat(selected.avgScore);
  const hadirPct = selected.presensi.total > 0 ? persen(selected.presensi.hadir, selected.presensi.total) : 0;

  // Target vs total — dua sumber berbeda (V57): item target guru vs katalog.
  const pakaiTarget = selected.surahTotalIsTarget === true;
  const targetTampil = `${selected.surahSelesai}/${selected.surahTotal}`;
  const totalSurah = selected.surahTotalKatalog ?? selected.surahTotal;

  // Bulan (terbaru dulu) sesuai mode toggle.
  const months = [...(pres?.months ?? [])].slice(-(bulanMode)).reverse();

  return (
    <div className="space-y-4">
      {/* Pemilih anak (wali dengan >1 anak) */}
      {cards.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {cards.map((c) => (
            <button
              key={c.studentId}
              type="button"
              onClick={() => setSelectedId(c.studentId)}
              aria-pressed={c.studentId === selected.studentId}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                c.studentId === selected.studentId
                  ? "bg-role text-role-ink shadow-sm"
                  : "border-role/25 text-muted-foreground border bg-white hover:bg-role-soft/60 dark:bg-transparent"
              )}
            >
              {c.studentName}
            </button>
          ))}
        </div>
      )}

      {/* Pil statistik */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatPill
          href="/santri/prestasi"
          icon={<Star className="size-5" />}
          chip="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
          accent=""
          value={selected.avgScore !== null ? selected.avgScore.toFixed(0) : "Belum ada nilai"}
          label={selected.avgScore !== null ? pred.label : "rata-rata penilaian"}
        />
        <StatPill
          href="/santri/target"
          icon={<Target className="size-5" />}
          chip="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
          accent=""
          value={pakaiTarget ? targetTampil : "—"}
          label="Pencapaian Target"
        />
        <StatPill
          href="/santri/prestasi"
          icon={<BookOpenCheck className="size-5" />}
          chip="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
          accent=""
          value={`${selected.surahSelesai}`}
          label={`Total Surat (dari ${totalSurah})`}
        />
        <StatPill
          href="/santri/presensi"
          icon={<CalendarCheck2 className="size-5" />}
          chip="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
          accent=""
          value={`${hadirPct}%`}
          label="Kehadiran"
        />
        <StatPill
          href="/santri/pantauan"
          icon={<Flame className="size-5" />}
          chip="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
          accent=""
          value={`${selected.penilaian30Hari}`}
          label="30 hari terakhir"
        />
      </div>

      {/* Modul Pembelajaran */}
      <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-500/20 dark:bg-card sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <span className="bg-role text-role-ink flex size-6 items-center justify-center rounded-lg">
                <BookOpen className="size-3.5" />
              </span>
              Modul Pembelajaran
            </p>
            <p className="text-muted-foreground mt-0.5 text-[0.7rem]">
              Pilih modul untuk melihat progres belajarmu.
            </p>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[0.62rem] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 sm:block">
            &ldquo;Iqra&apos; bismi rabbika&rdquo; — teruslah membaca ✨
          </span>
        </div>

        <SantriModuleTiles
          card={selected}
          targets={targets}
          meterTotals={meterTotals.find((m) => m.studentId === selected.studentId)}
          customModules={customModules}
          customCounts={Object.fromEntries(
            customModules
              .map((cm) => [cm.id, customCounts[`${selected.studentId}:${cm.id}`] ?? 0] as const)
          )}
        />
      </div>

      {/* Kehadiran bulanan */}
      <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-500/20 dark:bg-card sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <span className="flex size-6 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                <CalendarCheck2 className="size-3.5" />
              </span>
              Kehadiran &amp; bulan terakhir
            </p>
            <p className="text-muted-foreground mt-0.5 text-[0.7rem]">
              Konsistensi hadirmu, tiap bulan dicatat.
            </p>
          </div>
          <div role="radiogroup" aria-label="Rentang bulan" className="flex gap-1">
            {([6, 3, 1] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={bulanMode === m}
                onClick={() => setBulanMode(m)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.65rem] font-bold transition-colors",
                  bulanMode === m
                    ? "bg-role text-role-ink"
                    : "text-muted-foreground border bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-800/50"
                )}
              >
                {m} Bulan
              </button>
            ))}
          </div>
        </div>

        {months.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            Belum ada rekap kehadiran. Grafik terisi setelah presensi dicatat.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {months.map((m, i) => {
              const pct = m.total > 0 ? persen(m.hadir, m.total) : 0;
              const color = MONTH_COLORS[i % MONTH_COLORS.length];
              const label = new Date(m.anchor).toLocaleDateString("id-ID", { month: "short" });
              return (
                <div key={m.ym} className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-50 p-2 dark:border-slate-500/10" title={`${m.hadir}/${m.total} hadir`}>
                  <Donut pct={pct} color={color} />
                  <span className="flex items-center gap-1 text-[0.65rem] font-semibold">
                    <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Banner motivasi */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-teal-500/10">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <BookOpen className="size-4.5" />
          </span>
          <div>
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Jangan berhenti di sini</p>
            <p className="text-[0.7rem] text-emerald-700/80 dark:text-emerald-300/80">
              Setiap ayat yang dihafal dicatat sebagai amal.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm">
          Semoga Allah mudahkan hafalanku 🤲
        </span>
      </div>
    </div>
  );
}

/**
 * Tile per modul dengan bar kemajuan + badge persen (V57c).
 * Tahfidz murni berbasis TARGET guru: "berapa surat dari N surat target yang
 * sudah dikuasai" (maksimal 18/18 + badge 100%), bukan total hafalan anak.
 * Hadits/Doa: pakai target guru bila ada (capaian per item-ID), selain itu
 * penilaian LULUS dibanding jumlah materi. Tugas/Tajwid: penilaian vs total
 * tugas/materi aktif dari santri_meter_totals.
 */
function SantriModuleTiles({
  card,
  targets,
  meterTotals,
  customModules,
  customCounts,
}: {
  card: PrestasiCard;
  targets: TargetProgress[];
  meterTotals?: MeterTotals;
  customModules: CustomModuleItem[];
  customCounts: Record<string, number>;
}) {
  const MODULES = [
    { key: "TAHFIDZ", label: "Tahfidz", icon: BookOpen, chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300", bar: "bg-emerald-500" },
    { key: "TUGAS", label: "Tugas", icon: ScrollText, chip: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300", bar: "bg-orange-500" },
    { key: "HADITS", label: "Hadits", icon: BookOpenCheck, chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300", bar: "bg-violet-500" },
    { key: "DOA", label: "Doa", icon: HandHeart, chip: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300", bar: "bg-rose-500" },
    { key: "TAJWID", label: "Tajwid", icon: SpellCheck, chip: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300", bar: "bg-teal-500" },
  ];

  // Target Tahfidz anak ini (mode katalog V54: capaian = surat target yang sudah dinilai).
  const tTahfidz = targets.find(
    (t) => t.studentId === card.studentId && t.category === "TAHFIDZ" && t.targetValue > 0
  );
  const tahfidzDone = tTahfidz ? Math.min(tTahfidz.capaian, tTahfidz.targetValue) : 0;
  const tahfidzTotal = tTahfidz ? tTahfidz.targetValue : 0;
  const tahfidzPct = tahfidzTotal > 0 ? Math.round((tahfidzDone / tahfidzTotal) * 100) : 0;

  const maxCount = Math.max(
    1,
    ...MODULES.filter((m) => m.key !== "TAHFIDZ").map(
      (m) => card.moduleStats?.[m.key]?.count ?? card.modules?.[m.key] ?? 0
    )
  );

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {MODULES.map((m) => {
        const stat = card.moduleStats?.[m.key];
        const count = stat?.count ?? card.modules?.[m.key] ?? 0;
        const isTahfidz = m.key === "TAHFIDZ";
        const t = targets.find(
          (x) => x.studentId === card.studentId && x.category === m.key && x.targetValue > 0
        );

        // Penyebut & pembilang per modul.
        let done = 0;
        let total = 0;
        if (isTahfidz) {
          done = tahfidzDone;
          total = tahfidzTotal;
        } else if (t) {
          done = Math.min(t.capaian, t.targetValue);
          total = t.targetValue;
        } else {
          done = count;
          total =
            m.key === "TUGAS"
              ? meterTotals?.tugasTotal ?? 0
              : m.key === "HADITS"
                ? meterTotals?.haditsTotal ?? 0
                : m.key === "DOA"
                  ? meterTotals?.doaTotal ?? 0
                  : meterTotals?.tajwidTotal ?? 0;
        }
        const pakaiRatio = total > 0;
        const pct = pakaiRatio ? Math.min(100, Math.round((done / total) * 100)) : 0;
        const Icon = m.icon;

        return (
          <div key={m.key} className={cn("rounded-2xl border border-transparent p-3", m.chip)}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <Icon className="size-4" />
                {m.label}
              </span>
              {pakaiRatio ? (
                <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[0.6rem] font-extrabold tabular-nums dark:bg-slate-500/20">
                  {pct}%
                </span>
              ) : (
                <ChevronRight className="size-3.5 opacity-60" />
              )}
            </div>
            <p className="mt-1.5 text-sm font-extrabold tabular-nums">
              {pakaiRatio ? `${done}/${total}` : isTahfidz ? "—" : `${count}×`}
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70 dark:bg-slate-500/20">
              <div
                className={cn("h-full rounded-full", m.bar)}
                style={{
                  width: pakaiRatio
                    ? pct <= 0
                      ? "0%"
                      : `${Math.max(4, pct)}%`
                    : count <= 0
                      ? "0%"
                      : `${Math.max(4, Math.min(100, (count / maxCount) * 100))}%`,
                }}
              />
            </div>
            {isTahfidz && !pakaiRatio && (
              <p className="mt-1 text-[0.58rem] font-semibold opacity-80">Belum ada target ustadz</p>
            )}
          </div>
        );
      })}

      {/* V58 — modul kustom lembaga; V59: dengan menu tersendiri bisa diklik */}
      {customModules.map((cm) => {
        const IconC = customModuleIconFor(cm.icon);
        const tone = customModuleToneFor(cm.tone);
        const done = customCounts[cm.id] ?? 0;
        const total = cm.poinTarget;
        const pakaiRatio = total > 0;
        const pct = pakaiRatio ? Math.min(100, Math.round((done / total) * 100)) : 0;
        const tile = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <IconC className="size-4" />
                {cm.label}
              </span>
              {pakaiRatio ? (
                <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[0.6rem] font-extrabold tabular-nums dark:bg-slate-500/20">
                  {pct}%
                </span>
              ) : (
                <ChevronRight className="size-3.5 opacity-60" />
              )}
            </div>
            <p className="mt-1.5 text-sm font-extrabold tabular-nums">
              {pakaiRatio ? `${done}/${total}` : `${done} kegiatan`}
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70 dark:bg-slate-500/20">
              <div
                className={cn("h-full rounded-full", tone.bar)}
                style={{
                  width: !pakaiRatio || pct <= 0 ? (done > 0 ? "8%" : "0%") : `${Math.max(4, pct)}%`,
                }}
              />
            </div>
          </>
        );
        return (
          <div key={cm.id} className={cn("rounded-2xl border border-transparent p-3", tone.tile)}>
            {cm.showAsMenu ? (
              <Link href={`/santri/modul/${cm.id}`} className="block" aria-label={`Buka menu ${cm.label}`}>
                {tile}
              </Link>
            ) : (
              tile
            )}
          </div>
        );
      })}
    </div>
  );
}
