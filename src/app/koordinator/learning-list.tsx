import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { genderLabel } from "@/lib/roles";
import { learningStatusLabel, learningStatusStyle } from "@/lib/learning-shared";
import { BookOpenText, HandHeart } from "lucide-react";

/**
 * TAHFIZH V12.7 — Menu Hadits & Doa Harian untuk KOORDINATOR.
 *
 * Daftar seluruh santri lembaga (via RPC SECURITY DEFINER
 * `students_manager_list`) + ringkasan penilaian hadits/doa terakhir.
 * Koordinator membuka detail untuk menambah penilaian (mode bebas:
 * Centang/Huruf/Angka) — RPC v2 sudah mengizinkan role KOORDINATOR.
 */

const COLUMN_HEAD_COLORS = [
  "text-sky-700",
  "text-emerald-700",
  "text-violet-700",
  "text-amber-700",
  "text-rose-700",
  "text-teal-700",
];

function ColoredHead({ label, index, className }: { label: string; index: number; className?: string }) {
  return (
    <TableHead className={`${COLUMN_HEAD_COLORS[index % COLUMN_HEAD_COLORS.length]} font-bold ${className ?? ""}`}>
      {label}
    </TableHead>
  );
}

type ManagerRow = {
  id: string;
  full_name: string;
  nickname: string | null;
  gender: "L" | "P";
  status: "ACTIVE" | "INACTIVE";
  halaqah_name: string | null;
};

async function loadModuleSummaries(module: "HADITS" | "DOA") {
  const supabase = await createClient();
  const rpc = await supabase.rpc("students_manager_list");
  if (rpc.error || !rpc.data) return [];
  const rows = rpc.data as (ManagerRow & { halaqah_id: string | null })[];

  // Ringkasan penilaian terakhir per santri untuk modul ini (tenant-scoped).
  const ids = rows.map((r) => r.id);
  const summaries = new Map<string, { material: string | null; status: string | null; scoreLabel: string | null; scoreValue: number | null }>();
  if (ids.length > 0) {
    const { data: assess } = await supabase
      .from("learning_assessments")
      .select("student_id, status, score_label, score_value, hadith_id, prayer_id, tajwid_id, assessed_date")
      .eq("module_type", module)
      .in("student_id", ids)
      .is("deleted_at", null)
      .order("assessed_date", { ascending: false })
      .limit(1000);
    for (const a of assess ?? []) {
      const key = a.student_id as string;
      if (!summaries.has(key)) {
        let material: string | null = null;
        const mid = (a.hadith_id ?? a.prayer_id ?? a.tajwid_id) as string | null;
        if (mid) {
          const table = module === "HADITS" ? "hadith_materials" : "daily_prayer_materials";
          const { data: m } = await supabase.from(table).select("title").eq("id", mid).maybeSingle();
          material = m?.title ?? null;
        }
        summaries.set(key, {
          material,
          status: (a.status as string) ?? null,
          scoreLabel: (a.score_label as string | null) ?? null,
          scoreValue: (a.score_value as number | null) ?? null,
        });
      }
    }
  }
  return rows.map((r) => ({ ...r, summary: summaries.get(r.id) ?? null }));
}

export function LearningManagerList({ module }: { module: "HADITS" | "DOA" }) {
  return <LearningManagerListAsync module={module} />;
}

async function LearningManagerListAsync({ module }: { module: "HADITS" | "DOA" }) {
  const profile = await requireRole(["KOORDINATOR"], module === "HADITS" ? "/koordinator/hadits" : "/koordinator/doa");
  const terms = await getTerminology(profile.tenantId);
  const rows = await loadModuleSummaries(module);

  const label = module === "HADITS" ? "Hadits" : "Doa Harian";
  const Icon = module === "HADITS" ? BookOpenText : HandHeart;
  const href = module === "HADITS" ? "/koordinator/hadits" : "/koordinator/doa";

  return (
    <div>
      <PageHeader
        title={label}
        description={`Penilaian ${label.toLowerCase()} ${terms.santri.toLowerCase()} lembaga Anda — klik "Nilai" untuk menambah penilaian (mode Centang/Huruf/Angka bebas dipilih).`}
      />

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-0 py-0">
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <ColoredHead index={0} label={`Nama ${terms.santri}`} className="px-5" />
                    <ColoredHead index={1} label={terms.halaqah} />
                    <ColoredHead index={2} label={`${label} Terakhir`} />
                    <ColoredHead index={3} label="Nilai" />
                    <ColoredHead index={4} label="Status" />
                    <ColoredHead index={5} label="Santri" />
                    <TableHead className="px-5 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="px-5 font-medium text-foreground">
                        <div className="flex flex-col">
                          <span>{s.full_name}</span>
                          <span className="text-muted-foreground text-xs">{genderLabel(s.gender)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.halaqah_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.summary?.material ?? "Belum ada"}</TableCell>
                      <TableCell>
                        {s.summary?.scoreLabel || s.summary?.scoreValue !== null ? (
                          <span className="bg-gradient-brand inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                            {s.summary?.scoreLabel ?? s.summary?.scoreValue}
                          </span>
                        ) : s.summary?.status ? (
                          <span className="text-muted-foreground">✓</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.summary?.status ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${learningStatusStyle(s.summary.status)}`}
                          >
                            {learningStatusLabel(s.summary.status)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell className="px-5 text-right">
                        <Button asChild size="sm" variant="outline" className="h-8">
                          <a href={`${href}/${s.id}`}>Nilai</a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Icon /></EmptyMedia>
                <EmptyTitle>Belum ada data santri.</EmptyTitle>
                <EmptyDescription>
                  Tambahkan santri terlebih dahulu di menu Data Santri.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
