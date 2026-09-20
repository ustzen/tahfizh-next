import Link from "next/link";
import { Archive, CalendarRange, CheckCircle2, Users } from "lucide-react";

import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { getAcademicYears, getSemesters, getEnrollments } from "@/lib/akademik";
import { getTerminology } from "@/lib/terminology";
import { formatTanggal } from "@/components/akademik/year-manager";

export const metadata = { title: "Arsip Tahun Ajaran" };

/**
 * TAHFIZH V11 — Arsip Tahun Ajaran (#10/#59/#60/#65): browse past years
 * without ever mutating them. The year being viewed comes from ?year=<id>.
 */
export default async function AdminArsipPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const profile = await requireRole(["ADMIN"], "/admin/akademik/arsip");
  const sp = await searchParams;
  const [years, terms] = await Promise.all([getAcademicYears(), getTerminology(profile.tenantId)]);

  if (years.length === 0) {
    return (
      <div>
        <PageHeader title="Arsip Tahun Ajaran" />
        <p className="text-muted-foreground text-sm">
          Belum ada tahun ajaran. Buat terlebih dahulu pada menu Tahun Ajaran.
        </p>
      </div>
    );
  }

  const year =
    years.find((y) => y.id === sp.year) ?? years.find((y) => y.status === "ACTIVE") ?? years[0];
  const [semesters, enrollments] = await Promise.all([
    getSemesters(year.id),
    getEnrollments(year.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arsip Tahun Ajaran"
        description="Lihat data akademik tahun-tahun sebelumnya. Mode lihat-saja — mengaktifkan kembali tahun lama dilakukan dari menu Tahun Ajaran."
        icon={<Archive className="size-6" />}
      />

      {/* Year selector chips (#59) with active/archive indicator (#60) */}
      <div className="flex flex-wrap gap-2">
        {years.map((y) => {
          const selected = y.id === year.id;
          return (
            <Link
              key={y.id}
              href={`/admin/akademik/arsip?year=${y.id}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                selected
                  ? "border-role bg-role text-role-ink shadow-sm"
                  : "border-role/30 bg-card text-role-strong hover:bg-role-soft"
              }`}
            >
              {y.status === "ACTIVE" ? <CheckCircle2 className="size-4" /> : <Archive className="size-4" />} {y.name}
            </Link>
          );
        })}
      </div>

      <CardBox>
        <SectionTitle
          tone="violet"
          icon={<CalendarRange />}
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              Tahun Ajaran {year.name}
              <Badge variant={year.status === "ACTIVE" ? "success" : "neutral"}>
                {year.status === "ACTIVE" ? "Aktif" : "Arsip"}
              </Badge>
            </span>
          }
          description={`${formatTanggal(year.startDate)} — ${formatTanggal(year.endDate)}`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={`/api/akademik/export?year=${year.id}`}>Export CSV</Link>
            </Button>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {semesters.map((s) => (
            <div key={s.id} className="rounded-xl border border-role/15 bg-role-soft/40 px-4 py-3 text-sm">
              <p className="font-semibold text-foreground">
                Semester {s.sequence}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatTanggal(s.startDate)} — {formatTanggal(s.endDate)} · {s.status}
              </p>
            </div>
          ))}
        </div>
      </CardBox>

      <CardBox>
        <SectionTitle
          tone="emerald"
          icon={<Users />}
          title={`Enrolmen ${terms.santri} — ${year.name}`}
          description={`${enrollments.length} data enrolmen`}
        />
        {enrollments.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Belum ada data enrolmen untuk tahun ajaran ini.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Nama</TableHead>
                  <TableHead>Halaqah</TableHead>
                  <TableHead>Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="px-4 font-medium text-foreground">{e.studentName}</TableCell>
                    <TableCell>{e.halaqahName ?? "-"}</TableCell>
                    <TableCell>{e.level ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardBox>
    </div>
  );
}
