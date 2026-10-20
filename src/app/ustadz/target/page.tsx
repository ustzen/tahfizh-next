import { Target as TargetIcon } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTargetCatalog, getTargetOverview } from "@/lib/target-halaqah";
import { getSantriTargetOverview } from "@/lib/target-santri";
import type { TargetCatalogItem, TargetCategory } from "@/lib/target-shared";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { TargetClient } from "./target-client";
import { TargetSantriSection } from "./target-santri";

export const metadata = { title: "Target" };

/**
 * TAHFIZH V17 — Menu Target guru: target diatur PER HALAQAH (bukan per santri).
 *
 * Setiap halaqah yang diampu punya 3 target: Tahfidz Al-Qur'an, Hadits, dan
 * Doa. Target lama per santri sudah dihapus total.
 */
export default async function TargetPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/target");
  const terms = await getTerminology(profile.tenantId);
  const [overview, santriOverview] = await Promise.all([
    getTargetOverview(),
    getSantriTargetOverview(),
  ]);

  // V54/55 — katalog acuan per jenis untuk picker & kelola (semua item,
  // termasuk nonaktif, supaya guru bisa menampilkan lagi).
  const [surah, hadits, doa] = await Promise.all([
    getTargetCatalog("TAHFIDZ", true),
    getTargetCatalog("HADITS", true),
    getTargetCatalog("DOA", true),
  ]);
  const catalog: Record<TargetCategory, TargetCatalogItem[]> = {
    TAHFIDZ: surah,
    HADITS: hadits,
    DOA: doa,
  };

  return (
    <div>
      <PageHeader
        title="Target"
        description={`Atur target PER HALAQAH atau PER ${terms.santri.toUpperCase()} (bisa banyak ${terms.santri.toLowerCase()} sekaligus). Target per ${terms.santri.toLowerCase()} menimpa target halaqahnya.`}
        action={
          <span className="bg-gradient-brand inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-card">
            <TargetIcon className="size-4" />
            {overview.targets.length} Target Diatur
          </span>
        }
      />
      <TargetClient
        halaqah={overview.halaqah}
        targets={overview.targets}
        catalog={catalog}
        santriLabel={terms.santri}
      />
      {/* V70 — target khusus untuk santri tertentu (bisa banyak sekaligus). */}
      <TargetSantriSection
        binaan={santriOverview.binaan}
        targets={santriOverview.targets}
        groups={santriOverview.groups}
        catalog={catalog}
        santriLabel={terms.santri}
      />
    </div>
  );
}
