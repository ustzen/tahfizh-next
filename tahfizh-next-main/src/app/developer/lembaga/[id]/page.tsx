import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/section";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { TenantStatusForm } from "./status-form";
import { tenantKindLabel } from "@/lib/roles";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Detail Lembaga" };

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["DEVELOPER"], `/developer/lembaga/${id}`);
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, business_code, name, kind, status, created_at")
    .eq("id", id)
    .single();

  if (!tenant) notFound();

  const [{ count: userCount }, { count: teacherCount }, { count: studentCount }, { data: admin }] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", id),
      supabase.from("teachers").select("id", { count: "exact", head: true }).eq("tenant_id", id),
      supabase.from("students").select("id", { count: "exact", head: true }).eq("tenant_id", id),
      supabase.from("profiles").select("full_name").eq("tenant_id", id).eq("role", "ADMIN").limit(1),
    ]);

  return (
    <div>
      <PageHeader
        title={tenant.name}
        description={`${tenant.business_code} · ${tenantKindLabel(tenant.kind)}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="tenant" label="Status" value={<StatusBadge status={tenant.status} />} />
        <StatCard icon="user" label="Total User" value={userCount ?? 0} />
        <StatCard icon="teacher" label="Total Guru" value={teacherCount ?? 0} />
        <StatCard icon="student" label="Total Santri" value={studentCount ?? 0} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="shadow-card rounded-2xl">
          <CardContent className="px-5 py-5">
            <h3 className="font-semibold text-foreground">Informasi Lembaga</h3>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["ID Lembaga", tenant.business_code],
                ["Jenis", tenantKindLabel(tenant.kind)],
                ["Admin", admin?.[0]?.full_name ?? "—"],
                ["Terdaftar", formatDateTime(tenant.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="shadow-card rounded-2xl">
          <CardContent className="px-5 py-5">
            <h3 className="font-semibold text-foreground">Status Lembaga</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Menonaktifkan lembaga menandai data sebagai berhenti berlangganan. V1 tidak memblokir login
              secara otomatis — kontrol akses penuh datang di versi berikutnya.
            </p>
            <div className="mt-4">
              <TenantStatusForm id={tenant.id} status={tenant.status} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
