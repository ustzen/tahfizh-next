import { Target as TargetIcon } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTargetTeacherList } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { TargetListClient } from "./target-list";

export const metadata = { title: "Target" };

export default async function TargetPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/target");
  const terms = await getTerminology(profile.tenantId);
  const targets = await getTargetTeacherList();

  return (
    <div>
      <PageHeader
        title="Target"
        description={`Arahkan pencapaian ${terms.santri.toLowerCase()} — progress dari data penilaian atau diperbarui manual.`}
        action={
          <span className="bg-gradient-brand inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-card">
            <TargetIcon className="size-4" />
            {targets.length} Target
          </span>
        }
      />
      <TargetListClient targets={targets} santriLabel={terms.santri} />
    </div>
  );
}
