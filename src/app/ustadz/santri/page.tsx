import { GraduationCap } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { getTeacherStudentsDetailed } from "@/lib/teacher-students";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { StatusBadge } from "@/components/status-badge";
import { WaChatButton } from "@/components/santri/wa-chat-button";
import { genderLabel } from "@/lib/roles";
import { getTerminology } from "@/lib/terminology";

export const metadata = { title: "Santri Halaqah Saya" };

type BinaanRow = {
  id: string | null;
  business_code: string | null;
  nis: string | null;
  nisn: string | null;
  full_name: string;
  nickname: string | null;
  gender: "L" | "P";
  status: "ACTIVE" | "INACTIVE";
  guardian_name: string | null;
  guardian_whatsapp: string | null;
  halaqah_name: string | null;
};

export default async function UstadzSantriPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/santri");
  const terms = await getTerminology(profile.tenantId);

  // V12.10: data binaan lengkap via helper bersama — RPC SECURITY DEFINER
  // `teacher_students_list` + fallback baca langsung jalur halaqah (RLS
  // tenant-scoped) bila RPC gagal/kosong.
  const students = await getTeacherStudentsDetailed();

  return (
    <div>
      <PageHeader
        title={`${terms.santri} Halaqah Saya`}
        description={`${terms.santri} di halaqah yang Anda ampu — 1 guru bisa mengampu lebih dari 1 halaqah.`}
      />

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-0 py-0">
          {students.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 px-3">No.</TableHead>
                    <TableHead className="px-5">NIS</TableHead>
                    <TableHead>NISN</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Panggilan</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>{terms.halaqah}</TableHead>
                    <TableHead>Wali</TableHead>
                    <TableHead>No. WA Wali</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="px-5 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s, i) => (
                    <TableRow key={s.id}>
                      <TableCell className="px-3 text-muted-foreground text-xs">{i + 1}</TableCell>
                      <TableCell className="px-5 font-mono text-xs text-muted-foreground">{s.nis ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.nisn ?? "—"}</TableCell>
                      <TableCell className="font-medium">{s.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.nickname ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{genderLabel(s.gender)}</TableCell>
                      <TableCell>
                        {s.halaqah_name ? (
                          <Badge variant="secondary" className="font-medium">{s.halaqah_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.guardian_name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.guardian_whatsapp ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell className="px-5">
                        <div className="flex items-center justify-end">
                          <WaChatButton
                            number={s.guardian_whatsapp}
                            studentName={s.full_name}
                            senderLabel="ustadz/ustadzah halaqah"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GraduationCap /></EmptyMedia>
                <EmptyTitle>Belum ada santri di halaqah Anda.</EmptyTitle>
                <EmptyDescription>
                  Anda akan melihat santri di sini setelah admin menetapkan Anda sebagai pengampu halaqah.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
