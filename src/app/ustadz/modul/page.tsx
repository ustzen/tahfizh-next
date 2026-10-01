import { requireRole } from "@/lib/auth";
import { getTerminology } from "@/lib/terminology";
import { getCustomModules, getCustomModuleLogPage } from "@/lib/custom-module";
import { getTeacherStudentsDetailed } from "@/lib/teacher-students";
import { PageHeader } from "@/components/dashboard/section";

import { ModulClient } from "./modul-client";

export const metadata = { title: "Modul" };

/** Tanggal hari ini zona Asia/Jakarta dalam format YYYY-MM-DD (utk default & max input). */
function hariIniWib(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/**
 * TAHFIZH V58 — Menu Modul guru: pencatatan poin untuk modul kustom lembaga
 * (di luar modul bawaan Tahfidz/Tugas/Hadits/Doa/Tajwid). Setiap catatan = 1
 * poin; progres tampil sebagai tile di dasbor santri.
 */
export default async function UstadzModulPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/modul");
  const terms = await getTerminology(profile.tenantId);

  const [students, modules, logs] = await Promise.all([
    getTeacherStudentsDetailed(),
    getCustomModules(),
    getCustomModuleLogPage(50),
  ]);

  return (
    <div>
      <PageHeader
        title="Modul"
        description={`Catat poin kemajuan ${terms.santri.toLowerCase()} untuk modul kustom lembaga — setiap catatan dihitung 1 poin dan tampil sebagai tile di dasbor ${terms.santri.toLowerCase()}.`}
      />
      <ModulClient
        students={students}
        modules={modules}
        initialLogs={logs}
        santriLabel={terms.santri}
        today={hariIniWib()}
      />
    </div>
  );
}
