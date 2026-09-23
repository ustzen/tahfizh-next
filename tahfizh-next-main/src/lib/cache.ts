import "server-only";

import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { ROLE_HOME, type AppRole } from "@/lib/roles";

/**
 * Tenant-aware cache invalidation. Every mutation path in the app calls one
 * of these so lists/statistics never go stale after CREATE/UPDATE/DELETE.
 *
 * V2 cache keys (rule #27):
 *   tenant:{code}                     — tenant-scoped data
 *   tenant:{code}:settings            — tenant configuration
 *   tenant:{code}:terminology         — UI labels
 *   profile:{userId}                  — user profile data
 *   user:{userId}:menu-order          — per-user menu preference
 */
export const CACHE_KEYS = {
  tenant: (code: string | null) => (code ? `tenant:${code}` : "platform"),
  tenantSettings: (code: string | null) => `${CACHE_KEYS.tenant(code)}:settings`,
  terminology: (code: string | null) => `${CACHE_KEYS.tenant(code)}:terminology`,
  profile: (userId: string) => `profile:${userId}`,
  menuOrder: (userId: string) => `user:${userId}:menu-order`,
  // V3 — Tahfidz (tenant-aware, rule #37/#38)
  tahfidzSettings: (code: string | null) => `${CACHE_KEYS.tenant(code)}:tahfidz-settings`,
  tahfidzSurahs: (code: string | null) => `${CACHE_KEYS.tenant(code)}:tahfidz-surahs`,
  tahfidzStudentSummary: (studentId: string) => `student:${studentId}:tahfidz-summary`,
  // V4 — Tartil + Kartu Prestasi
  tartilMaterials: (code: string | null) => `${CACHE_KEYS.tenant(code)}:tartil-materials`,
  tartilTemplates: (code: string | null) => `${CACHE_KEYS.tenant(code)}:tartil-note-templates`,
  tartilStudentSummary: (studentId: string) => `student:${studentId}:tartil-summary`,
  achievementCard: (studentId: string) => `student:${studentId}:achievement-card`,
  // V5 — Setoran (rule #36: tenant-aware)
  setoranTemplates: (code: string | null) => `${CACHE_KEYS.tenant(code)}:submission-note-templates`,
  setoranStudentSummary: (studentId: string) => `student:${studentId}:submissions`,
  // V6 — Hadits/Doa/Tajwid (rule #37: tenant-aware)
  learningMaterials: (code: string | null, module: string) =>
    `${CACHE_KEYS.tenant(code)}:${module.toLowerCase()}`,
  learningTemplates: (code: string | null) => `${CACHE_KEYS.tenant(code)}:learning-note-templates`,
  learningStudentSummary: (studentId: string, module: string) =>
    `student:${studentId}:${module.toLowerCase()}`,
  // V7 — Tugas/Jurnal (rule #43: tenant-aware). Target per halaqah (V17) tidak di-cache.
  v7Tasks: (code: string | null) => `${CACHE_KEYS.tenant(code)}:tasks`,
  v7JournalTemplates: (code: string | null) => `${CACHE_KEYS.tenant(code)}:journal-templates`,
  v7StudentTasks: (studentId: string) => `student:${studentId}:tasks`,
  v7StudentJournals: (studentId: string) => `student:${studentId}:journals`,
  // V9 — Raport (rule #70: tenant-aware)
  reportTemplates: (code: string | null) => `${CACHE_KEYS.tenant(code)}:report-templates`,
  reportSettings: (code: string | null) => `${CACHE_KEYS.tenant(code)}:report-settings`,
  studentReports: (studentId: string) => `student:${studentId}:reports`,
  report: (reportId: string) => `report:${reportId}`,
  template: (templateId: string) => `template:${templateId}`,
  // V8 — Halaqah & Presensi (rule #50: tenant-aware)
  halaqah: (code: string | null) => `${CACHE_KEYS.tenant(code)}:halaqah`,
  halaqahStudents: (halaqahId: string) => `halaqah:${halaqahId}:students`,
  halaqahAttendance: (halaqahId: string) => `halaqah:${halaqahId}:attendance`,
  teacherHalaqah: (teacherId: string) => `teacher:${teacherId}:halaqah`,
  teacherAttendance: (teacherId: string) => `teacher:${teacherId}:attendance`,
  studentAttendance: (studentId: string) => `student:${studentId}:attendance`,
};

