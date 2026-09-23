import { requireRole } from "@/lib/auth";
import { getTartilConfig, getTartilMethods } from "@/lib/tartil";
import { settingsSectionsFor } from "@/lib/roles";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { MaterialManager } from "@/components/settings/material-manager";
import { TemplateManager } from "@/components/settings/template-manager";
import { TartilMethodManager } from "@/components/settings/tartil-method-manager";
import { TartilModeSwitcher } from "@/components/settings/tartil-mode-switcher";

export async function TartilSection() {
  const profile = await requireRole(["ADMIN"], "/admin/pengaturan/tartil");
  const [config, methods] = await Promise.all([
    profile.tenantId ? getTartilConfig(profile.tenantId) : Promise.resolve(null),
    getTartilMethods(),
  ]);

  return (
    <SettingsLayout
      role={profile.role}
      sections={settingsSectionsFor("ADMIN")}
      active="tartil"
      title="Pengaturan"
      description="Master materi dan template catatan Tartil — khusus lembaga Anda."
    >
      {config ? (
        <>
          <TartilModeSwitcher currentMode={config.mode} />
          <TartilMethodManager methods={methods} />
          <MaterialManager materials={config.materials} />
          <TemplateManager templates={config.templates} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Konfigurasi Tartil belum tersedia.</p>
      )}
    </SettingsLayout>
  );
}
