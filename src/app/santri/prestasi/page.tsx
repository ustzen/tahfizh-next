import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  BookOpenCheck,
  BookOpenText,
  CalendarCheck,
  HandHeart,
  SpellCheck,
  ListChecks,
  ArrowUpRight,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getPrestasiCards, getMeterTotals, getSantriTargetProgress } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import {
  EMPTY_MODULE_STAT,
  badgesFor,
  meterDoneLabel,
  moduleLabel,
  persen,
  predikat,
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
};

/**
 * V40 — ubin modul Kartu Prestasi: SETORAN & TARTIL dihapus, sisanya
 * diperbesar supaya lebih mudah dibaca anak.
 */
const TILE_ORDER: ModuleKey[] = ["TAHFIDZ", "HADITS", "DOA", "TAJWID", "TUGAS"];

/** Warna ikon+angka per modul + kehadiran. */
const MODULE_ACCENT: Record<string, string> = {
  TAHFIDZ: "text-emerald-600 dark:text-emerald-400",
  SETORAN: "text-blue-600 dark:text-blue-400",
  TARTIL: "text-sky-600 dark:text-sky-400",
  HADITS: "text-violet-600 dark:text-violet-400",
  DOA: "text-amber-600 dark:text-amber-400",
  TAJWID: "text-rose-600 dark:text-rose-400",
  TUGAS: "text-orange-600 dark:text-orange-400",
  KEHADIRAN: "text-sky-600 dark:text-sky-400",
};

/** V40 — aksen warna meter persentase, konsisten dengan warna modulnya. */
const TONE_METER: Record<string, { text: string; bar: string; track: string }> = {
  TAHFIDZ: {
    text: "text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-500",
    track: "bg-emerald-200/70 dark:bg-emerald-500/20",
  },
  SETORAN: {
    text: "text-blue-700 dark:text-blue-300",
    bar: "bg-blue-500",
    track: "bg-blue-200/70 dark:bg-blue-500/20",
  },
  TARTIL: {
    text: "text-sky-700 dark:text-sky-300",
    bar: "bg-sky-500",
    track: "bg-sky-200/70 dark:bg-sky-500/20",
  },
  HADITS: {
    text: "text-violet-700 dark:text-violet-300",
    bar: "bg-violet-500",
    track: "bg-violet-200/70 dark:bg-violet-500/20",
  },
  DOA: {
    text: "text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
    track: "bg-amber-200/70 dark:bg-amber-500/20",
  },
  TAJWID: {
    text: "text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
    track: "bg-rose-200/70 dark:bg-rose-500/20",
  },
  TUGAS: {
    text: "text-orange-700 dark:text-orange-300",
    bar: "bg-orange-500",
    track: "bg-orange-200/70 dark:bg-orange-500/20",
  },
  UMUM: {
    text: "text-foreground",
    bar: "bg-foreground/70",
    track: "bg-muted",
  },
};

/** Satuan per tipe meter. */
const METER_UNITS: Record<string, string> = {
  TAHFIDZ: "surat",
  HADITS: "hadits",
  DOA: "doa",
  TAJWID: "materi",
  TUGAS: "tugas",
  CUSTOM: "item",
};

/**
 * V40 — bangun meter persentase untuk satu anak.
 *
 * Aturan per modul:
 *   • TAHFIDZ : surat dikuasai / target guru (fallback: semua surat aktif).
 *   • TUGAS   : tugas dikerjakan / tugas diberikan (5/10 → 50%).
 *   • HADITS, DOA, TAJWID: materi lulus / target guru; tanpa target guru →
 *     / jumlah materi aktif modul itu di lembaga (RPC santri_meter_totals).
 * SETORAN & TARTIL sengaja tidak punya meter.
 */
