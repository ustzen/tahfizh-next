import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IbadahCatalogManager } from "@/components/ibadah/ibadah-catalog-manager";
import type { IbadahActivity } from "@/components/ibadah/ibadah-journal";

export const metadata: Metadata = { title: "Jurnal Ibadah" };

type ActivityRow = { id: string; label: string; icon: string; tone: string; is_builtin: boolean };

/** TAHFIZH V51 — Kelola katalog kegiatan Jurnal Ibadah (admin/koordinator). */
export default async function AdminJurnalIbadahPage() {
  await requireRole(["ADMIN", "KOORDINATOR"], "/admin/jurnal-ibadah");
  const supabase = await createClient();
  const { data } = await supabase.rpc("ibadah_activities_list");

  const activities: IbadahActivity[] = ((data ?? []) as ActivityRow[]).map((a) => ({
    id: a.id,
    label: a.label,
    icon: a.icon,
    tone: a.tone,
    isBuiltin: a.is_builtin,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jurnal Ibadah"
        description="Atur kegiatan ibadah harian yang dicentang santri — sholat 5 waktu, dhuha, muraja'ah, tilawah, atau kegiatan lain milik lembaga."
      />
      <IbadahCatalogManager activities={activities} />
    </div>
  );
}
