import { Target as TargetIcon } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTargetOverview } from "@/lib/target-halaqah";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { TargetClient } from "./target-client";

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
  const overview = await getTargetOverview();

  return (
    <div>
      <PageHeader
        title="Target"
        description={`Atur target untuk setiap halaqah — bukan per ${terms.santri.toLowerCase()}. Ada 3 target: Tahfidz Al-Qur'an, Hadits, dan Doa.`}
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
        santriLabel={terms.santri}
      />
    </div>
  );
}