function buildMeters(
  c: PrestasiCard,
  targets: TargetProgress[],
  totals: MeterTotals | undefined,
): PersenMeter[] {
  const milik = targets.filter((t) => t.studentId === c.studentId && t.targetValue > 0);
  const meters: PersenMeter[] = [];

  // TAHFIDZ: surat dikuasai vs target hafalan guru.
  // Contoh: target 10 surat, sudah 9 → 90%. Tanpa target → vs semua surat aktif.
  const tTahfidz = milik.find((t) => t.category === "TAHFIDZ");
  const targetTahfidz = tTahfidz ? tTahfidz.targetValue : c.surahTotal || 0;
  if (targetTahfidz > 0) {
    meters.push({
      key: "TAHFIDZ",
      label: "Target Hafalan",
      done: Math.min(tTahfidz ? tTahfidz.capaian : c.surahSelesai, targetTahfidz),
      total: targetTahfidz,
      unit: METER_UNITS.TAHFIDZ,
      hint: tTahfidz ? `Target ustadz · ${targetScopeLabel(tTahfidz.scope)}` : "Semua surat aktif di tenant",
    });
  }

  // TUGAS: jumlah tugas yang sudah dikerjakan/dinilai vs total tugas diberikan.
  // Contoh: 10 tugas diberikan, 5 dikerjakan → 50%.
  const tugasStat = c.moduleStats?.TUGAS;
  const tugasDiberikan = (totals?.tugasTotal || 0) || tugasStat?.count || 0;
  if (tugasDiberikan > 0) {
    meters.push({
      key: "TUGAS",
      label: "Pengerjaan Tugas",
      done: Math.min(tugasStat?.count ?? 0, tugasDiberikan),
      total: tugasDiberikan,
      unit: METER_UNITS.TUGAS,
      hint: "Tugas halaqah yang sudah dikerjakan",
    });
  }

  // HADITS / DOA / TAJWID: materi lulus / target guru; tanpa target guru →
  // / jumlah materi aktif modul itu di lembaga. SELALU tampil.
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
      unit: METER_UNITS[modul.key],
      hint: t ? `Target ustadz · ${targetScopeLabel(t.scope)}` : "Materi aktif di lembaga",
    });
  }

  // Target bebas (CUSTOM) dari guru — tampil bila ada.
  const tCustom = milik.find((x) => x.category === "CUSTOM");
  if (tCustom && tCustom.targetValue > 0) {
    meters.push({
      key: "CUSTOM",
      label: "Target Lain",
      done: Math.min(tCustom.capaian, tCustom.targetValue),
      total: tCustom.targetValue,
      unit: METER_UNITS.CUSTOM,
      hint: `Target ustadz · ${targetScopeLabel(tCustom.scope)}`,
    });
  }

  return meters;
}

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

/**
 * Ubin ringkas: ikon + angka besar + label. Dipakai modul & kehadiran.
 */
function Tile({
  icon: Icon,
  label,
  count,
  accent,
  title,
  kosong,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  accent: string;
  title: string;
  kosong: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl px-2 py-3.5 text-center lg:gap-2 lg:px-3 lg:py-5",
        kosong ? "bg-slate-50 dark:bg-slate-500/5" : "bg-slate-50 dark:bg-slate-500/10"
      )}
      title={title}
    >
      <Icon className={cn("size-6 lg:size-8", kosong ? "text-slate-400 dark:text-slate-500" : accent)} />
      <span className={cn("tabular text-xl leading-none font-bold lg:text-3xl", kosong && "text-muted-foreground")}>
        {count}
      </span>
      <span className="text-muted-foreground truncate text-[0.7rem] leading-tight font-medium lg:text-sm">
        {label}
      </span>
    </div>
  );
}

/**
 * V40 — bar persentase capaian: persen kanan, angka kiri (done/total + satuan),
 * bar warna modul di bawahnya. Sembunyikan bila total target = 0.
 */
