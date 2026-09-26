import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  BookOpenCheck,
  BookOpenText,
  ClipboardCheck,
  HandHeart,
  SpellCheck,
  AudioLines,
  ListChecks,
  ArrowUpRight,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getPrestasiCards } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import {
  EMPTY_MODULE_STAT,
  MODULE_ORDER,
  badgesFor,
  moduleLabel,
  persen,
  predikat,
  tanggalId,
  type ModuleKey,
  type ModuleStat,
  type PrestasiCard,
} from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Kartu Prestasi" };

const MODULE_ICONS: Record<ModuleKey, React.ComponentType<{ className?: string }>> = {
  TAHFIDZ: BookOpenCheck,
  SETORAN: ClipboardCheck,
  TARTIL: AudioLines,
  HADITS: BookOpenText,
  DOA: HandHeart,
  TAJWID: SpellCheck,
  TUGAS: ListChecks,
};

/** Warna ikon+angka per modul — dot kecil, bukan chip besar, biar ringkas. */
const MODULE_ACCENT: Record<ModuleKey, string> = {
  TAHFIDZ: "text-emerald-600 dark:text-emerald-400",
  SETORAN: "text-blue-600 dark:text-blue-400",
  TARTIL: "text-sky-600 dark:text-sky-400",
  HADITS: "text-violet-600 dark:text-violet-400",
  DOA: "text-amber-600 dark:text-amber-400",
  TAJWID: "text-rose-600 dark:text-rose-400",
  TUGAS: "text-orange-600 dark:text-orange-400",
};

/** Cincin skor kecil pakai conic-gradient — tanpa SVG/JS tambahan. */
function ScoreRing({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const ringColor =
    score === null
      ? "#cbd5e1"
      : score >= 90
        ? "#059669"
        : score >= 80
          ? "#0284c7"
          : score >= 70
            ? "#d97706"
            : "#e11d48";
  return (
    <div
      className="relative flex size-14 shrink-0 items-center justify-center rounded-full lg:size-20"
      style={{ background: `conic-gradient(${ringColor} ${pct * 3.6}deg, #e2e8f0 0deg)` }}
    >
      <div className="bg-card flex size-11 items-center justify-center rounded-full lg:size-16">
        <span className="tabular text-sm font-bold leading-none lg:text-xl">{score ?? "–"}</span>
      </div>
    </div>
  );
}

function ModuleTile({ moduleKey, stat }: { moduleKey: ModuleKey; stat: ModuleStat }) {
  const Icon = MODULE_ICONS[moduleKey];
  const kosong = stat.count === 0;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl px-1.5 py-2.5 text-center lg:gap-1.5 lg:px-2 lg:py-4",
        kosong ? "bg-slate-50 dark:bg-slate-500/5" : "bg-slate-50 dark:bg-slate-500/10"
      )}
      title={
        kosong
          ? `${moduleLabel(moduleKey)} · belum ada penilaian`
          : `${moduleLabel(moduleKey)} · ${stat.lastTitle ?? ""} · ${tanggalId(stat.lastDate)}`
      }
    >
      <Icon className={cn("size-4 lg:size-5", kosong ? "text-slate-400 dark:text-slate-500" : MODULE_ACCENT[moduleKey])} />
      <span className={cn("tabular text-base leading-none font-bold lg:text-xl", kosong && "text-muted-foreground")}>
        {stat.count}
      </span>
      <span className="text-muted-foreground truncate text-[0.6rem] leading-tight font-medium lg:text-[0.72rem]">
        {moduleLabel(moduleKey).split(" ")[0]}
      </span>
    </div>
  );
}

/**
 * Kartu Prestasi (versi baru) — seperti raport mini: identitas anak, cincin
 * rata-rata nilai, dua meter (surat dikuasai & kehadiran), 7 ubin modul,
 * lencana, dan catatan apresiasi guru. Kartu selalu dirender meski belum ada
 * penilaian (angka 0) supaya anak tahu apa yang akan terisi nanti.
 */
