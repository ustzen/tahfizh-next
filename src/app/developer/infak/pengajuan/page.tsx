import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getDevWaiverRequests } from "@/lib/v10";
import { DevWaiverPanel } from "@/components/infak/dev-waiver-panel";

export const metadata = { title: "Pengajuan Tidak Mampu" };

/**
 * DEVELOPER — meninjau pengajuan tidak mampu (keringanan infak) dari wali
 * santri: lihat surat keterangan, lalu setujui (gratis N bulan) atau tolak.
 */
export default async function DeveloperInfakWaiverPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireRole(["DEVELOPER"], "/developer/infak/pengajuan");
  const { status = "PENDING", q = "" } = await searchParams;
  const requests = await getDevWaiverRequests(status, q);

  return (
    <div>
      <PageHeader
        title="Pengajuan Tidak Mampu"
        description="Tinjau permohonan keringanan infak dari wali santri. Setujui untuk menggratiskan infak santri dalam kurun waktu tertentu."
        action={
          <Button asChild variant="outline">
            <Link href="/developer/infak">
              <ArrowLeft className="size-4" /> Kembali
            </Link>
          </Button>
        }
      />
      <DevWaiverPanel requests={requests} status={status} query={q} />
    </div>
  );
}
