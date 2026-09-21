import type { Metadata } from "next";
import Link from "next/link";
import { Award, BookOpenCheck, CalendarCheck, Sparkles } from "lucide-react";

import { CardBox, PageHeader, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getPrestasiCards } from "@/lib/santri-pantauan";
import {
  badgesFor,
  moduleLabel,
  moduleTone,
  persen,
  predikat,
  tanggalId,
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
  await requireRole(["WALI_SANTRI"], "/santri/prestasi");
  const cards = await getPrestasiCards();

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

      {cards.length === 0 ? (
        <CardBox>
          <SectionTitle
            tone="amber"
            icon={<Sparkles />}
            title="Belum ada data prestasi"
            description="Kartu prestasi akan terisi otomatis begitu guru mencatat penilaian pertama untuk ananda."
          />
        </CardBox>
      ) : (
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

                {/* Rekap penilaian per modul */}
                <div className="mt-4">
                  <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-widest">
                    <BookOpenCheck className="size-3.5" /> Penilaian per modul
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(c.modules)
                      .filter(([, n]) => n > 0)
                      .map(([key, n]) => (
                        <span
                          key={key}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${moduleTone(key)}`}
                        >
                          {moduleLabel(key)}
                          <span className="tabular font-bold">{n}</span>
                        </span>
                      ))}
                    {Object.values(c.modules).every((n) => n === 0) && (
                      <span className="text-muted-foreground text-xs italic">Belum ada penilaian tercatat.</span>
                    )}
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
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/santri/pantauan?student=${c.studentId}`}>Detail</Link>
                    </Button>
                  </div>
                </div>
              </CardBox>
            );
          })}
        </div>
      )}
    </div>
  );
}
