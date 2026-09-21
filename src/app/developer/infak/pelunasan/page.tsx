import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getDevArrears } from "@/lib/v10";
import { DevSettlePanel } from "@/components/infak/dev-settle-panel";

export const metadata = { title: "Pelunasan Infak" };

/**
 * DEVELOPER — melunasi tagihan infak pengembangan santri (pembayaran diterima
 * di luar aplikasi) sekaligus mencatat DIBAYARKAN OLEH SIAPA.
 */
export default async function DeveloperInfakSettlePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tenant?: string }>;
}) {
  await requireRole(["DEVELOPER"], "/developer/infak/pelunasan");
  const { q = "", tenant = "" } = await searchParams;
  const data = await getDevArrears(q, tenant);

  return (
    <div>
      <PageHeader
        title="Pelunasan Infak"
        description="Lunasi tagihan santri yang pembayarannya diterima di luar aplikasi, lalu catat siapa yang membayarkan."
        action={
          <Button asChild variant="outline">
            <Link href="/developer/infak">
              <ArrowLeft className="size-4" /> Kembali
            </Link>
          </Button>
        }
      />
      <DevSettlePanel data={data} query={q} tenantId={tenant} />
    </div>
  );
}
