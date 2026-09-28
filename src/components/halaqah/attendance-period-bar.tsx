"use client";

import { useRouter } from "next/navigation";
import { CalendarRange, CalendarCheck } from "lucide-react";

import { CardBox, SectionTitle } from "@/components/dashboard/section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * TAHFIZH V48 — Bar pilihan periode untuk rangkuman & riwayat presensi:
 * Bulan (default: bulan berjalan, bisa dipilih), Semester 1/2, Tahun Ajaran,
 * dan Semua. Rentang tanggal dihitung dari tahun ajaran aktif agar semester
 * mengikuti kalender akademik lembaga.
 */

export type PresensiPeriode = "bulan" | "smt1" | "smt2" | "tahun" | "semua";

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function AttendancePeriodBar({
  basePath,
  halaqahId,
  periode,
  bulan,
  activeYear,
}: {
  basePath: string;
  halaqahId: string;
  periode: PresensiPeriode;
  /** 1-12 untuk pilihan bulan saat periode = bulan. */
  bulan: number;
  activeYear: { id: string; name: string; startDate: string; endDate: string; status: string } | null;
}) {
  const router = useRouter();

  function navigate(next: Record<string, string>) {
    const q = new URLSearchParams();
    if (halaqahId) q.set("halaqah", halaqahId);
    for (const [k, v] of Object.entries({ periode, bulan: String(bulan), ...next })) {
      if (v && v !== "semua-hide") q.set(k, v);
    }
    router.push(`${basePath}?${q.toString()}`);
  }

  return (
    <CardBox>
      <SectionTitle
        tone="sky"
        icon={<CalendarRange />}
        title="Periode Rangkuman"
        description="Sortir rangkuman & riwayat: bulan, semester, tahun ajaran, atau semua."
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={periode} onValueChange={(v) => navigate({ periode: v })}>
          <SelectTrigger aria-label="Pilih periode" className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bulan">Bulan</SelectItem>
            <SelectItem value="smt1">Semester 1</SelectItem>
            <SelectItem value="smt2">Semester 2</SelectItem>
            <SelectItem value="tahun">Tahun Ajaran</SelectItem>
            <SelectItem value="semua">Semua Waktu</SelectItem>
          </SelectContent>
          <span className="text-muted-foreground hidden items-center gap-1 pl-1 text-xs sm:flex">
            <CalendarCheck className="size-3.5" />
          </span>
        </Select>

        {periode === "bulan" && (
          <Select value={String(bulan)} onValueChange={(v) => navigate({ bulan: v })}>
            <SelectTrigger aria-label="Pilih bulan" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS_ID.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <p className="text-muted-foreground text-xs">
          {periode === "semua"
            ? "Menampilkan seluruh riwayat."
            : activeYear
              ? `Berdasar tahun ajaran aktif ${activeYear.name}.`
              : "Tahun ajaran aktif belum diatur — periode memakai tahun berjalan."}
        </p>
      </div>
    </CardBox>
  );
}
