import type { Metadata } from "next";
import Link from "next/link";
import { Award, BookOpenCheck, CalendarCheck } from "lucide-react";

import { CardBox, PageHeader } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getPrestasiCards } from "@/lib/santri-pantauan";
import {
  EMPTY_MODULE_STAT,
  MODULE_ORDER,
  badgesFor,
  moduleLabel,
  moduleTone,
  persen,
  predikat,
  tanggalId,
  type ModuleStat,
  type PrestasiCard,
} from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Kartu Prestasi" };

function Meter({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = persen(value, total);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
        <span className="tabular text-sm font-semibold">
          {value}
          <span className="text-muted-foreground font-normal">/{total || 0}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-500/20">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function SantriPrestasiPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri/prestasi");
  const data = await getPrestasiCards();

  // Kartu prestasi SELALU tampil. Bila guru belum menilai sama sekali (atau
  // biodata santri belum dilengkapi lembaga), bentuk kartunya tetap dirender
  // dengan angka 0 supaya santri tahu apa saja yang akan terisi nanti.
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
        description="Rangkuman capaian ananda — seluruh angkanya diambil langsung dari penilaian ustadz/ustadzah."
        icon={<Award className="size-6" />}
        action={
          <Button asChild variant="outline">
            <Link href="/santri/pantauan">Lihat Detail Penilaian</Link>
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
          {cards.map((c) => {
            const p = predikat(c.avgScore);
            const lencana = badgesFor(c);
            const hadirPct = persen(c.presensi.hadir, c.presensi.total);
            return (
              <CardBox key={c.studentId} className="overflow-hidden">
                {/* Identitas */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-role-strong text-lg font-bold tracking-tight">{c.studentName}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {c.halaqahName ?? "Belum tergabung halaqah"}
                      {c.businessCode ? ` · ${c.businessCode}` : ""}
                    </p>
                  </div>
                  <span className={`shadow-card inline-flex items-center rounded-xl px-3 py-1.5 text-sm font-bold ${p.tone}`}>
                    {c.avgScore !== null ? `${c.avgScore} · ` : ""}
                    {p.label}
                  </span>
                </div>

                {/* Meter utama */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Meter
                    label="Surat dikuasai"
                    value={c.surahSelesai}
                    total={c.surahTotal}
                    tone="bg-emerald-500"
                  />
                  <Meter
                    label={`Kehadiran (${hadirPct}%)`}
                    value={c.presensi.hadir}
                    total={c.presensi.total}
                    tone="bg-sky-500"
                  />
                </div>

                {/* Lencana */}
                {lencana.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {lencana.map((b) => (
                      <span
                        key={b.label}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${b.tone}`}
                      >
                        <span aria-hidden>{b.emoji}</span>
                        {b.label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Kartu pencapaian per modul — selalu tampil lengkap,
                    modul yang belum dinilai ditampilkan dengan angka 0. */}
                <div className="mt-5">
                  <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-widest">
                    <BookOpenCheck className="size-3.5" /> Pencapaian per modul
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {MODULE_ORDER.map((key) => {
                      const st: ModuleStat = c.moduleStats?.[key] ?? EMPTY_MODULE_STAT;
                      const kosong = st.count === 0;
                      return (
                        <div
                          key={key}
                          className={`rounded-xl border px-3.5 py-3 ${kosong ? "opacity-70" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`rounded-lg px-2 py-0.5 text-[0.7rem] font-bold ${moduleTone(key)}`}>
                              {moduleLabel(key)}
                            </span>
                            <span className="tabular text-lg font-bold leading-none">
                              {st.avgScore ?? "—"}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-2 text-xs">
                            <span className="tabular text-foreground font-semibold">{st.count}</span> penilaian
                            {key === "TAHFIDZ" ? (
                              <>
                                {" · "}
                                <span className="tabular text-foreground font-semibold">
                                  {c.surahSelesai}/{c.surahTotal || 0}
                                </span>{" "}
                                surat
                              </>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground mt-0.5 truncate text-xs">
                            {kosong
                              ? "Belum ada penilaian"
                              : `${st.lastTitle ?? "-"} · ${tanggalId(st.lastDate)}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Catatan apresiasi terakhir */}
                {c.catatanApresiasi && (
                  <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm leading-relaxed text-amber-900 dark:bg-yellow-500/10 dark:text-yellow-200">
                    “{c.catatanApresiasi}”
                  </p>
                )}

                {/* Footer */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <CalendarCheck className="size-3.5" />
                    Penilaian terakhir {tanggalId(c.lastAssessedAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{c.totalPenilaian} penilaian</Badge>
                    {c.studentId !== "placeholder" && (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/santri/pantauan?student=${c.studentId}`}>Detail</Link>
                      </Button>
                    )}
                  </div>
                </div>
              </CardBox>
            );
          })}
      </div>
    </div>
  );
}
