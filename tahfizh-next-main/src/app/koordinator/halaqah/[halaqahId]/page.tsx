import { notFound } from "next/navigation";
import { PageHeader, CardBox } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getHalaqahDetail } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { PengampuList } from "@/components/halaqah/member-list";
import { HalaqahTabs } from "@/components/halaqah/halaqah-tabs";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Detail Halaqah" };

/** TAHFIZH V8 — ringkasan detail halaqah untuk Koordinator (rule #5/#12). */
export default async function KoordinatorHalaqahDetailPage({
  params,
}: {
  params: Promise<{ halaqahId: string }>;
}) {
  const profile = await requireRole(["KOORDINATOR"], "/koordinator/halaqah");
  const { halaqahId } = await params;
  const [detail, terms] = await Promise.all([getHalaqahDetail(halaqahId), getTerminology(profile.tenantId)]);
  if (!detail) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title={detail.halaqah.name}
        description={`${detail.studentCount} ${terms.santri.toLowerCase()} • ${detail.teachers.map((t) => t.name).join(", ") || "Belum ada pengampu"}`}
      />
      <HalaqahTabs halaqahId={halaqahId} role="koordinator" halaqahLabel={terms.halaqah} studentLabel={terms.santri} />

      <div className="grid gap-3 lg:grid-cols-3">
        <CardBox className="p-4">
          <p className="text-xs text-muted-foreground">Guru Pengampu</p>
          <div className="mt-2">
            <PengampuList teachers={detail.teachers} />
          </div>
        </CardBox>
        <CardBox className="p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-2">
            <Badge className={detail.halaqah.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
              {detail.halaqah.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
            </Badge>
            {detail.halaqah.description ? (
              <p className="mt-2 text-xs text-muted-foreground">{detail.halaqah.description}</p>
            ) : null}
          </div>
        </CardBox>
        <CardBox className="p-4">
          <p className="text-xs text-muted-foreground">Jumlah {terms.santri}</p>
          <p className="mt-1 text-3xl font-bold text-role-strong">{detail.studentCount}</p>
        </CardBox>
      </div>
    </div>
  );
}
