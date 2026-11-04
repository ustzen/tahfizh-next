import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IbadahCatalogManager } from "@/components/ibadah/ibadah-catalog-manager";
import { IbadahHarianTable } from "@/components/ibadah/ibadah-harian-table";
import { IbadahRekapCard } from "@/components/ibadah/ibadah-rekap-card";
import { getIbadahRekapGuru, getIbadahRekapHarian } from "@/lib/ibadah";
import type { IbadahActivity } from "@/components/ibadah/ibadah-journal";

export const metadata: Metadata = { title: "Jurnal Ibadah" };

type ActivityRow = {
  id: string;
  label: string;
  icon: string;
  tone: string;
  is_builtin: boolean;
  is_active: boolean;
};

/** Tanggal hari ini (YYYY-MM-DD) zona Asia/Jakarta. */
function todayJakarta(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/**
 * TAHFIZH V57 — Jurnal Ibadah guru: rekap ibadah santri binaan (bahan
 * evaluasi halaqah) + kelola katalog kegiatan.
 * TAHFIZH V83 — tambah tabel ibadah harian per santri (✓/✗ per kegiatan) yang
 * bisa dibuka untuk tanggal sebelumnya via ?tanggal=YYYY-MM-DD.
 */
export default async function UstadzJurnalIbadahPage({
  searchParams,
}: {
  searchParams: Promise<{ tanggal?: string }>;
}) {
  await requireRole(["USTADZ"], "/ustadz/jurnal-ibadah");

  const sp = await searchParams;
  const today = todayJakarta();
  const raw = sp.tanggal ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;

  const [supabase, rekap, harian] = await Promise.all([
    createClient(),
    getIbadahRekapGuru(30),
    getIbadahRekapHarian(date),
  ]);
  const { data } = await supabase.rpc("ibadah_activities_list");
  const rows = (data ?? []) as ActivityRow[];

  const activities: IbadahActivity[] = rows.map((a) => ({
    id: a.id,
    label: a.label,
    icon: a.icon,
    tone: a.tone,
    isBuiltin: a.is_builtin,
  }));
  // Kolom tabel harian: hanya kegiatan aktif.
  const activeActivities = rows
    .filter((a) => a.is_active)
    .map((a) => ({ id: a.id, label: a.label }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jurnal Ibadah"
        description="Tabel ibadah harian santri binaan (bisa lihat hari sebelumnya), rekap 30 hari terakhir untuk evaluasi halaqah, plus pengaturan kegiatan yang dicentang santri."
      />
      <IbadahHarianTable
        rows={harian.rows}
        activities={activeActivities}
        date={date}
        today={today}
        rpcReady={harian.ok}
      />
      <IbadahRekapCard rows={rekap} days={30} manageHref={null} />
      <IbadahCatalogManager activities={activities} />
    </div>
  );
}