function MeterBar({ m }: { m: PersenMeter }) {
  if (m.total <= 0) return null;
  const pct = persen(m.done, m.total);
  const tone = TONE_METER[m.key] ?? TONE_METER.UMUM;
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-500/10 lg:px-4 lg:py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground truncate text-[0.68rem] font-medium lg:text-xs">{m.label}</p>
        <p className={cn("tabular text-sm font-bold lg:text-base", tone.text)}>{pct}%</p>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="tabular text-muted-foreground text-[0.62rem] lg:text-[0.7rem]">{meterDoneLabel(m)}</p>
        <p className="text-muted-foreground/70 hidden truncate text-[0.62rem] sm:block lg:text-[0.7rem]">{m.hint}</p>
      </div>
      <div className={cn("mt-1 h-1.5 overflow-hidden rounded-full lg:mt-1.5 lg:h-2", tone.track)}>
        <div className={cn("h-full rounded-full transition-all", tone.bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * Kartu Prestasi (versi baru) — seperti raport mini: identitas anak, cincin
 * rata-rata nilai, ubin modul + kehadiran, meter persentase, lencana, dan
 * catatan apresiasi guru. Kartu selalu dirender meski belum ada penilaian
 * (angka 0) supaya anak tahu apa yang akan terisi nanti.
 */
export default async function SantriPrestasiPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri/prestasi");
  const [data, targets, meterTotals] = await Promise.all([
    getPrestasiCards(),
    getSantriTargetProgress(),
    getMeterTotals(),
  ]);

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
          const meters = buildMeters(c, targets, meterTotals.get(c.studentId));
          const initial = c.studentName.trim().charAt(0).toUpperCase() || "?";
          const subtitle = `${(c.halaqahName ?? "Belum tergabung halaqah").toUpperCase()}${c.businessCode ? ` - ${c.businessCode}` : ""}`;

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
                  <p className="text-muted-foreground truncate text-xs lg:text-sm">{subtitle}</p>
                </div>
                <ScoreRing score={c.avgScore} />
              </div>

              <div className="px-4 pt-2 lg:px-6 lg:pt-3">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-bold lg:px-3 lg:py-1 lg:text-sm", p.tone)}>
                  {p.label}
                </span>
              </div>

              {/* Ubin modul + kehadiran — 6 kartu (setoran & tartil dihapus) */}
              <div className="mt-3 grid grid-cols-3 gap-1.5 px-4 lg:mt-4 lg:grid-cols-6 lg:gap-2.5 lg:px-6">
                {TILE_ORDER.map((key) => {
                  const stat = c.moduleStats?.[key] ?? EMPTY_MODULE_STAT;
                  const kosong = stat.count === 0;
                  return (
                    <Tile
                      key={key}
                      icon={MODULE_ICONS[key]}
                      label={moduleLabel(key).split(" ")[0]}
                      count={stat.count}
                      accent={MODULE_ACCENT[key]}
                      kosong={kosong}
                      title={
                        kosong
                          ? `${moduleLabel(key)} · belum ada penilaian`
                          : `${moduleLabel(key)} · ${stat.lastTitle ?? ""} · ${tanggalId(stat.lastDate)}`
                      }
                    />
                  );
                })}
                <Tile
                  icon={CalendarCheck}
                  label="Kehadiran"
                  count={c.presensi.hadir}
                  accent={MODULE_ACCENT.KEHADIRAN}
                  kosong={c.presensi.total === 0}
                  title={
                    c.presensi.total === 0
                      ? "Kehadiran · belum ada data presensi"
                      : `Kehadiran · ${c.presensi.hadir} hadir, ${c.presensi.izin} izin, ${c.presensi.sakit} sakit, ${c.presensi.alpa} alpa`
                  }
                />
              </div>

              {/* V40 — persentase capaian: hafalan & tugas (+ target modul lain) */}
              {meters.length > 0 && (
                <div className="mt-3 grid gap-1.5 px-4 lg:mt-4 lg:grid-cols-2 lg:gap-2 lg:px-6">
                  {meters.map((m) => (
                    <MeterBar key={`${m.key}-${m.label}`} m={m} />
                  ))}
                </div>
              )}

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
