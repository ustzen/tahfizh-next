import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Activity, Inbox, MessagesSquare, CalendarCheck, Target as TargetIcon, Award } from "lucide-react";

import { CardBox, PageHeader, SectionTitle } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getPantauanFeed, getPrestasiCards } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import {
  moduleLabel,
  moduleTone,
  tanggalId,
  persen,
  type PantauanItem,
} from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Pantauan" };

/**
 * Pantauan (versi baru) — pusat aktivitas ananda:
 *   1. Ringkasan cepat per anak (nilai terakhir, kehadiran, penilaian bulan ini).
 *   2. Linimasa penilaian terbaru dari guru (semua modul, terbaru di atas).
 * Semua data berasal dari RPC V18 — tidak ada perhitungan baru di klien.
 */
export default async function SantriPantauanPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  await requireRole(["WALI_SANTRI"], "/santri/pantauan");
  const sp = await searchParams;
  const selected = sp.student ?? null;

  const [cards, feed] = await Promise.all([
    getPrestasiCards(),
    getPantauanFeed(selected, 40),
  ]);

  const byStudent = new Map<string, PantauanItem[]>();
  for (const it of feed) {
    const list = byStudent.get(it.studentId) ?? [];
    list.push(it);
    byStudent.set(it.studentId, list);
  }

  const ringkas = cards
    .filter((c) => c.studentId !== "placeholder")
    .map((c) => {
      const items = byStudent.get(c.studentId) ?? [];
      const last = items[0] ?? null;
      const monthPrefix = new Date().toISOString().slice(0, 7);
      const bulanIni = items.filter(
        (it) => (it.assessedDate ?? "").startsWith(monthPrefix)
      ).length;
      return { card: c, last, bulanIni, hadirPct: persen(c.presensi.hadir, c.presensi.total) };
    });

  const anakAktif = cards.filter((c) => c.studentId !== "placeholder");

  return (
    <div>
      <PageHeader
        title="Pantauan"
        description="Aktivitas belajar ananda — penilaian terbaru guru, kehadiran, dan kemajuan tiap modul."
        icon={<Activity className="size-6" />}
      />

      {/* Filter anak */}
      {anakAktif.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Link
            href="/santri/pantauan"
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              !selected
                ? "bg-role text-role-ink border-transparent"
                : "hover:bg-slate-100 dark:hover:bg-slate-500/10"
            )}
          >
            Semua anak
          </Link>
          {anakAktif.map((c) => (
            <Link
              key={c.studentId}
              href={`/santri/pantauan?student=${c.studentId}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                selected === c.studentId
                  ? "bg-role text-role-ink border-transparent"
                  : "hover:bg-slate-100 dark:hover:bg-slate-500/10"
              )}
            >
              {c.studentName}
            </Link>
          ))}
        </div>
      )}

      {/* Ringkasan per anak */}
      {ringkas.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ringkas.map(({ card: c, last, bulanIni, hadirPct }) => (
            <CardBox key={c.studentId} className="relative overflow-hidden">
              <span aria-hidden className="bg-role absolute inset-x-0 top-0 h-1" />
              <div className="flex items-center gap-3">
                <span className="bg-role-soft text-role-strong flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  {c.studentName.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{c.studentName}</p>
                  <p className="text-muted-foreground truncate text-xs">{c.halaqahName ?? "Belum tergabung halaqah"}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-500/10">
                  <dt className="text-muted-foreground text-[0.62rem] font-semibold uppercase tracking-wide">Nilai akhir</dt>
                  <dd className="tabular mt-0.5 text-sm font-bold text-foreground">
                    {last ? last.scoreLabel ?? last.scoreValue ?? "–" : "–"}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-500/10">
                  <dt className="text-muted-foreground text-[0.62rem] font-semibold uppercase tracking-wide">Hadir</dt>
                  <dd className="tabular mt-0.5 text-sm font-bold text-foreground">{hadirPct}%</dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-500/10">
                  <dt className="text-muted-foreground text-[0.62rem] font-semibold uppercase tracking-wide">Bulan ini</dt>
                  <dd className="tabular mt-0.5 text-sm font-bold text-foreground">{bulanIni} penilaian</dd>
                </div>
              </dl>
              {last && (
                <p className="text-muted-foreground mt-3 truncate text-xs">
                  Terakhir: <span className="font-medium text-foreground">{last.title}</span> · {moduleLabel(last.module)}
                </p>
              )}
            </CardBox>
          ))}
        </div>
      )}

      {/* Linimasa penilaian */}
      {feed.length === 0 ? (
        <CardBox>
          <SectionTitle
            tone="sky"
            icon={<Inbox />}
            title="Belum ada penilaian"
            description="Setiap penilaian yang dicatat guru akan langsung muncul di sini tanpa perlu sinkronisasi manual."
          />
        </CardBox>
      ) : (
        <div className="space-y-5">
          {feed.map((it, idx) => (
            <CardBox key={`${it.studentId}-${it.module}-${it.title}-${idx}`} className="py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-lg px-2 py-0.5 text-[0.7rem] font-bold", moduleTone(it.module))}>
                  {moduleLabel(it.module)}
                </span>
                {!selected && (
                  <span className="text-muted-foreground text-xs font-medium">{it.studentName}</span>
                )}
                <span className="text-muted-foreground ml-auto text-xs">{tanggalId(it.assessedDate)}</span>
                {(it.scoreLabel || it.scoreValue !== null) && (
                  <span className="shadow-card tabular inline-flex items-center rounded-lg bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">
                    {it.scoreLabel ?? it.scoreValue}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm font-semibold text-foreground">{it.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {[it.detail, it.teacherName ? `Dinilai oleh ${it.teacherName}` : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              {it.freeNote && (
                <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-yellow-500/10 dark:text-yellow-200">
                  “{it.freeNote}”
                </p>
              )}
              {it.status && (
                <Badge className="mt-2" variant={/LULUS|MENGUASAI|DINILAI/.test(it.status) ? "success" : "warning"}>
                  {it.status.replaceAll("_", " ")}
                </Badge>
              )}
            </CardBox>
          ))}
        </div>
      )}

      {/* Penunjuk arah ke modul lain */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { href: "/santri/target", label: "Lihat Target", desc: "Target hafalan & capaian", icon: TargetIcon },
          { href: "/santri/presensi", label: "Lihat Presensi", desc: "Rekap kehadiran 6 bulan", icon: CalendarCheck },
          { href: "/santri/prestasi", label: "Kartu Prestasi", desc: "Rangkuman capaian ananda", icon: Award },
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

      <p className="text-muted-foreground mt-5 flex items-center gap-2 px-1 text-xs">
        <MessagesSquare className="size-3.5" />
        Ada pertanyaan soal penilaian? Gunakan menu Obrolan untuk menghubungi guru ananda.
      </p>
    </div>
  );
}
