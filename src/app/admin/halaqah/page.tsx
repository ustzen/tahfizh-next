import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAdminHalaqahList, getStudentOptions, getTeacherOptions } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { HalaqahManager } from "@/components/halaqah/halaqah-manager";

export const metadata = { title: "Halaqah" };

/**
 * TAHFIZH V8 — Admin halaqah management (rule #4): create, edit, activate,
 * assign pengampu, manage members, detail/presensi/rekap via detail page.
 */
export default async function AdminHalaqahPage() {
  const profile = await requireRole(["ADMIN"], "/admin/halaqah");
  const [list, teachers, students, terms] = await Promise.all([
    getAdminHalaqahList(),
    getTeacherOptions(),
    getStudentOptions(),
    getTerminology(profile.tenantId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={terms.halaqah}
        description={`Kelola ${terms.halaqah.toLowerCase()}, guru pengampu, dan anggota ${terms.santri.toLowerCase()} lembaga Anda.`}
      />
      <HalaqahManager
        items={list}
        teachers={teachers}
        students={students}
        role="admin"
        halaqahLabel={terms.halaqah}
        studentLabel={terms.santri}
      />
    </div>
  );
}
