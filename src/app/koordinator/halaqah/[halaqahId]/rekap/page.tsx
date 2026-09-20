import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAttendanceRekap, getHalaqahDetail } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { HalaqahTabs } from "@/components/halaqah/halaqah-tabs";
import { RekapTable } from "@/components/halaqah/rekap-table";

export const metadata = { title: "Rekap Halaqah" };

/** TAHFIZH V8 — tab Rekap Koordinator (rule #5/#37). */
export default async function KoordinatorHalaqahRekapPage({
  params,
}: {
  params: Promise<{ halaqahId: string }>;
}) {
  const profile = await requireRole(["KOORDINATOR"], "/koordinator/halaqah");
  const { halaqahId } = await params;
  const [detail, terms] = await Promise.all([getHalaqahDetail(halaqahId), getTerminology(profile.tenantId)]);
  if (!detail) notFound();

  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-31`;
  const rows = await getAttendanceRekap(halaqahId, from, to);

  return (
    <div className="space-y-5">
      <PageHeader title={`Rekap — ${detail.halaqah.name}`} description="Bulan berjalan." />
      <HalaqahTabs halaqahId={halaqahId} role="koordinator" halaqahLabel={terms.halaqah} studentLabel={terms.santri} />
      <RekapTable rows={rows} />
    </div>
  );
}
