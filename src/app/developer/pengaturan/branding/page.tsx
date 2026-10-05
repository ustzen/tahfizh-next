import { BrandingForm } from "@/components/settings/branding-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { brandingPublicUrl, getLoginBranding } from "@/lib/branding";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { settingsSectionsFor } from "@/lib/roles";

export const metadata = { title: "Pengaturan · Branding" };

export const dynamic = "force-dynamic";

export default async function Page() {
  const sections = settingsSectionsFor("DEVELOPER");
  const branding = await getLoginBranding();

  return (
    <SettingsLayout
      role="DEVELOPER"
      sections={sections}
      active="branding"
      title="Pengaturan"
      description="Ganti logo dan gambar hero yang tampil di layar login."
    >
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>Branding Layar Login</CardTitle>
          <CardDescription>
            Unggah logo dan gambar hero sendiri — keduanya otomatis menggantikan ilustrasi bawaan
            di halaman /masuk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm
            logoUrl={branding.logoPath ? brandingPublicUrl(branding.logoPath) : null}
            heroUrl={branding.heroPath ? brandingPublicUrl(branding.heroPath) : null}
          />
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}
