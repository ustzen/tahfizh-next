import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Music4 } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTahfidzConfig, type TahfidzMode } from "@/lib/tahfidz";
import { settingsSectionsFor } from "@/lib/roles";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { SurahManager } from "@/components/settings/surah-manager";
import { GradeConfigForm } from "@/components/settings/grade-config-form";
import { ModeSwitcher } from "@/components/settings/mode-switcher";
import { GlobalMasterSource } from "@/components/settings/global-master-source";

export async function TahfidzSection() {
  const profile = await requireRole(["ADMIN"], "/admin/pengaturan/tahfidz");
  const config = profile.tenantId ? await getTahfidzConfig(profile.tenantId) : null;

  return (
    <SettingsLayout
      role={profile.role}
      sections={settingsSectionsFor("ADMIN")}
      active="tahfidz"
      title="Pengaturan"
      description="Konfigurasi modul Tahfidz — khusus lembaga Anda, tidak memengaruhi lembaga lain."
    >
      {config ? (
        <>
          <Card className="shadow-card rounded-2xl">
            <CardHeader>
              <CardTitle>Mode Penilaian</CardTitle>
              <CardDescription>
                Centang (✓), Huruf (A, B, C…), atau Angka (1–100). Mengubah mode dengan data penilaian
                yang sudah ada akan membuka dialog konversi — data lama tidak pernah berubah tanpa konfirmasi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ModeSwitcher
                currentMode={config.mode as TahfidzMode}
                hasAssessments={config.surahs.some((s) => s.inUse)}
              />
            </CardContent>
          </Card>

          {config.mode === "HURUF" && (
            <Card className="shadow-card rounded-2xl">
              <CardHeader>
                <CardTitle>Konfigurasi Grade</CardTitle>
                <CardDescription>
                  Tentukan label dan rentang nilai (1–100) untuk setiap grade. Grade tidak di-hard-code.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GradeConfigForm grades={config.grades} />
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card rounded-2xl">
            <CardHeader>
              <CardTitle>Master Surat</CardTitle>
              <CardDescription>
                Tambah, ubah nama, urutkan (drag), aktifkan/nonaktifkan. Surat dengan riwayat penilaian
                tidak dapat dihapus — nonaktifkan agar histori tetap utuh.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SurahManager surahs={config.surahs} />
            </CardContent>
          </Card>

          <GlobalMasterSource
            usedIds={config.surahs.filter((s) => !s.isCustom).map((s) => s.surahId as string)}
          />
        </>
      ) : (
        <Card className="shadow-card rounded-2xl">
          <CardContent className="flex items-center gap-3 py-8">
            <Music4 className="text-muted-foreground size-5" />
            <p className="text-muted-foreground text-sm">Konfigurasi Tahfidz belum tersedia.</p>
          </CardContent>
        </Card>
      )}
    </SettingsLayout>
  );
}
