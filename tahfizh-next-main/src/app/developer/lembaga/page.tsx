import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/section";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { tenantKindLabel } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Building2 } from "lucide-react";

export const metadata = { title: "Lembaga" };

export default async function LembagaListPage() {
  await requireRole(["DEVELOPER"], "/developer/lembaga");
  const supabase = await createClient();

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, business_code, name, kind, status, created_at")
    .order("business_code");

  if (tenantsError) {
    console.error("[developer/lembaga] gagal memuat tenants:", tenantsError.message);
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // Admin per tenant (first ADMIN of each tenant), diambil terpisah karena
  // tenants <-> profiles tidak selalu di-embed lewat satu query select().
  const { data: admins } = await supabase
    .from("profiles")
    .select("id, full_name, tenant_id")
    .eq("role", "ADMIN");

  const adminByTenant = new Map<string, { full_name: string; id: string }>();
  for (const a of admins ?? []) {
    if (a.tenant_id && !adminByTenant.has(a.tenant_id)) adminByTenant.set(a.tenant_id, a);
  }

  return (
    <div>
      <PageHeader title="Lembaga" description="Seluruh lembaga terdaftar di platform TAHFIZH." />

      {/* DEBUG SEMENTARA — hapus blok ini setelah penyebab menu kosong ketemu. */}
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <p>auth.uid() sesi ini: <span className="font-mono">{authUser?.id ?? "null (tidak login / cookie tidak terbaca)"}</span></p>
        <p>Jumlah baris tenants yang berhasil diambil: {tenants?.length ?? 0}</p>
        {tenantsError && (
          <>
            <p className="mt-1 font-semibold text-rose-700 dark:text-rose-300">Error query: {tenantsError.message}</p>
            <p className="text-rose-700 dark:text-rose-300">Code: {tenantsError.code} · Detail: {tenantsError.details || "-"}</p>
          </>
        )}
      </div>

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-0 py-0">
          {tenants && tenants.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-5">ID</TableHead>
                  <TableHead>Nama Lembaga</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal Daftar</TableHead>
                  <TableHead className="px-5 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => {
                  const admin = adminByTenant.get(t.id);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="px-5 font-mono text-xs font-semibold text-role-strong">{t.business_code}</TableCell>
                      <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{tenantKindLabel(t.kind)}</TableCell>
                      <TableCell className="text-muted-foreground">{admin?.full_name ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                      <TableCell className="px-5 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/developer/lembaga/${t.id}`}>Detail</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2 />
                </EmptyMedia>
                <EmptyTitle>Belum ada lembaga terdaftar</EmptyTitle>
                <EmptyDescription>
                  Lembaga akan muncul di sini setelah ada pendaftaran dari halaman publik.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
