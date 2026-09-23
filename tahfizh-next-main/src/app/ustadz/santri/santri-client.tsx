"use client";

import { useMemo, useState } from "react";
import { GraduationCap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WaChatButton } from "@/components/santri/wa-chat-button";
import { genderLabel } from "@/lib/roles";
import type { TeacherStudentRow } from "@/lib/teacher-students";

const ALL_HALAQAH = "ALL";

/**
 * TAHFIZH V21.2 — Filter Halaqah pada Data Santri (guru).
 *
 * Berguna terutama untuk guru yang mengampu lebih dari satu halaqah: tanpa
 * filter, tabel mencampur santri dari semua halaqah dan sulit dipilah.
 * Pilihan halaqah dibangun dari data santri itu sendiri (bukan RPC kedua)
 * supaya daftar filter selalu sinkron dengan apa yang benar-benar tampil.
 */
export function SantriClient({
  students,
  santriLabel,
  halaqahLabel,
}: {
  students: TeacherStudentRow[];
  santriLabel: string;
  halaqahLabel: string;
}) {
  const halaqahOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of students) {
      if (s.halaqah_id && !seen.has(s.halaqah_id)) {
        seen.set(s.halaqah_id, s.halaqah_name ?? "(Tanpa nama)");
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const [selected, setSelected] = useState<string>(ALL_HALAQAH);

  const filtered = useMemo(() => {
    if (selected === ALL_HALAQAH) return students;
    return students.filter((s) => s.halaqah_id === selected);
  }, [students, selected]);

  // Filter hanya relevan bila guru punya >1 halaqah — sembunyikan bila cuma 1.
  const showFilter = halaqahOptions.length > 1;

  return (
    <div className="space-y-4">
      {showFilter && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter {halaqahLabel.toLowerCase()}:</span>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_HALAQAH}>Semua {halaqahLabel.toLowerCase()}</SelectItem>
              {halaqahOptions.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground/80">
            {filtered.length} dari {students.length} {santriLabel.toLowerCase()}
          </span>
        </div>
      )}

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-0 py-0">
          {filtered.length > 0 ? (
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
                    <TableHead>{halaqahLabel}</TableHead>
                    <TableHead>Wali</TableHead>
                    <TableHead className="px-5 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s, i) => (
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
                      <TableCell className="text-muted-foreground">
                        <div className="leading-tight">
                          <div>{s.guardian_name ?? "—"}</div>
                          {s.guardian_whatsapp && (
                            <div className="mt-0.5 font-mono text-xs text-muted-foreground/70">
                              {s.guardian_whatsapp}
                            </div>
                          )}
                        </div>
                      </TableCell>
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
                <EmptyTitle>
                  {students.length === 0
                    ? `Belum ada ${santriLabel.toLowerCase()} di halaqah Anda.`
                    : `Tidak ada ${santriLabel.toLowerCase()} di halaqah ini.`}
                </EmptyTitle>
                <EmptyDescription>
                  {students.length === 0
                    ? `Anda akan melihat ${santriLabel.toLowerCase()} di sini setelah admin menetapkan Anda sebagai pengampu halaqah.`
                    : `Coba pilih ${halaqahLabel.toLowerCase()} lain, atau lihat "Semua ${halaqahLabel.toLowerCase()}".`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
