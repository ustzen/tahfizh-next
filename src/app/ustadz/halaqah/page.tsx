import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getTeacherHalaqahList } from "@/lib/halaqah";
import { HalaqahCard } from "@/components/halaqah/halaqah-card";
import { getTerminology } from "@/lib/terminology";

export const metadata = { title: "Halaqah Saya" };

/** TAHFIZH V8 — halaqah yang diampu guru (rule #6). */
export default async function UstadzHalaqahPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/halaqah");
  const [list, terms] = await Promise.all([getTeacherHalaqahList(), getTerminology(profile.tenantId)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${terms.halaqah} Saya`}
        description={`${list.length} ${terms.halaqah.toLowerCase()} yang Anda ampu.`}
      />
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Belum ada {terms.halaqah.toLowerCase()}. Anda akan muncul di sini setelah admin menetapkan Anda
          sebagai pengampu.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((h, i) => (
            <HalaqahCard
              key={h.id}
              item={h}
              index={i}
              studentLabel={terms.santri}
              href={`/ustadz/halaqah/${h.id}`}
              showStatus={false}
              isPrimary={h.isPrimary}
            />
          ))}
        </div>
      )}
    </div>
  );
}
