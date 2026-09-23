import { PageHeader, SectionTitle } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAcademicYears, getSemesters, getActiveYear } from "@/lib/akademik";
import { YearManager } from "@/components/akademik/year-manager";
import { SemesterPanel } from "@/components/akademik/semester-panel";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CalendarRange, Layers } from "lucide-react";

export const metadata = { title: "Tahun Ajaran" };

/**
 * TAHFIZH V11 — Tahun Ajaran (#4-#12). Satu lembaga hanya satu tahun ajaran
 * aktif; mengaktifkan tahun lain mengarsipkan sebelumnya (ditangani RPC).
 */
export default async function AdminAkademikPage() {
  await requireRole(["ADMIN"], "/admin/akademik");
  const [years, activeYear] = await Promise.all([getAcademicYears(), getActiveYear()]);
  const semesters = activeYear ? await getSemesters(activeYear.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tahun Ajaran"
        description="Kelola tahun ajaran, semester, dan arsip. Data tahun lama tidak pernah diubah ketika tahun baru dibuat."
        icon={<CalendarRange className="size-6" />}
      />

      {years.length === 0 ? (
        <Empty className="rounded-2xl border border-dashed border-role/25 bg-role-soft/40 py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarRange /></EmptyMedia>
            <EmptyTitle>Belum ada tahun ajaran.</EmptyTitle>
            <EmptyDescription>
              Buat tahun ajaran pertama lembaga Anda — misalnya 2026/2027 — beserta Semester 1 dan 2.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <YearManager years={years} />
      )}

      {activeYear && (
        <section className="space-y-3">
          <SectionTitle
            tone="violet"
            icon={<Layers />}
            title={`Semester — Tahun Ajaran Aktif ${activeYear.name}`}
            description="Atur periode semester yang sedang berjalan"
          />
          <SemesterPanel semesters={semesters} />
        </section>
      )}
    </div>
  );
}
