import type { Metadata } from "next";
import { BookOpen, CalendarCheck, CalendarX2, Sparkles } from "lucide-react";

import { MosqueScene } from "@/components/santri/mosque-scene";
import { PresensiRekapCard } from "@/components/santri/presensi-rekap-card";
import { requireRole } from "@/lib/auth";
import { getPresensiRekap } from "@/lib/santri-pantauan";

export const metadata: Metadata = { title: "Presensi" };

/**
 * Rekap Presensi (santri) — mengikuti mockup: banner hero, kartu ringkasan
 * per anak (4 status + tabel per bulan + detail kehadiran), dan banner
 * kutipan. Data dari penilaian presensi guru lewat RPC santri_presensi_rekap.
 */
export default async function SantriPresensiPage() {
  await requireRole(["WALI_SANTRI"], "/santri/presensi");
  const rekap = await getPresensiRekap(6);
  const hasData = rekap.length > 0 && rekap.some((r) => r.summary.total > 0);

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div className="shadow-card relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-100 via-sky-50 to-white">
        <MosqueScene className="pointer-events-none absolute inset-y-0 right-0 h-full w-48 sm:w-80" />
        <div className="relative flex max-w-[70%] items-start gap-4 p-5 sm:max-w-xl sm:p-6">
          <span className="shadow-card flex size-14 shrink-0 items-center justify-center rounded-2xl bg-sky-500 text-white">
            <CalendarCheck className="size-7" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-sky-900 sm:text-3xl">
              Rekap Presensi
            </h1>
            <p className="mt-1 text-sm font-medium text-sky-800/80">
              Lihat ringkasan kehadiran Anda selama satu periode. Semakin disiplin, semakin dekat
              dengan cita-cita.
            </p>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="shadow-card rounded-3xl border bg-white p-6 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <CalendarX2 className="size-6" />
          </span>
          <p className="font-bold text-slate-700">Belum ada presensi tercatat</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Rekap akan muncul di sini setelah guru mengisi presensi halaqah ananda.
          </p>
        </div>
      ) : (
        rekap.map((r) => <PresensiRekapCard key={r.studentId} rekap={r} />)
      )}

      {/* Banner kutipan */}
      <div className="relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 to-sky-100/70 px-5 py-4">
        <Sparkles className="absolute top-3 left-4 size-4 text-sky-300" />
        <Sparkles className="absolute right-4 bottom-3 size-4 text-sky-300" />
        <div className="flex items-center justify-center gap-3">
          <BookOpen className="hidden size-7 shrink-0 text-sky-400 sm:block" />
          <p className="text-center text-sm font-semibold text-sky-800 italic">
            <span className="mr-1 text-lg text-sky-400">&ldquo;</span>
            Disiplin hari ini, keberkahan esok hari.
            <span className="ml-1 text-lg text-sky-400">&rdquo;</span>
          </p>
        </div>
      </div>
    </div>
  );
}
