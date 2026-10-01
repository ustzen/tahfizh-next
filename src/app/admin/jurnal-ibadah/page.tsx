import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IbadahCatalogManager } from "@/components/ibadah/ibadah-catalog-manager";
import { IbadahRekapCard } from "@/components/ibadah/ibadah-rekap-card";
import { getIbadahRekapGuru } from "@/lib/ibadah";
import type { IbadahActivity } from "@/components/ibadah/ibadah-journal";

export const metadata: Metadata = { title: "Jurnal Ibadah" };

type ActivityRow = { id: string; label: string; icon: string; tone: string; is_builtin: boolean };

/**
 * TAHFIZH V57 — Jurnal Ibadah admin: rekap ibadah seluruh santri lembaga +
 * kelola katalog kegiatan dalam satu menu.
 */
export default async function AdminJurnalIbadahPage() {
  await requireRole(["ADMIN", "KOORDINATOR"], "/admin/jurnal-ibadah");
  const [supabase, rekap] = await Promise.all([
    createClient(),
    getIbadahRekapGuru(30),
  ]);
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
        description="Rekap ibadah seluruh santri lembaga 30 hari terakhir, plus pengaturan kegiatan yang dicentang santri."
      />
      <IbadahRekapCard rows={rekap} days={30} manageHref={null} />
      <IbadahCatalogManager activities={activities} />
    </div>
  );
}
