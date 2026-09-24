import Link from "next/link";
import { AudioLines } from "lucide-react";

import { requireRole } from "@/lib/auth";
import {
  getActiveTartilConfig,
  getTartilMethods,
  getTartilStudentSummaries,
  getTartilTeacherForSession,
  type NoteTemplate,
} from "@/lib/tartil";
import { getTerminology } from "@/lib/terminology";
import { TartilJurnalForm } from "./tartil-jurnal";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { genderLabel } from "@/lib/roles";

export const metadata = { title: "Tartil" };

export default async function UstadzTartilPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/tartil");
  const terms = await getTerminology(profile.tenantId);
  const teacher = await getTartilTeacherForSession();
  const [summaries, config, methods] = await Promise.all([
    teacher ? getTartilStudentSummaries(teacher.id) : Promise.resolve([]),
    profile.tenantId ? getActiveTartilConfig(profile.tenantId) : Promise.resolve(null),
    getTartilMethods(),
  ]);

  return (
    <div>
      <PageHeader
        title="Tartil"
        description={`Jurnal mengaji ${terms.santri.toLowerCase()} halaqah Anda — pilih santri, catat jilid & halaman, lalu beri nilai.`}
      />

      {/* V12.14 — JURNAL MENGAJI: form penilaian utama (sesuai desain guru) */}
      {config && teacher && (
        <Card className="shadow-card rounded-2xl">
          <CardContent className="pt-6">
            <TartilJurnalForm
              students={summaries.map((s) => ({
                studentId: s.studentId,
                fullName: s.fullName,
                nis: s.nis,
              }))}
              materials={config.materials.map((m) => ({ id: m.id, name: m.name }))}
              methods={methods.map((m) => ({ id: m.id, name: m.name, jilidCount: m.jilidCount }))}
              grades={config.grades.map((g) => ({ label: g.label, minValue: g.minValue, maxValue: g.maxValue }))}
              mode={config.mode}
              templates={config.templates.map((t: NoteTemplate) => ({ id: t.id, slot: t.slot, content: t.content }))}
            />
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card mt-6 rounded-2xl">
        <CardContent className="px-0 py-0">
          {summaries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nama {terms.santri}</TableHead>
                  <TableHead>Tartil Terakhir</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead className="px-5">Status</TableHead>
                  <TableHead className="pr-5 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow key={s.studentId}>
                    <TableCell className="px-5 font-medium text-foreground">
                      <div className="flex flex-col">
                        <span>{s.fullName}</span>
                        <span className="text-muted-foreground text-xs">{genderLabel(s.gender)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.lastMaterial ? (
                        <>
                          {s.lastMaterial}
                          {s.lastPages ? (
                            <span className="text-muted-foreground"> · Hal. {s.lastPages}</span>
                          ) : null}
                        </>
                      ) : (
                        "Belum ada"
                      )}
                    </TableCell>
                    <TableCell>
                      {s.lastScoreLabel ? (
                        <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                          {s.lastScoreLabel}
                        </span>
                      ) : s.lastScoreValue !== null ? (
                        <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                          {s.lastScoreValue}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-5">
                      <StatusBadge status={s.studentStatus} />
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button asChild size="sm" variant="outline" className="h-8">
                        <Link href={`/ustadz/tartil/${s.studentId}`}>Lihat</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><AudioLines /></EmptyMedia>
                <EmptyTitle>Belum ada penilaian Tartil.</EmptyTitle>
                <EmptyDescription>
                  {terms.santri} halaqah Anda akan muncul di sini setelah admin menetapkan Anda sebagai pengampu halaqah.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
