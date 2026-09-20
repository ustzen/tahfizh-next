import { ClipboardList } from "lucide-react";

import { CardBox } from "@/components/dashboard/section";

/**
 * TAHFIZH V12.11 — Blok "Setoran Terakhir" di dasbor santri.
 *
 * SINKRON dengan menu Setoran guru: setoran Tahfidz masuk lewat
 * `tahfidz_submissions`, setoran Hadits/Doa lewat `learning_assessments`
 * (tabel yang sama ditulis guru). RPC `setoran_wali_summary` (SECURITY
 * DEFINER) hanya mengembalikan setoran anak yang terhubung akun ini —
 * jika guru menyetorkan siswa X, setoran itu muncul di dasbor siswa X.
 */

export type SetoranTerakhirRow = {
  studentId: string;
  studentName: string;
  module: "TAHFIDZ" | "HADITS" | "DOA" | string;
  title: string;
  detail: string | null;
  status: string;
  scoreLabel: string | null;
  scoreValue: number | null;
  freeNote: string | null;
  teacherName: string | null;
  assessedDate: string;
};

const MODULE_BADGE: Record<string, { label: string; style: string }> = {
  TAHFIDZ: { label: "Tahfidz", style: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  HADITS: { label: "Hadits", style: "border-violet-200 bg-violet-50 text-violet-700" },
  DOA: { label: "Doa Harian", style: "border-sky-200 bg-sky-50 text-sky-700" },
};

const STATUS_LABEL: Record<string, string> = {
  LULUS: "Lulus",
  PERLU_MENGULANG: "Perlu Mengulang",
  DITUNDA: "Ditunda",
  BELUM_SELESAI: "Belum Selesai",
};

const STATUS_STYLE: Record<string, string> = {
  LULUS: "text-emerald-600",
  MENGUASAI: "text-emerald-600",
  PERLU_MENGULANG: "text-amber-600",
  PERLU_LATIHAN: "text-amber-600",
  DITUNDA: "text-slate-500",
  BELUM_SELESAI: "text-slate-500",
  BELUM_MENGUASAI: "text-slate-500",
};

export function SetoranTerakhirCard({ rows }: { rows: SetoranTerakhirRow[] }) {
  // Kelompokkan per anak agar urut: siswa X melihat setoran siswa X.
  const byChild = new Map<string, { name: string; items: SetoranTerakhirRow[] }>();
  for (const r of rows) {
    const entry = byChild.get(r.studentId) ?? { name: r.studentName, items: [] };
    entry.items.push(r);
    byChild.set(r.studentId, entry);
  }

  return (
    <CardBox className="mt-6">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-role-soft text-role-strong">
          <ClipboardList className="size-5" />
        </span>
        <div>
          <h3 className="font-semibold text-foreground">Setoran Terakhir</h3>
          <p className="text-muted-foreground text-xs">
            Catatan setoran ananda dari ustadz/ustadzah — Tahfidz, Hadits, dan Doa Harian.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-4">
        {[...byChild.entries()].map(([studentId, child]) => (
          <div key={studentId}>
            <p className="mb-1.5 text-sm font-semibold text-foreground">{child.name}</p>
            <ul className="divide-y rounded-xl border border-slate-100 dark:border-slate-800">
              {child.items.map((r, i) => {
                const badge = MODULE_BADGE[r.module] ?? { label: r.module, style: "border-slate-200 bg-slate-50 text-slate-600" };
                const statusStyle = STATUS_STYLE[r.status] ?? "text-slate-500";
                return (
                  <li key={`${r.studentId}-${r.assessedDate}-${i}`} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${badge.style}`}>
                          {badge.label}
                        </span>
                        <p className="truncate text-sm font-medium text-foreground">
                          {r.title}
                          {r.detail ? <span className="text-muted-foreground font-normal"> · {r.detail}</span> : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.scoreLabel ? (
                          <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                            {r.scoreLabel}
                          </span>
                        ) : r.scoreValue !== null ? (
                          <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                            {r.scoreValue}
                          </span>
                        ) : null}
                        <span className={`text-xs font-semibold ${statusStyle}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                      <span>
                        {new Date(`${r.assessedDate}T00:00:00`).toLocaleDateString("id-ID", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                      {r.teacherName ? <span>· {r.teacherName}</span> : null}
                    </div>
                    {r.freeNote && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-yellow-500/10 dark:text-yellow-200">
                        “{r.freeNote}”
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </CardBox>
  );
}
