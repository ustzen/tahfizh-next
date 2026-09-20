import { ArrowRight, Building2, HandCoins, LayoutDashboard, MessageSquareText } from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { getDevV10Stats } from "@/lib/v10";
import { rupiah } from "@/lib/v10-shared";

export const metadata = { title: "Developer Dashboard" };

export default async function DeveloperDashboardPage() {
  const profile = await requireRole(["DEVELOPER"], "/developer");
  const supabase = await createClient();

  const [{ count: tenantCount }, { count: activeCount }, { count: inactiveCount }, { count: userCount }] =
    await Promise.all([
      supabase.from("tenants").select("id", { count: "exact", head: true }),
      supabase.from("tenants").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
      supabase.from("tenants").select("id", { count: "exact", head: true }).eq("status", "INACTIVE"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
    ]);

  const { data: recent } = await supabase
    .from("tenants")
    .select("id, business_code, name, kind, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  // V10 (rule #63): platform-wide infak + feedback stats.
  const stats = await getDevV10Stats();

  return (
    <div>
      <PageHeader
        title="Dashboard Platform"
        description="Ringkasan seluruh lembaga dan pengguna TAHFIZH."
        icon={<LayoutDashboard className="size-6" />}
        action={
          <Button asChild variant="role">
            <Link href="/developer/lembaga">Kelola Lembaga</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="tenant" label="Total Lembaga" value={tenantCount ?? 0} />
        <StatCard
          icon="paid"
          label="Lembaga Aktif"
          value={activeCount ?? 0}
          hint={`dari ${tenantCount ?? 0} lembaga`}
          progress={tenantCount ? ((activeCount ?? 0) / tenantCount) * 100 : 0}
        />
        <StatCard icon="inactive" label="Lembaga Nonaktif" value={inactiveCount ?? 0} />
        <StatCard icon="user" label="Total User" value={userCount ?? 0} />
      </div>

      {/* V10 (rule #63): infak & masukan platform */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="invoice" label="Transaksi Infak" value={stats?.transactions ?? 0} hint={`${stats?.invoices ?? 0} tagihan dibuat`} />
        <StatCard icon="wallet" label="Total Infak Terkumpul" value={rupiah(stats?.paidTotal ?? 0)} hint={`${stats?.paidInvoices ?? 0} tagihan lunas`} />
        <StatCard icon="feedback" label="Masukan Baru" value={stats?.feedbackNew ?? 0} hint={`dari ${stats?.feedbackAll ?? 0} total masukan`} />
        <StatCard
          icon="paid"
          label="Tagihan Lunas"
          value={stats?.paidInvoices ?? 0}
          hint={`dari ${stats?.invoices ?? 0} tagihan`}
          progress={stats?.invoices ? ((stats?.paidInvoices ?? 0) / stats.invoices) * 100 : 0}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <CardBox>
          <SectionTitle
            tone="emerald"
            icon={<HandCoins />}
            title="Infak Pengembangan"
            description="Model pendanaan platform — Rp1.000/bulan per santri"
          />
          <p className="tabular mt-4 text-3xl font-bold text-emerald-600 dark:text-emerald-400">{rupiah(stats?.paidTotal ?? 0)}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Terkumpul dari seluruh lembaga. Tagihan dibuat otomatis setiap tanggal 1, batas pembayaran tanggal 15.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/developer/infak">Kelola Infak</Link>
          </Button>
        </CardBox>

        <CardBox>
          <SectionTitle
            tone="rose"
            icon={<MessageSquareText />}
            title="Kritik & Saran"
            description="Masukan yang ditujukan ke Developer"
          />
          <p className="tabular mt-4 text-3xl font-bold text-rose-600 dark:text-rose-400">
            {stats?.feedbackNew ?? 0} <span className="text-muted-foreground text-base font-medium">baru</span>
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/developer/saran">Buka Kotak Masukan</Link>
          </Button>
        </CardBox>
      </div>

      <CardBox className="mt-6">
        <SectionTitle
          className="mb-4"
          tone="blue"
          icon={<Building2 />}
          title="Lembaga Terbaru"
          description="5 lembaga yang terakhir mendaftar"
          action={
            <Link
              href="/developer/lembaga"
              className="text-role-strong inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              Lihat semua <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        {recent && recent.length > 0 ? (
          <ul className="divide-y">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span className="bg-role-soft text-role-strong flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold">
                  {t.name?.[0]?.toUpperCase() ?? "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {t.business_code} · {formatDate(t.created_at)}
                  </p>
                </div>
                <Badge variant={t.status === "ACTIVE" ? "success" : "neutral"}>
                  {t.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">Belum ada lembaga terdaftar.</p>
        )}
      </CardBox>
    </div>
  );
}
