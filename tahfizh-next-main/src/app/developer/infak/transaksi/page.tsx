import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getDevTransactions } from "@/lib/v10";
import { DevTransactionsTable } from "@/components/infak/dev-transactions-table";

export const metadata = { title: "Transaksi Infak" };

export default async function DeveloperInfakTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireRole(["DEVELOPER"], "/developer/infak/transaksi");
  const { status = "ALL", q = "" } = await searchParams;
  const rows = await getDevTransactions(status, q);

  return (
    <div>
      <PageHeader
        title="Transaksi Infak"
        description="Seluruh transaksi pembayaran infak dari semua lembaga."
      />
      <DevTransactionsTable rows={rows} status={status} query={q} />
    </div>
  );
}
