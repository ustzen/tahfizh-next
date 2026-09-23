import { requireRole } from "@/lib/auth";
import { getJournalAdminTemplates } from "@/lib/v7";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { settingsSectionsFor } from "@/lib/roles";
import { JournalTemplateManager } from "@/components/settings/journal-template-manager";

export const metadata = { title: "Pengaturan — Custom Jurnal" };

export default async function JurnalSettingsPage() {
  const profile = await requireRole(["ADMIN"], "/admin/pengaturan/jurnal");
  const templates = await getJournalAdminTemplates();

  return (
    <SettingsLayout
      role="ADMIN"
      sections={settingsSectionsFor("ADMIN")}
      active="jurnal"
      title="Custom Jurnal"
      description="Template jurnal beserta field dinamis untuk aktivitas di luar modul standar."
    >
      <JournalTemplateManager templates={templates} />
    </SettingsLayout>
  );
}
