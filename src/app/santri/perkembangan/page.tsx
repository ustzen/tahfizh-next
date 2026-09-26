import type { Metadata } from "next";
import Link from "next/link";
import { History, BookOpenCheck, ClipboardCheck, AudioLines, BookOpenText, HandHeart, SpellCheck, ListChecks, ArrowUpRight, Sparkles } from "lucide-react";

import { CardBox, PageHeader, SectionTitle } from "@/components/dashboard/section";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireRole } from "@/lib/auth";
import { getPrestasiCards } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import {
  MODULE_ORDER,
  moduleLabel,
  predikat,
  tanggalId,
  type ModuleKey,
} from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Riwayat Perkembangan" };

const MODULE_ICONS: Record<ModuleKey, React.ComponentType<{ className?: string }>> = {
  TAHFIDZ: BookOpenCheck,
  SETORAN: ClipboardCheck,
  TARTIL: AudioLines,
  HADITS: BookOpenText,
  DOA: HandHeart,
  TAJWID: SpellCheck,
  TUGAS: ListChecks,
};

/**
 * Riwayat Perkembangan (versi baru) — rekap ringkas per anak:
 * apa yang sudah dikerjakan di tiap modul (jumlah penilaian + materi
 * terakhir), predikat rata-rata, dan lompatan ke linimasa penuh di menu
 * Pantauan. Data satu sumber: RPC `santri_prestasi_card` (V18).
 */
export default async function SantriPerkembanganPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireRole(["WALI_SANTRI"], "/santri/perkembangan");
  const cards = await getPrestasiCards();

  if (cards.length === 0) {
    return (
      <div>
        <PageHeader
          title="Riwayat Perkembangan"
          description="Perjalanan belajar ananda dari waktu ke waktu."
          icon={<History className="size-6" />}
        />
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><History /></EmptyMedia>
            <EmptyTitle>Belum ada data perkembangan.</EmptyTitle>
            <EmptyDescription>
              Data akan muncul setelah guru mulai menilai aktivitas belajar ananda.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const selected = cards.find((c) => c.studentId === sp.student) ?? cards[0];
  const hasMultiple = cards.length > 1;

  return (
    <div>
      <PageHeader
        title="Riwayat Perkembangan"
        description="Rekap perjalanan belajar ananda di setiap modul — apa saja yang sudah dikerjakan dan materi terakhirnya."
        icon={<History className="size-6" />}
        action={
          <Link
            href={`/santri/pantauan?student=${selected.studentId}`}
            className="bg-role text-role-ink shadow-card inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
          >
            <Sparkles className="size-4" />
            Linimasa Penuh
          </Link>
        }
      />

      {/* Pemilih anak */}
      {hasMultiple && (
        <div className="mb-5 flex flex-wrap gap-2">
          {cards.map((c) => (
            <Link
              key={c.studentId}
              href={`/santri/perkembangan?student=${c.studentId}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                c.studentId === selected.studentId
                  ? "bg-role text-role-ink border-transparent"
                  : "hover:bg-slate-100 dark:hover:bg-slate-500/10"
              )}
            >
              {c.studentName}
            </Link>
          ))}
        </div>
      )}

      <CardBox>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-role-strong text-lg font-bold tracking-tight">{selected.studentName}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {selected.halaqahName ?? "Belum tergabung halaqah"}
              {selected.businessCode ? ` · ${selected.businessCode}` : ""}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
              predikat(selected.avgScore).tone
            )}
          >
            {predikat(selected.avgScore).label}
          </span>
        </div>

        <ul className="mt-4 divide-y">
          {MODULE_ORDER.map((key) => {
            const stat = selected.moduleStats?.[key];
            const count = stat?.count ?? 0;
            const Icon = MODULE_ICONS[key];
            return (
              <li key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{moduleLabel(key)}</p>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {count > 0
                      ? `${count} penilaian · terakhir: ${stat?.lastTitle ?? "-"} (${tanggalId(stat?.lastDate ?? null)})`
                      : "Belum ada penilaian"}
                  </p>
                </div>
                <span
                  className={cn(
                    "tabular shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold",
                    count > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400"
                  )}
                >
                  {count}
                </span>
              </li>
            );
          })}
        </ul>

        {selected.catatanApresiasi && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 dark:bg-yellow-500/10 dark:text-yellow-200">
            “{selected.catatanApresiasi}”
          </p>
        )}
      </CardBox>

      <SectionTitle
        className="mt-6 mb-3"
        title="Lanjutkan menjelajah"
        description="Perdalam data ananda lewat menu lain."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: `/santri/prestasi`, label: "Kartu Prestasi", desc: "Raport mini: nilai rata-rata & lencana", icon: Sparkles },
          { href: `/santri/target`, label: "Target", desc: "Target hafalan & progres capaian", icon: ListChecks },
        ].map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="bg-card shadow-card hover:border-role/40 group flex items-center gap-3 rounded-2xl border p-4 transition-colors"
          >
            <span className="bg-role-soft text-role-strong flex size-9 shrink-0 items-center justify-center rounded-xl">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="text-muted-foreground block truncate text-xs">{desc}</span>
            </span>
            <ArrowUpRight className="text-muted-foreground group-hover:text-role-strong size-4" />
          </Link>
        ))}
      </div>
    </div>
  );
}
