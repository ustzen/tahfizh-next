import { Baby } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { StatusBadge } from "@/components/status-badge";
import { genderLabel } from "@/lib/roles";
import { getTerminology } from "@/lib/terminology";

export const metadata = { title: "Data Saya" };

/**
 * V12 — halaman "Data Saya" untuk role Santri: daftar santri yang terhubung
 * dengan akun ini. Dialog "Hubungkan Anak" (kode relasi) dihapus — penautan
 * kini OTOMATIS (V16): begitu akun santri dibuat/diimport, trigger DB
 * menautkannya sebagai wali dari dirinya sendiri (guardians/guardian_students).
 * Admin tidak perlu langkah manual apa pun.
 */
export default async function SantriAnakPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri/anak");
  const terms = await getTerminology(profile.tenantId);
  const supabase = await createClient();

  // Own guardian row — RLS guarantees this account can only ever reach its own row.
  const { data: guardian } = await supabase
    .from("guardians")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const { data: rows } = guardian
    ? await supabase
        .from("guardian_students")
        .select("id, students(business_code, full_name, gender, status)")
        .eq("guardian_id", guardian.id)
        .order("created_at")
    : { data: [] };

  const children = (rows ?? [])
    .map((r) => r.students as unknown as { business_code: string; full_name: string; gender: "L" | "P"; status: string } | null)
    .filter(Boolean) as { business_code: string; full_name: string; gender: "L" | "P"; status: string }[];

  return (
    <div>
      <PageHeader
        title="Data Saya"
        description={`Data ${terms.santri.toLowerCase()} yang terhubung dengan akun ini.`}
      />

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-0 py-0">
          {children.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-5">Nama</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead className="px-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {children.map((c) => (
                  <TableRow key={c.business_code}>
                    <TableCell className="px-5 font-medium">{c.full_name}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">{genderLabel(c.gender)}</TableCell>
                    <TableCell className="px-5"><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Baby /></EmptyMedia>
                <EmptyTitle>Data belum bisa ditampilkan.</EmptyTitle>
                <EmptyDescription>
                  Ini seharusnya otomatis terhubung. Coba muat ulang halaman, atau hubungi
                  Admin/Developer bila terus berlanjut.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
