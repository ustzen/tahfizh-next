import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getLearningSettings, getSchedules } from "@/lib/akademik";
import { getAdminHalaqahList } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { LearningDaysForm } from "@/components/akademik/learning-days-form";
import { ScheduleManager } from "@/components/akademik/schedule-manager";

export const metadata = { title: "Jadwal Pembelajaran" };

/**
 * TAHFIZH V11 — Hari & jam pembelajaran (#13-#16). Jadwal hanya referensi;
 * presensi V8 tetap berjalan sesuai konfigurasi lembaga.
 */
export default async function AdminJadwalPage() {
  const profile = await requireRole(["ADMIN"], "/admin/akademik/jadwal");
  const [settings, schedules, halaqahs, terms] = await Promise.all([
    getLearningSettings(),
    getSchedules(),
    getAdminHalaqahList(),
    getTerminology(profile.tenantId),
  ]);
  const halaqahLabel = terms.halaqah ?? "Halaqah";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Jadwal Pembelajaran"
        description="Atur hari & jam pembelajaran lembaga, serta jadwal per halaqah. Presensi tetap berjalan sesuai konfigurasi lembaga."
      />

      <section className="space-y-3">
        <h3 className="font-semibold text-foreground">Hari Pembelajaran</h3>
        <LearningDaysForm days={settings.days} />
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-foreground">Jadwal per {halaqahLabel}</h3>
        <ScheduleManager
          schedules={schedules}
          halaqahs={halaqahs.map((h) => ({ id: h.id, name: h.name, code: h.businessCode }))}
          halaqahLabel={halaqahLabel}
        />
      </section>
    </div>
  );
}
