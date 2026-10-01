"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  BookOpenCheck,
  CalendarCheck2,
  ChevronRight,
  Flame,
  GraduationCap,
  HandHeart,
  ScrollText,
  SpellCheck,
  Star,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { persen, predikat } from "@/lib/santri-pantauan-shared";
import type { PrestasiCard, PresensiRekap } from "@/lib/santri-pantauan-shared";

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
}: {
  cards: PrestasiCard[];
  presensi: PresensiRekap[];
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

        <SantriModuleTiles card={selected} />
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

/** Tile per modul (Tahfidz/Tugas/Hadits/Doa/Tajwid/…) dengan bar kemajuan. */
function SantriModuleTiles({ card }: { card: PrestasiCard }) {
  const MODULES = [
    { key: "TAHFIDZ", label: "Tahfidz", icon: BookOpen, chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300", bar: "bg-emerald-500" },
    { key: "TUGAS", label: "Tugas", icon: ScrollText, chip: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300", bar: "bg-orange-500" },
    { key: "HADITS", label: "Hadits", icon: BookOpenCheck, chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300", bar: "bg-violet-500" },
    { key: "DOA", label: "Doa", icon: HandHeart, chip: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300", bar: "bg-rose-500" },
    { key: "TAJWID", label: "Tajwid", icon: SpellCheck, chip: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300", bar: "bg-teal-500" },
    { key: "TARTIL", label: "Tartil", icon: GraduationCap, chip: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300", bar: "bg-cyan-500" },
    { key: "SETORAN", label: "Setoran", icon: Activity, chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300", bar: "bg-blue-500" },
  ];

  const pakaiTarget = card.surahTotalIsTarget === true;
  const maxCount = Math.max(
    1,
    ...MODULES.map((m) => {
      const c = card.moduleStats?.[m.key]?.count ?? card.modules?.[m.key] ?? 0;
      return m.key === "TAHFIDZ" ? Math.max(c, pakaiTarget ? card.surahTotal : card.surahTotalKatalog ?? 0) : c;
    })
  );

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {MODULES.map((m) => {
        const stat = card.moduleStats?.[m.key];
        const count = stat?.count ?? card.modules?.[m.key] ?? 0;
        const denom =
          m.key === "TAHFIDZ"
            ? pakaiTarget
              ? card.surahTotal
              : card.surahTotalKatalog ?? 0
            : maxCount;
        const pct = denom > 0 ? Math.min(100, (count / denom) * 100) : 0;
        const Icon = m.icon;
        return (
          <div key={m.key} className={cn("rounded-2xl border border-transparent p-3", m.chip)}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <Icon className="size-4" />
                {m.label}
              </span>
              <ChevronRight className="size-3.5 opacity-60" />
            </div>
            <p className="mt-1.5 text-sm font-extrabold tabular-nums">
              {m.key === "TAHFIDZ" && denom > 0
                ? `${count}/${denom}`
                : `${count}×`}
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70 dark:bg-slate-500/20">
              <div className={cn("h-full rounded-full", m.bar)} style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
