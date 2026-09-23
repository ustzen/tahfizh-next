import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/section";
import { AuditLogList } from "@/components/settings/audit-log-list";
import { getAuditLog } from "@/app/actions/audit-log";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Pengaturan · Log Aktivitas" };

/**
 * V12.13 — Log Aktivitas lembaga (audit trail).
 * Merekam siapa mengubah apa dan kapan: pengaturan lembaga (terminologi,
 * identitas, pimpinan) dan aksi halaqah. Read-only, dibatasi 100 terbaru.
 */
export default async function AuditLogPage() {
  await requireRole(["ADMIN"], "/admin/pengaturan/audit");
  const rows = await getAuditLog(100);

  return (
    <div>
      <PageHeader
        title="Log Aktivitas"
        description="Jejak perubahan pengaturan lembaga — siapa, apa, dan kapan."
      />
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle>100 Perubahan Terbaru</CardTitle>
          <CardDescription>
            Tercatat otomatis saat pengaturan lembaga diubah. Entri tidak dapat dihapus atau diedit.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <AuditLogList rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