/** After any ADMIN learning config mutation (materials / templates). */
export function invalidateLearningConfig(tenantCode: string | null) {
  invalidateTags(
    CACHE_KEYS.learningTemplates(tenantCode),
    CACHE_KEYS.learningMaterials(tenantCode, "HADITS"),
    CACHE_KEYS.learningMaterials(tenantCode, "DOA"),
    CACHE_KEYS.learningMaterials(tenantCode, "TAJWID")
  );
  revalidatePath("/admin/pengaturan/materi");
  revalidatePath("/ustadz/hadits");
  revalidatePath("/ustadz/doa");
  revalidatePath("/ustadz/tajwid");
}

/** After a guru writes a learning assessment — summaries/history/Kartu Prestasi refresh (rule #38). */
export function invalidateLearningAssessments(studentIds: string[], module?: "HADITS" | "DOA" | "TAJWID") {
  for (const id of studentIds) {
    invalidateTags(CACHE_KEYS.achievementCard(id));
    if (module) invalidateTags(CACHE_KEYS.learningStudentSummary(id, module));
    else {
      for (const m of ["HADITS", "DOA", "TAJWID"]) {
        invalidateTags(CACHE_KEYS.learningStudentSummary(id, m));
      }
    }
  }
  revalidatePath("/ustadz/hadits");
  revalidatePath("/ustadz/doa");
  revalidatePath("/ustadz/tajwid");
  revalidatePath("/ustadz");
  revalidatePath("/ustadz/prestasi");
  for (const id of studentIds) revalidatePath(`/ustadz/prestasi/${id}`);
}

/** After any ADMIN Setoran config mutation (note templates). */
export function invalidateSetoranConfig(tenantCode: string | null) {
  invalidateTags(CACHE_KEYS.setoranTemplates(tenantCode));
  revalidatePath("/admin/pengaturan/setoran");
  revalidatePath("/ustadz/setoran");
}

/** After a guru writes a setoran — list/detail/Kartu Prestasi refresh (rule #37). */
export function invalidateSetoranAssessments(studentIds: string[]) {
  for (const id of studentIds) {
    invalidateTags(
      CACHE_KEYS.setoranStudentSummary(id),
      CACHE_KEYS.achievementCard(id)
    );
  }
  revalidatePath("/ustadz/setoran");
  revalidatePath("/ustadz/prestasi");
  for (const id of studentIds) {
    revalidatePath(`/ustadz/setoran/${id}`);
    revalidatePath(`/ustadz/prestasi/${id}`);
  }
}

/** After any ADMIN Tartil config mutation (materials / note templates). */
export function invalidateTartilConfig(tenantCode: string | null) {
  invalidateTags(CACHE_KEYS.tartilMaterials(tenantCode), CACHE_KEYS.tartilTemplates(tenantCode));
  revalidatePath("/admin/pengaturan/tartil");
  revalidatePath("/ustadz/tartil");
}

/** After a guru writes a Tartil assessment — summary + Kartu Prestasi refresh. */
export function invalidateTartilAssessments(studentIds: string[]) {
  for (const id of studentIds) {
    invalidateTags(
      CACHE_KEYS.tartilStudentSummary(id),
      CACHE_KEYS.achievementCard(id)
    );
  }
  revalidatePath("/ustadz/tartil");
  revalidatePath("/ustadz/prestasi");
  for (const id of studentIds) {
    revalidatePath(`/ustadz/tartil/${id}`);
    revalidatePath(`/ustadz/prestasi/${id}`);
  }
}

/** After any ADMIN Tahfidz config mutation (surah CRUD/reorder/mode/grades). */
export function invalidateTahfidzConfig(tenantCode: string | null) {
  invalidateTags(CACHE_KEYS.tahfidzSettings(tenantCode), CACHE_KEYS.tahfidzSurahs(tenantCode));
  revalidatePath("/admin/pengaturan/tahfidz");
  revalidatePath("/ustadz/tahfidz");
}

/** After a guru writes an assessment — summaries/detail refresh. */
export function invalidateTahfidzAssessments(studentIds: string[]) {
  for (const id of studentIds) invalidateTags(CACHE_KEYS.tahfidzStudentSummary(id));
  revalidatePath("/ustadz/tahfidz");
  revalidatePath("/ustadz/santri");
  for (const id of studentIds) revalidatePath(`/ustadz/tahfidz/${id}`);
}

export function invalidateTags(...tags: string[]) {
  for (const tag of tags) {
    try {
      // Next 16: revalidateTag takes a cacheLife profile for SWR behavior.
      revalidateTag(tag, "max");
    } catch {
      // no-op outside request scope
    }
  }
}

export function revalidateRoleSection(role: AppRole, tenantCode: string | null) {
  revalidatePath(ROLE_HOME[role]);
}

