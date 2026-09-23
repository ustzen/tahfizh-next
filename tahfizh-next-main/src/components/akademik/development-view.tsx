import { History } from "lucide-react";

import { type SessionProfile } from "@/lib/auth";
import {
  getDevelopmentStudents,
  getDevelopmentSummary,
  getAcademicYears,
  getSemesters,
  type SemesterRow,
} from "@/lib/akademik";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { DevelopmentTimeline, type TimelineSemester, type TimelineYear } from "@/components/akademik/development-timeline";
import { StudentPicker } from "@/components/akademik/student-picker";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/**
 * TAHFIZH V11 — Riwayat Perkembangan (#43-#48).
 * One shared server view for all four roles; scoping happens in
 * getDevelopmentStudents (server) + RLS + the development_feed RPC.
 */
export async function DevelopmentView({
  profile,
  studentId,
}: {
  profile: SessionProfile;
  studentId?: string;
}) {
  const [students, years, terms] = await Promise.all([
    getDevelopmentStudents(profile),
    getAcademicYears(),
    getTerminology(profile.tenantId),
  ]);

  if (students.length === 0) {
    return (
      <div>
        <PageHeader
          title="Riwayat Perkembangan"
          description="Timeline aktivitas pembelajaran per santri."
        />
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><History /></EmptyMedia>
            <EmptyTitle>Belum ada santri yang dapat Anda lihat.</EmptyTitle>
            <EmptyDescription>
              {profile.role === "WALI_SANTRI"
                ? "Hubungi admin lembaga untuk menghubungkan data anak Anda."
                : "Data santri akan muncul setelah santri ditambahkan atau ditugaskan kepada Anda."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  // All semesters across all years for the period filter (#45/#47).
  const semesterRows: SemesterRow[] = (
    await Promise.all(years.map((y) => getSemesters(y.id)))
  ).flat();

  const timelineYears: TimelineYear[] = years.map((y) => ({
    id: y.id,
    name: y.name,
    startDate: y.startDate,
    endDate: y.endDate,
    active: y.status === "ACTIVE",
  }));

  const timelineSemesters: TimelineSemester[] = semesterRows.map((s) => ({
    id: s.id,
    yearId: s.academicYearId,
    label: `${s.name || "Semester"} ${s.sequence}`,
    startDate: s.startDate,
    endDate: s.endDate,
    active: s.status === "AKTIF",
  }));

  const selected = students.find((s) => s.id === studentId) ?? students[0];
  const summary = await getDevelopmentSummary(selected.id);
  const activeYear = years.find((y) => y.status === "ACTIVE");

  return (
    <div>
      <PageHeader
        title="Riwayat Perkembangan"
        description={
          activeYear
            ? `Timeline ${terms.santri.toLowerCase()} per periode — indikator 🟢 menandai tahun ajaran & semester aktif (${activeYear.name}).`
            : `Timeline ${terms.santri.toLowerCase()} per periode.`
        }
        action={
          <StudentPicker
            students={students.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
            selectedId={selected.id}
          />
        }
      />
      <DevelopmentTimeline
        studentId={selected.id}
        summary={summary}
        years={timelineYears}
        semesters={timelineSemesters}
      />
    </div>
  );
}