export default async function SantriPrestasiPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri/prestasi");
  const data = await getPrestasiCards();

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
    <div>
      <PageHeader
        title="Kartu Prestasi"
        description="Raport mini ananda — rata-rata nilai, capaian hafalan, kehadiran, dan apresiasi dari ustadz/ustadzah."
        icon={<Award className="size-6" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-5">
        {cards.map((c) => {
          const p = predikat(c.avgScore);
          const lencana = badgesFor(c).slice(0, 3);
          const hadirPct = persen(c.presensi.hadir, c.presensi.total);
          const surahPct = persen(c.surahSelesai, c.surahTotal);
          const initial = c.studentName.trim().charAt(0).toUpperCase() || "?";

          return (
            <div
              key={c.studentId}
              className="bg-card shadow-card relative flex flex-col overflow-hidden rounded-2xl border"
            >
              <span aria-hidden className="bg-role absolute inset-x-0 top-0 h-1" />

              <div className="flex items-start gap-3 px-4 pt-4 lg:gap-4 lg:px-6 lg:pt-6">
                <span className="bg-role-soft text-role-strong flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold lg:size-14 lg:text-lg">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-bold tracking-tight text-foreground lg:text-xl">
                    {c.studentName}
                  </p>
                  <p className="text-muted-foreground truncate text-xs lg:text-sm">
                    {c.halaqahName ?? "Belum tergabung halaqah"}
                    {c.businessCode ? ` · ${c.businessCode}` : ""}
                  </p>
                </div>
                <ScoreRing score={c.avgScore} />
              </div>

              <div className="px-4 pt-2 lg:px-6 lg:pt-3">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-bold lg:px-3 lg:py-1 lg:text-sm", p.tone)}>
                  {p.label}
                </span>
              </div>

              {/* Dua meter ringkas berdampingan */}
              <div className="mt-3 grid grid-cols-2 gap-2 px-4 lg:mt-4 lg:gap-3 lg:px-6">
                <div className="rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-500/10 lg:px-5 lg:py-4">
                  <p className="tabular text-sm font-bold text-emerald-700 dark:text-emerald-300 lg:text-lg">
                    {c.surahSelesai}
                    <span className="text-muted-foreground font-normal">/{c.surahTotal || 0}</span>
                  </p>
                  <p className="text-muted-foreground text-[0.65rem] font-medium lg:text-xs">Surat dikuasai</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-emerald-200/70 dark:bg-emerald-500/20 lg:mt-2 lg:h-1.5">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${surahPct}%` }} />
                  </div>
                </div>
                <div className="rounded-xl bg-sky-50 px-3 py-2 dark:bg-sky-500/10 lg:px-5 lg:py-4">
                  <p className="tabular text-sm font-bold text-sky-700 dark:text-sky-300 lg:text-lg">{hadirPct}%</p>
                  <p className="text-muted-foreground text-[0.65rem] font-medium lg:text-xs">Kehadiran</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-sky-200/70 dark:bg-sky-500/20 lg:mt-2 lg:h-1.5">
                    <div className="h-full rounded-full bg-sky-500" style={{ width: `${hadirPct}%` }} />
                  </div>
                </div>
              </div>

              {/* Ubin modul — selalu 7 tampil termasuk yang 0 */}
              <div className="mt-3 grid grid-cols-4 gap-1 px-4 lg:mt-4 lg:grid-cols-7 lg:gap-2 lg:px-6">
                {MODULE_ORDER.map((key) => (
                  <ModuleTile key={key} moduleKey={key} stat={c.moduleStats?.[key] ?? EMPTY_MODULE_STAT} />
                ))}
              </div>

              {/* Lencana pencapaian */}
              {lencana.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 px-4 lg:mt-4 lg:gap-2 lg:px-6">
                  {lencana.map((b) => (
                    <span
                      key={b.label}
                      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold lg:gap-1.5 lg:px-3 lg:py-1 lg:text-xs", b.tone)}
                    >
                      <span aria-hidden>{b.emoji}</span>
                      {b.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Catatan apresiasi guru */}
              {c.catatanApresiasi && (
                <p className="mx-4 mt-3 line-clamp-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900 dark:bg-yellow-500/10 dark:text-yellow-200 lg:mx-6 lg:mt-4 lg:px-4 lg:py-2.5 lg:text-sm">
                  “{c.catatanApresiasi}”
                </p>
              )}

              <div className="mt-3 flex items-center justify-between gap-2 border-t px-4 py-2.5 lg:mt-4 lg:px-6 lg:py-3.5">
                <span className="text-muted-foreground text-[0.7rem] lg:text-sm">
                  {c.lastAssessedAt ? `Terakhir dinilai ${tanggalId(c.lastAssessedAt)}` : "Belum ada penilaian"}
                </span>
                {c.studentId !== "placeholder" && (
                  <Link
                    href={`/santri/pantauan?student=${c.studentId}`}
                    className="text-role-strong inline-flex items-center gap-0.5 text-xs font-semibold hover:underline lg:text-sm"
                  >
                    Pantauan lengkap
                    <ArrowUpRight className="size-3 lg:size-4" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