export function revalidateSection(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

/** Full invalidation after a profile mutation (own data only). */
export function invalidateProfile(userId: string, role: AppRole, tenantCode: string | null) {
  invalidateTags(CACHE_KEYS.profile(userId));
  revalidatePath(`${ROLE_HOME[role]}/pengaturan`);
  revalidatePath(ROLE_HOME[role]);
}

/** Full invalidation after tenant config mutation (ADMIN only). */
export function invalidateTenantConfig(tenantCode: string | null, role: AppRole = "ADMIN") {
  invalidateTags(
    CACHE_KEYS.terminology(tenantCode),
    CACHE_KEYS.tenantSettings(tenantCode),
    CACHE_KEYS.tenant(tenantCode)
  );
  revalidatePath(`${ROLE_HOME[role]}/pengaturan`);
}

/* ------------------------------------------------------------------------ */
/* V7 — Tugas / Custom Jurnal (rule #43/#44)                                */
/* ------------------------------------------------------------------------ */

/** After ADMIN journal-template mutations. */
export function invalidateJournalConfig(tenantCode: string | null) {
  invalidateTags(CACHE_KEYS.v7JournalTemplates(tenantCode));
  revalidatePath("/admin/pengaturan/jurnal");
  revalidatePath("/ustadz/jurnal");
}

/** After guru task mutations (create/edit/status/grade). */
export function invalidateTasks(studentIds: string[]) {
  for (const id of studentIds) {
    invalidateTags(CACHE_KEYS.v7StudentTasks(id), CACHE_KEYS.achievementCard(id));
    revalidatePath(`/ustadz/tugas/${id}`);
  }
  revalidatePath("/ustadz/tugas");
  revalidatePath("/ustadz");
  revalidatePath("/ustadz/prestasi");
}

/** After guru journal mutations. */
export function invalidateJournals(studentIds: string[]) {
  for (const id of studentIds) {
    invalidateTags(CACHE_KEYS.v7StudentJournals(id), CACHE_KEYS.achievementCard(id));
    revalidatePath(`/ustadz/jurnal/${id}`);
  }
  revalidatePath("/ustadz/jurnal");
  revalidatePath("/ustadz");
  revalidatePath("/ustadz/prestasi");
}

/* ------------------------------------------------------------------------ */
/* V9 — Raport (rule #71)                                                   */
/* ------------------------------------------------------------------------ */

/** After template mutations (global or tenant). */
export function invalidateReportTemplates() {
  invalidateTags("report-templates");
  revalidatePath("/developer/raport");
  revalidatePath("/admin/raport");
  revalidatePath("/admin/raport/template");
  revalidatePath("/koordinator/raport");
  revalidatePath("/ustadz/raport");
}

/** After tenant report-settings mutations. */
export function invalidateReportSettings(tenantCode: string | null) {
  invalidateTags(CACHE_KEYS.reportSettings(tenantCode));
  revalidatePath("/admin/raport/pengaturan");
}

/** After report draft/final mutations (rule #71: snapshots stay out of cache). */
export function invalidateReports(studentIds: string[] = []) {
  invalidateTags("report-templates");
  for (const id of studentIds) invalidateTags(CACHE_KEYS.studentReports(id));
  revalidatePath("/admin/raport");
  revalidatePath("/koordinator/raport");
  revalidatePath("/ustadz/raport");
}

/* ------------------------------------------------------------------------ */
/* V8 — Halaqah & Presensi (rule #51)                                       */
/* ------------------------------------------------------------------------ */

/** After halaqah CRUD / pengampu / membership changes (incl. pindah halaqah — invalidates BOTH old and new via halaqah tag). */
export function invalidateHalaqah(tenantCode: string | null, halaqahIds: string[] = []) {
  invalidateTags(
    CACHE_KEYS.halaqah(tenantCode),
    ...(halaqahIds.length ? halaqahIds : ["halaqah-all"]).flatMap((id) => [
      CACHE_KEYS.halaqahStudents(id),
      CACHE_KEYS.halaqahAttendance(id),
    ])
  );
  revalidatePath("/admin/halaqah");
  revalidatePath("/koordinator/halaqah");
  revalidatePath("/ustadz/halaqah");
  revalidatePath("/ustadz/presensi");
}

/** After a presensi batch save — halaqah + each student's attendance cache. */
export function invalidateAttendance(halaqahId: string, studentIds: string[]) {
  invalidateTags(
    CACHE_KEYS.halaqahAttendance(halaqahId),
    ...studentIds.map((id) => CACHE_KEYS.studentAttendance(id))
  );
  revalidatePath("/ustadz/presensi");
  revalidatePath("/ustadz/presensi/rekap");
  revalidatePath(`/admin/halaqah/${halaqahId}`);
  revalidatePath(`/koordinator/halaqah/${halaqahId}`);
  revalidatePath(`/ustadz/halaqah/${halaqahId}`);
}
