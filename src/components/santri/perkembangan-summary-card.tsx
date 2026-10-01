"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Award,
  BookOpenCheck,
  CalendarCheck2,
  ClipboardCheck,
  Flame,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  MODULE_ORDER,
  badgesFor,
  moduleLabel,
  moduleTone,
  persen,
  predikat,
} from "@/lib/santri-pantauan-shared";
import type { PrestasiCard, PresensiRekap } from "@/lib/santri-pantauan-shared";

/**
 * TAHFIZH V51 — Card "Perkembangan Ananda" di dashboard wali.
 *
 * Ringkasan perkembangan anak: rata-rata nilai + predikat, hafalan surat,
 * kehadiran, grafik penilaian per modul, grafik presensi 6 bulan, dan
 * lencana capaian. Semua angka berasal dari penilaian guru (RPC V18/V50) —
 * tidak ada penilaian yang dihitung baru di klien selain persentase tampilan.
 */

/** Bar horizontal sederhana berbasis CSS — ringan di mobile, tanpa library. */
function MiniBar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="bg-role-soft/60 h-1.5 w-full overflow-hidden rounded-full">
      <div
        className={cn("h-full rounded-full transition-all", tone)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

/** Statistik ringkas: ikon + angka besar + label + sub-keterangan. */
function StatBox({
  icon,
  value,
  label,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="border-role/10 bg-role-soft/30 rounded-xl border p-3">
      <span className={cn("mb-2 flex size-8 items-center justify-center rounded-lg", tone)} aria-hidden>
        {icon}
      </span>
      <p className="text-xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[0.7rem] font-semibold">{label}</p>
      <p className="text-muted-foreground mt-0.5 text-[0.65rem] leading-snug">{sub}</p>
    </div>
  );
}

export function PerkembanganSummaryCard({
  cards,
  presensi,
}: {
  cards: PrestasiCard[];
  /** Rekap presensi per anak (dari RPC santri_presensi_rekap) — untuk grafik bulanan. */
  presensi: PresensiRekap[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = cards.find((c) => c.studentId === selectedId) ?? cards[0];

  const pres = useMemo(
    () => presensi.find((p) => p.studentId === selected.studentId) ?? null,
    [presensi, selected.studentId]
  );

  if (!selected) return null;

  const pred = predikat(selected.avgScore);
  const hadirPct = selected.presensi.total > 0 ? persen(selected.presensi.hadir, selected.presensi.total) : 0;
  const badges = badgesFor(selected);

  // Grafik penilaian per modul — jumlah penilaian (skala relatif terhadap modul terbanyak).
  const maxCount = Math.max(1, ...MODULE_ORDER.map((k) => selected.moduleStats?.[k]?.count ?? 0));
  const activeModules = MODULE_ORDER.filter((k) => (selected.moduleStats?.[k]?.count ?? 0) > 0);

  // Grafik presensi 6 bulan terakhir (RPC sudah urut; ambil dari ekor).
  const months = (pres?.months ?? []).slice(-6);
  const maxMonth = Math.max(1, ...months.map((m) => m.total));

  return (
    <div className="border-role/15 bg-role-soft/20 shadow-card relative overflow-hidden rounded-2xl border">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-gradient-to-br from-white/20 to-transparent dark:from-white/5"
      />

      {/* Header */}
      <div className="border-role/15 relative flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <span className="bg-role text-role-ink shadow-card flex size-10 shrink-0 items-center justify-center rounded-xl">
          <TrendingUp className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold tracking-tight">Perkembangan Ananda</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">Ringkasan hasil belajar dari penilaian ustadz/ustadzah.</p>
        </div>
        <Link
          href={`/santri/pantauan?student=${selected.studentId}`}
          className="bg-role text-role-ink hover:bg-role/90 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
        >
          Detail lengkap
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      {/* Pemilih anak — chip */}
      {cards.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-5 pt-4">
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

      {/* Statistik utama */}
      <div className="grid grid-cols-2 gap-2.5 px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatBox
          icon={<Star className="size-4" />}
          value={selected.avgScore !== null ? selected.avgScore.toFixed(0) : "—"}
          label={pred.label}
          sub={`${selected.totalPenilaian} penilaian total`}
          tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        />
        {/* V57 — dua stat terpisah: pencapaian target guru vs total surah lembaga. */}
        <StatBox
          icon={<Target className="size-4" />}
          value={
            selected.surahTotalIsTarget === true
              ? `${selected.surahSelesai}/${selected.surahTotal}`
              : "—"
          }
          label="Pencapaian Target"
          sub={
            selected.surahTotalIsTarget === true
              ? "surat target ustadz yang sudah dikuasai"
              : "guru belum menetapkan target"
          }
          tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
        />
        <StatBox
          icon={<BookOpenCheck className="size-4" />}
          value={`${selected.surahSelesai}`}
          label="Total Surat"
          sub={`dari ${selected.surahTotalKatalog ?? selected.surahTotal} surah aktif lembaga`}
          tone="bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
        />
        <StatBox
          icon={<CalendarCheck2 className="size-4" />}
          value={`${hadirPct}%`}
          label="Kehadiran"
          sub={`${selected.presensi.hadir}/${selected.presensi.total} pertemuan`}
          tone="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
        />
        <StatBox
          icon={<Flame className="size-4" />}
          value={`${selected.penilaian30Hari}`}
          label="30 hari terakhir"
          sub="aktivitas dinilai"
          tone="bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
        />
      </div>

      {/* Grafik penilaian per modul */}
      <div className="px-5 pb-4">
        <div className="border-role/10 rounded-xl border bg-white/70 p-4 dark:bg-transparent">
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <ClipboardCheck className="text-role size-3.5" />
            Penilaian per modul
          </p>
          {activeModules.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-xs">
              Belum ada penilaian. Grafik akan terisi setelah ustadz/ustadzah mulai menilai.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activeModules.map((k) => {
                const stat = selected.moduleStats?.[k];
                const count = stat?.count ?? 0;
                return (
                  <li key={k} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "w-24 shrink-0 truncate rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold",
                        moduleTone(k)
                      )}
                    >
                      {moduleLabel(k)}
                    </span>
                    <MiniBar pct={(count / maxCount) * 100} tone="bg-role" />
                    <span className="w-16 shrink-0 text-right text-[0.7rem] tabular-nums">
                      {count}×
                      {stat?.avgScore !== null && stat?.avgScore !== undefined && (
                        <span className="text-muted-foreground"> · {stat.avgScore.toFixed(0)}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Grafik presensi 6 bulan — kolom vertikal CSS */}
      {months.length > 0 && (
        <div className="px-5 pb-4">
          <div className="border-role/10 rounded-xl border bg-white/70 p-4 dark:bg-transparent">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <CalendarCheck2 className="text-role size-3.5" />
              Kehadiran 6 bulan terakhir
            </p>
            <div className="mt-3 flex items-end justify-between gap-2" style={{ height: 96 }}>
              {months.map((m) => {
                const hadirPctM = m.total > 0 ? persen(m.hadir, m.total) : 0;
                return (
                  <div key={m.ym} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${m.hadir}/${m.total} hadir (${hadirPctM}%)`}>
                    <span className="text-[0.65rem] font-bold tabular-nums">{hadirPctM}%</span>
                    <div className="bg-role-soft/60 flex h-full w-full max-w-8 items-end overflow-hidden rounded-md">
                      <div
                        className="bg-role w-full rounded-md transition-all"
                        style={{ height: `${Math.max(4, (m.total / maxMonth) * 100)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground truncate text-[0.6rem]">
                      {new Date(m.anchor).toLocaleDateString("id-ID", { month: "short" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lencana capaian */}
      {badges.length > 0 && (
        <div className="border-role/10 border-t px-5 py-4">
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Award className="text-role size-3.5" />
            Lencana capaian
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold", b.tone)}
              >
                <span aria-hidden>{b.emoji}</span>
                {b.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
