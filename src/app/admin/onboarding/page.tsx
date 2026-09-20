import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  computeOnboardingSteps,
  getOnboarding,
  getTenantProfile,
} from "@/lib/akademik";
import { getTerminology } from "@/lib/terminology";
import { OnboardingWizard, type OnboardingStep } from "@/components/akademik/onboarding-wizard";

export const metadata = { title: "Onboarding Lembaga" };

/**
 * TAHFIZH V11 — Onboarding wizard page (#17-#28). Merges persisted progress
 * with live data checks so completed configuration is reflected even after a
 * skip (#82). Step 5/6 link to the existing guru/santri management, step 8/9
 * reuse the existing raport & infak settings (#25/#26) — nothing duplicated.
 */
export default async function AdminOnboardingPage() {
  const profile = await requireRole(["ADMIN"], "/admin/onboarding");
  const tid = profile.tenantId!;

  const [saved, dataDone, tenantProfile, terms] = await Promise.all([
    getOnboarding(),
    computeOnboardingSteps(),
    getTenantProfile(tid),
    getTerminology(profile.tenantId),
  ]);
  const supabase = await createClient();
  const reportRes = await supabase
    .from("report_settings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tid);
  const hasReport = (reportRes.count ?? 0) > 0;

  const tenantName = tenantProfile.tenant?.name ?? "Lembaga Anda";

  const steps: OnboardingStep[] = [
    {
      n: 1,
      label: "Profil Lembaga",
      description: `${tenantName} — nama, logo, alamat, dan pimpinan lembaga.`,
      href: "/admin/pengaturan/profil",
      done: Boolean(tenantProfile.tenant?.name),
    },
    {
      n: 2,
      label: "Terminologi",
      description: "Tentukan istilah lembaga: santri/murid, ustadz/guru, halaqah/kelas, dan lainnya.",
      href: "/admin/pengaturan/terminologi",
      done: true,
    },
    {
      n: 3,
      label: "Tahun Ajaran",
      description: "Buat tahun ajaran pertama beserta Semester 1 & 2, lalu aktifkan.",
      href: "/admin/akademik",
      done: dataDone.tahunAjaran,
    },
    {
      n: 4,
      label: "Jadwal Pembelajaran",
      description: "Pilih hari & jam pembelajaran, plus jadwal per halaqah bila perlu.",
      href: "/admin/akademik/jadwal",
      done: dataDone.jadwal,
    },
    {
      n: 5,
      label: "Guru",
      description: "Tambahkan ustadz/ustadzah — ID guru global (A-1, A-2, …) dibuat otomatis.",
      href: "/admin/guru",
      done: dataDone.guru,
    },
    {
      n: 6,
      label: terms.santri,
      description: `Tambahkan ${terms.santri.toLowerCase()} — ID global (S-1, S-2, …) dibuat otomatis.`,
      href: "/admin/santri",
      done: dataDone.santri,
    },
    {
      n: 7,
      label: terms.halaqah,
      description: `Bentuk ${terms.halaqah.toLowerCase()}: pilih guru pengampu dan anggota ${terms.santri.toLowerCase()}.`,
      href: "/admin/halaqah",
      done: dataDone.halaqah,
    },
    {
      n: 8,
      label: "Pengaturan Raport",
      description: "Pilih template raport dari Developer dan atur identitas lembaga pada raport.",
      href: "/admin/raport",
      done: hasReport,
    },
    {
      n: 9,
      label: "Selesai",
      description: "Review checklist dan masuk ke dashboard.",
      href: null,
      done: saved?.completed ?? false,
    },
  ];

  const currentStep = saved?.completed ? steps.length : Math.max(saved?.currentStep ?? 0, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding Lembaga"
        description={
          saved?.completed
            ? "Onboarding sudah selesai. Anda tetap dapat membuka langkah mana pun untuk menyesuaikan pengaturan."
            : "Pengaturan lembaga Anda belum selesai — lanjutkan dari langkah berikutnya kapan saja."
        }
      />
      <OnboardingWizard
        steps={steps}
        currentStep={currentStep}
        completed={saved?.completed ?? false}
        profileHref="/admin"
      />
    </div>
  );
}
