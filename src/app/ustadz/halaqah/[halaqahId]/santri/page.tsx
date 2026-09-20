import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getHalaqahDetail } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { HalaqahTabs } from "@/components/halaqah/halaqah-tabs";
import { MemberList } from "@/components/halaqah/member-list";

export const metadata = { title: "Anggota Halaqah" };

/** TAHFIZH V8 — tab Anggota (rule #12). */
export default async function UstadzHalaqahSantriPage({
  params,
}: {
  params: Promise<{ halaqahId: string }>;
}) {
  const profile = await requireRole(["USTADZ"], "/ustadz/halaqah");
  const { halaqahId } = await params;
  const [detail, terms] = await Promise.all([getHalaqahDetail(halaqahId), getTerminology(profile.tenantId)]);
  if (!detail) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${terms.santri} — ${detail.halaqah.name}`}
        description={`${detail.studentCount} anggota aktif.`}
      />
      <HalaqahTabs halaqahId={halaqahId} role="ustadz" halaqahLabel={terms.halaqah} studentLabel={terms.santri} />
      <MemberList students={detail.students} />
    </div>
  );
}
