import { requireRole } from "@/lib/auth";
import { getSetoranConfig } from "@/lib/setoran";
import { settingsSectionsFor } from "@/lib/roles";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { SubmissionTemplateManager } from "@/components/settings/submission-template-manager";

/**
 * Pengaturan → Setoran (rule #33): Admin manages the per-tenant note
 * templates. Scoring reuses the V3 config shown here read-only for context.
 */
export async function SetoranSection() {
  const profile = await requireRole(["ADMIN"], "/admin/pengaturan/setoran");
  const config = profile.tenantId ? await getSetoranConfig(profile.tenantId) : null;

  return (
    <SettingsLayout
      role={profile.role}
      sections={settingsSectionsFor("ADMIN")}
      active="setoran"
      title="Pengaturan"
      description="Template catatan Setoran — khusus lembaga Anda. Mode penilaian mengikuti konfigurasi Tahfidz."
    >
      {config ? (
        <>
          <div className="rounded-2xl border bg-card p-5 shadow-card">
            <h3 className="text-sm font-bold text-foreground">Konfigurasi Penilaian</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Setoran menggunakan sistem penilaian lembaga yang sama dengan Tahfidz/Tartil (satu
              sumber konfigurasi): mode{" "}
              <span className="font-semibold text-role-strong">{config.mode}</span>
              {config.mode === "HURUF" ? ` dengan ${config.grades.length} grade` : ""}. Ubah melalui
              Pengaturan → Tahfidz.
            </p>
          </div>
          <SubmissionTemplateManager templates={config.templates} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Konfigurasi Setoran belum tersedia.</p>
      )}
    </SettingsLayout>
  );
}
