import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getAdminHalaqahList } from "@/lib/halaqah";
import { getTerminology } from "@/lib/terminology";
import { HalaqahCard } from "@/components/halaqah/halaqah-card";

export const metadata = { title: "Halaqah" };

/**
 * TAHFIZH V8 — Koordinator: lihat seluruh halaqah lembaga + pengampu + anggota
 * + presensi + rekap (rule #5). TANPA supervisi (rule #61) dan tanpa CRUD.
 */
export default async function KoordinatorHalaqahPage() {
  const profile = await requireRole(["KOORDINATOR"], "/koordinator/halaqah");
  const [list, terms] = await Promise.all([getAdminHalaqahList(), getTerminology(profile.tenantId)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={terms.halaqah}
        description={`${list.length} ${terms.halaqah.toLowerCase()} di lembaga Anda.`}
      />
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Belum ada {terms.halaqah.toLowerCase()}.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((h, i) => (
            <HalaqahCard
              key={h.id}
              item={h}
              index={i}
              studentLabel={terms.santri}
              href={`/koordinator/halaqah/${h.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
