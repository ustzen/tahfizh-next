import type { Metadata } from "next";
import { CalendarCheck, CalendarX2 } from "lucide-react";

import { CardBox, PageHeader, SectionTitle } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getPresensiRekap } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import { ATTENDANCE_TONES, bulanId, persen, tanggalId } from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Presensi" };

const KOLOM = ["hadir", "izin", "sakit", "alpa"] as const;

export default async function SantriPresensiPage() {
  await requireRole(["WALI_SANTRI"], "/santri/presensi");
  const rekap = await getPresensiRekap(6);

  return (
    <div>
      <PageHeader
        title="Presensi"
        description="Rekap kehadiran ananda 6 bulan terakhir — diisi guru saat halaqah berlangsung."
        icon={<CalendarCheck className="size-6" />}
      />

      {rekap.length === 0 || rekap.every((r) => r.summary.total === 0) ? (
        <CardBox>
          <SectionTitle
            tone="orange"
            icon={<CalendarX2 />}
            title="Belum ada presensi tercatat"
            description="Rekap akan muncul setelah guru mengisi presensi halaqah ananda."
          />
        </CardBox>
      ) : (
        <div className="space-y-5">
          {rekap.map((r) => {
            const pct = persen(r.summary.hadir, r.summary.total);
            return (
              <CardBox key={r.studentId}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-role-strong text-lg font-bold tracking-tight">{r.studentName}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {r.summary.total} pertemuan tercatat
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shadow-card inline-flex items-center rounded-xl px-3 py-1.5 text-sm font-bold text-white",
                      pct >= 90 ? "bg-emerald-600" : pct >= 75 ? "bg-amber-500" : "bg-rose-600"
                    )}
                  >
                    Kehadiran {pct}%
                  </span>
                </div>

                {/* Ringkasan total */}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {KOLOM.map((k) => (
                    <div key={k} className={cn("rounded-xl px-3 py-2.5", ATTENDANCE_TONES[k.toUpperCase()])}>
                      <p className="text-[0.7rem] font-bold uppercase tracking-wider">{k}</p>
                      <p className="tabular mt-0.5 text-xl font-bold">{r.summary[k]}</p>
                    </div>
                  ))}
                </div>

                {/* Per bulan */}
                {r.months.length > 0 && (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[26rem] text-sm">
                      <thead>
                        <tr className="text-muted-foreground text-left text-[0.7rem] uppercase tracking-wider">
                          <th className="py-1.5 font-bold">Bulan</th>
                          {KOLOM.map((k) => (
                            <th key={k} className="py-1.5 text-center font-bold">{k}</th>
                          ))}
                          <th className="py-1.5 text-right font-bold">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {r.months.map((m) => (
                          <tr key={m.ym}>
                            <td className="py-2 font-medium">{bulanId(m.ym)}</td>
                            {KOLOM.map((k) => (
                              <td key={k} className="tabular py-2 text-center">{m[k]}</td>
                            ))}
                            <td className="tabular py-2 text-right font-semibold">
                              {persen(m.hadir, m.total)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Catatan terakhir */}
                {r.recent.length > 0 && (
                  <div className="mt-5">
                    <p className="text-muted-foreground mb-2 text-[0.7rem] font-bold uppercase tracking-widest">
                      10 pertemuan terakhir
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {r.recent.map((x, i) => (
                        <li
                          key={`${x.date}-${i}`}
                          className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", ATTENDANCE_TONES[x.status])}
                          title={x.note ?? undefined}
                        >
                          {tanggalId(x.date)} · {x.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBox>
            );
          })}
        </div>
      )}
    </div>
  );
}
