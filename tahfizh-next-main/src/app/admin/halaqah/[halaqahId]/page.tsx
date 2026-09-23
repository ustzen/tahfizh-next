import { notFound } from "next/navigation";
import { PageHeader, CardBox } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getHalaqahDetail } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { PengampuList } from "@/components/halaqah/member-list";
import { HalaqahTabs } from "@/components/halaqah/halaqah-tabs";
import { WaGroupCard } from "@/components/halaqah/wa-group-card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getSchedules } from "@/lib/akademik";
import { HalaqahScheduleList } from "@/components/akademik/halaqah-schedule-list";

export const metadata = { title: "Detail Halaqah" };

/** TAHFIZH V8 — ringkasan detail halaqah untuk Admin (rule #12). */
export default async function AdminHalaqahDetailPage({
  params,
}: {
  params: Promise<{ halaqahId: string }>;
}) {
  const profile = await requireRole(["ADMIN"], "/admin/halaqah");
  const { halaqahId } = await params;
  const [detail, terms] = await Promise.all([getHalaqahDetail(halaqahId), getTerminology(profile.tenantId)]);
  if (!detail) notFound();

  // V10 (rule #42): read the WA group link directly (RLS-scoped to tenant).
  const supabase = await createClient();
  const { data: waRow } = await supabase
    .from("halaqahs")
    .select("whatsapp_group_url")
    .eq("id", halaqahId)
    .maybeSingle();
  const waUrl = (waRow?.whatsapp_group_url as string | null) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={detail.halaqah.name}
        description={`${detail.studentCount} ${terms.santri.toLowerCase()} • ${detail.teachers.map((t) => t.name).join(", ") || "Belum ada pengampu"}`}
      />
      <HalaqahTabs
        halaqahId={halaqahId}
        role="admin"
        halaqahLabel={terms.halaqah}
        studentLabel={terms.santri}
        tabs={[{ key: "aktivitas", label: "Aktivitas" }]}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <CardBox className="p-4">
          <p className="text-xs text-muted-foreground">Guru Pengampu</p>
          <div className="mt-2">
            <PengampuList teachers={detail.teachers} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground/80">
            Atur pengampu lewat tombol “Pengampu” di daftar {terms.halaqah.toLowerCase()}.
          </p>
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

      {/* V10: grup WhatsApp halaqah (rule #42/#43) */}
      <WaGroupCard halaqahId={halaqahId} initialUrl={waUrl} canEdit />

      {/* V11 (#15): jadwal pembelajaran halaqah ini */}
      <HalaqahScheduleList schedules={(await getSchedules()).filter((s) => s.halaqahId === halaqahId)} />
    </div>
  );
}
