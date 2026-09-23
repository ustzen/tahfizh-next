import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { getLearningConfig } from "@/lib/learning";
import { LEARNING_MODULES, LEARNING_MODULE_CONFIGS, type LearningModule } from "@/lib/learning-shared";
import { settingsSectionsFor } from "@/lib/roles";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { LearningMaterialManager } from "@/components/settings/learning-material-manager";
import { LearningTemplateManager } from "@/components/settings/learning-template-manager";
import { cn } from "@/lib/utils";

/**
 * Pengaturan → Materi Pembelajaran (rule #28-#29): tab per module
 * [Hadits] [Doa] [Tajwid] — one route, tab picked via ?tab= (client-side
 * navigation; each tab loads its own config server-side).
 */
export async function MateriSection({ tab }: { tab?: string }) {
  const profile = await requireRole(["ADMIN"], "/admin/pengaturan/materi");
  const sections = settingsSectionsFor("ADMIN");

  const active: LearningModule = (LEARNING_MODULES as readonly string[]).includes(tab ?? "")
    ? (tab as LearningModule)
    : "HADITS";

  const config = profile.tenantId ? await getLearningConfig(profile.tenantId, active) : null;

  return (
    <SettingsLayout
      role={profile.role}
      sections={sections}
      active="materi"
      title="Pengaturan"
      description="Master materi Hadits, Doa Harian, dan Tajwid — khusus lembaga Anda."
    >
      {/* Tabs (rule #28) */}
      <div className="flex gap-1.5">
        {LEARNING_MODULES.map((m) => (
          <Link
            key={m}
            href={`/admin/pengaturan/materi?tab=${m}`}
            prefetch
            className={cn(
              "rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
              active === m
                ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {LEARNING_MODULE_CONFIGS[m].label}
          </Link>
        ))}
      </div>

      {config ? (
        <>
          <LearningMaterialManager module={active} materials={config.materials} />
          <LearningTemplateManager module={active} templates={config.templates} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Konfigurasi materi belum tersedia.</p>
      )}
    </SettingsLayout>
  );
}
