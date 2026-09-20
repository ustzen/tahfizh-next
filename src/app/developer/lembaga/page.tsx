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

  // Join admin profile per tenant (first ADMIN of each tenant).
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, business_code, name, kind, status, created_at, profiles(full_name, email_role)")
    .order("business_code");

  // The join above doesn't filter admins client-side; fetch admins separately.
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
