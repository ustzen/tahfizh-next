import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getJournalTeacherEntries, getJournalTeacherTemplates } from "@/lib/v7";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JournalListClient } from "./journal-list";

export const metadata = { title: "Custom Jurnal" };

export default async function JurnalPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/jurnal");
  const terms = await getTerminology(profile.tenantId);

  const [templates, entries] = await Promise.all([
    getJournalTeacherTemplates(),
    getJournalTeacherEntries(),
  ]);

  return (
    <div>
      <PageHeader
        title="Custom Jurnal"
        description={`Catat aktivitas di luar modul standar — template disiapkan Admin lembaga.`}
        action={
          templates.length > 0 ? (
            <Button asChild size="sm">
              <Link href="/ustadz/jurnal/isi">
                <Plus className="size-4" /> Tulis Jurnal
              </Link>
            </Button>
          ) : undefined
        }
      />

      {templates.length === 0 ? (
        <Card className="shadow-card rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-role-soft text-role">
              <NotebookPen className="size-6" />
            </span>
            <p className="font-semibold text-foreground">Belum ada template jurnal.</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Admin lembaga perlu membuat template terlebih dahulu di Pengaturan → Custom Jurnal.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {templates.map((t) => (
              <Badge
                key={t.id}
                variant="outline"
                className="border-role/25 bg-role-soft px-3 py-1.5 text-xs font-semibold text-role-strong"
              >
                {t.name}
                {t.showInAchievement ? " · ⭐ Kartu Prestasi" : ""}
              </Badge>
            ))}
          </div>
          <JournalListClient entries={entries} santriLabel={terms.santri} />
        </>
      )}
    </div>
  );
}
