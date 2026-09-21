import { GraduationCap, Users2 } from "lucide-react";
import Link from "next/link";

import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, SectionTitle } from "@/components/dashboard/section";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { StatusBadge } from "@/components/status-badge";
import { genderLabel } from "@/lib/roles";
import { getTerminology } from "@/lib/terminology";
import { getActiveYear } from "@/lib/akademik";
import { TeacherDialog } from "./teacher-form";
import { StudentDialog } from "./student-form";
import { DeleteRowButton } from "./delete-buttons";
import { ExportButton, ImportDialog } from "./import-export";
import { WaChatButton } from "@/components/santri/wa-chat-button";

/**
 * TAHFIZH V12 — Data Guru & Data Santri (DIPISAH per menu).
 * Dipakai bersama oleh route ADMIN (/admin/guru, /admin/santri) dan
 * KOORDINATOR (/koordinator/guru, /koordinator/santri). Data + auth selalu
 * dari session; route hanya pembungkus role.
 */

/**
 * Judul kolom tabel. Warna berbeda per kolom kini diterapkan otomatis oleh
 * <TableHead> (lihat globals.css), jadi cukup meneruskan label.
 */
function ColoredHead({ label, className }: { label: string; index?: number; className?: string }) {
  return <TableHead className={`font-bold ${className ?? ""}`}>{label}</TableHead>;
}

async function loadBase() {
  const session = await getSessionProfile();
  if (!session?.tenantId) return null;
  const supabase = await createClient();
  const tid = session.tenantId;

  const [terms, activeYear, { data: halaqahCodes }] = await Promise.all([
    getTerminology(tid),
    getActiveYear(),
    supabase.from("halaqahs").select("id, business_code, name").eq("tenant_id", tid).order("business_code"),
  ]);
  return {
    session,
    supabase,
    tid,
    terms,
    lembaga: session.tenantName ?? "TAHFIZH",
    tahunAjaran: activeYear?.name ?? null,
    // V14 — import santri mencocokkan berdasarkan NAMA halaqah (bukan kode),
    // tanpa peka huruf besar/kecil (rule: "ALIF" = "Alif" = "alif").
    halaqahHint: (halaqahCodes ?? []).map((h) => h.name as string),
    halaqahRows: halaqahCodes ?? [],
  };
}

/** -------------------------------------------------------------- DATA GURU */
export async function GuruManager() {
  const base = await loadBase();
  if (!base) return null;
  const { supabase, tid, terms, lembaga, tahunAjaran } = base;

  // V12: "Santri binaan" = anggota halaqah yang diampu guru (lihat migration
  // 20260915150000). Kolom tabel kini menampilkan halaqah yang diampu.
  // V12.5 FIX: data guru dibaca lewat RPC SECURITY DEFINER
  // `teachers_manager_list` — sebelumnya query langsung gagal (tabel kosong)
  // bila migration kolom nickname/login_username belum di-run di database.
  type TeacherRow = {
    id: string; business_code: string; full_name: string;
    nickname: string | null; login_username: string | null;
    gender: "L" | "P"; whatsapp: string | null; status: "ACTIVE" | "INACTIVE";
  };
  let teachers: TeacherRow[] | null = null;
  const tRpc = await supabase.rpc("teachers_manager_list");
  if (!tRpc.error && tRpc.data) {
    teachers = tRpc.data as TeacherRow[];
  } else {
    const tRes = await supabase
      .from("teachers")
      .select("id, business_code, full_name, nickname, login_username, gender, whatsapp, status")
      .eq("tenant_id", tid)
      .order("business_code");
    teachers = (tRes.data ?? []) as TeacherRow[];
    if (tRes.error) console.error("teachers query failed:", tRes.error.message);
  }

  const { data: halaqahRows } = await supabase
    .from("halaqahs")
    .select("id, name, status")
    .eq("tenant_id", tid)
    .order("name");

  const [{ data: halaqahTeachers }, { data: activeMembers }] = await Promise.all([
    supabase.from("halaqah_teachers").select("halaqah_id, teacher_id").eq("tenant_id", tid),
    supabase.from("halaqah_students").select("halaqah_id, student_id").eq("tenant_id", tid).is("left_at", null),
  ]);

  const halaqahName = new Map((halaqahRows ?? []).map((h) => [h.id as string, h.name as string]));
  // guru -> halaqah diampu
  const byTeacher = new Map<string, { id: string; name: string }[]>();
  for (const a of halaqahTeachers ?? []) {
    const arr = byTeacher.get(a.teacher_id as string) ?? [];
    const name = halaqahName.get(a.halaqah_id as string);
    if (name) arr.push({ id: a.halaqah_id as string, name });
    byTeacher.set(a.teacher_id as string, arr);
  }
  // guru -> jumlah santri binaan (union anggota semua halaqah diampu)
  const binaanCount = new Map<string, Set<string>>();
  for (const a of halaqahTeachers ?? []) {
    const set = binaanCount.get(a.teacher_id as string) ?? new Set<string>();
    for (const m of activeMembers ?? []) {
      if (m.halaqah_id === a.halaqah_id) set.add(m.student_id as string);
    }
    binaanCount.set(a.teacher_id as string, set);
  }

  return (
    <div>
      <PageHeader
        title={`Data ${terms.guru}`}
        description={`Kelola data guru (ustadz/ustadzah) lembaga Anda — termasuk export & import Excel.`}
      />

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <SectionTitle
              tone="amber"
              icon={<Users2 />}
              title={`Daftar ${terms.guru}`}
              description={`${teachers?.length ?? 0} ${terms.guru.toLowerCase()} terdaftar`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <ImportDialog kind="guru" lembaga={lembaga} halaqahHint={[]} />
              <ExportButton
                kind="guru"
                lembaga={lembaga}
                tahunAjaran={tahunAjaran}
                rows={(teachers ?? []).map((t) => ({
                  A: "",
                  B: t.full_name,
                  C: (t as { nickname?: string | null }).nickname ?? t.full_name.split(" ")[0],
                  F: t.gender,
                  H: t.whatsapp ?? "",
                  I: (t as { login_username?: string | null }).login_username ?? "",
                }))}
              />
              <TeacherDialog />
            </div>
          </div>

          {teachers && teachers.length > 0 ? (
            <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <ColoredHead index={0} label="No." className="w-10 px-2" />
                  <ColoredHead index={1} label="Nama" className="w-[22%] px-3" />
                  <ColoredHead index={3} label="Username / WA" className="w-[16%]" />
                  <ColoredHead index={4} label="Gender" className="w-16" />
                  <ColoredHead index={6} label="Status" className="w-20" />
                  <ColoredHead index={7} label="Halaqah Diampu" className="w-[24%] whitespace-normal" />
                  <TableHead className="w-16 px-3 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(teachers as TeacherRow[]).map((t, i) => {
                  const subs = byTeacher.get(t.id) ?? [];
                  const binaan = binaanCount.get(t.id)?.size ?? 0;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="tabular px-2 text-muted-foreground text-xs">{i + 1}</TableCell>
                      <TableCell className="px-3 whitespace-normal">
                        <div className="flex items-center gap-2">
                          <span className="bg-role-soft text-role-strong flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                            {t.full_name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                          <div className="min-w-0 leading-tight">
                            <p className="truncate font-medium">{t.full_name}</p>
                            {t.nickname ? (
                              <p className="text-muted-foreground truncate text-xs">{t.nickname}</p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <p className="font-mono text-xs">{t.login_username ?? "—"}</p>
                        <p className="text-muted-foreground text-xs">{t.whatsapp ?? "—"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.gender === "L" ? "info" : "violet"}>{genderLabel(t.gender)}</Badge>
                      </TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap items-center gap-1">
                          {subs.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <>
                              <Badge variant="role" className="font-medium">{subs.length} halaqah • {binaan} santri</Badge>
                              <span className="text-muted-foreground text-xs">
                                {subs.map((s) => s.name).join(", ")}
                              </span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-3">
                        <div className="flex items-center justify-end gap-1">
                          <TeacherDialog
                            teacher={{
                              id: t.id,
                              full_name: t.full_name,
                              nickname: t.nickname,
                              gender: t.gender,
                              whatsapp: t.whatsapp,
                              status: t.status,
                              login_username: t.login_username,
                            }}
                          />
                          <DeleteRowButton kind="teacher" id={t.id} name={t.full_name} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Users2 /></EmptyMedia>
                <EmptyTitle>Belum ada data guru.</EmptyTitle>
                <EmptyDescription>
                  Tambahkan lewat tombol Tambah, atau import dari file Excel.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** ------------------------------------------------------------ DATA SANTRI */
type StudentRow = {
  id: string;
  business_code: string;
  nis: string | null;
  nisn: string | null;
  full_name: string;
  nickname: string | null;
  gender: "L" | "P";
  status: "ACTIVE" | "INACTIVE";
  guardian_name: string | null;
  guardian_whatsapp: string | null;
  login_username: string | null;
};

/** V12.13 — ukuran halaman tabel Data Santri (daftar terbesar di aplikasi). */
const SANTRI_PAGE_SIZE = 50;

export async function SantriManager({
  page = 1,
  basePath,
}: {
  page?: number;
  basePath: string;
}) {
  const base = await loadBase();
  if (!base) return null;
  const { supabase, tid, terms, lembaga, tahunAjaran, halaqahHint, halaqahRows } = base;

  // V12 FIX: semua santri lembaga TANPA memandang halaqah — santri yang belum
  // ditempatkan di halaqah mana pun wajib tetap tampil di Data Santri.
  // Data diambil lewat RPC SECURITY DEFINER `students_manager_list` yang
  // tidak bergantung pada policy SELECT students di database; bila RPC belum
  // tersedia (migration belum di-push), fallback ke query langsung tenant-
  // scoped (RLS tetap berlaku, tanpa penurunan keamanan).
  let students: StudentRow[] | null = null;
  let halaqahOf = new Map<string, string>();
  let halaqahName = new Map<string, string>();

  const rpc = await supabase.rpc("students_manager_list");
  if (!rpc.error && rpc.data) {
    students = (rpc.data as {
      id: string; business_code: string; nis: string | null; nisn: string | null;
      full_name: string; nickname: string | null; gender: "L" | "P";
      status: "ACTIVE" | "INACTIVE"; guardian_name: string | null;
      guardian_whatsapp: string | null; login_username: string | null;
      halaqah_id: string | null; halaqah_name: string | null;
    }[]).map((r) => ({
      id: r.id, business_code: r.business_code, nis: r.nis, nisn: r.nisn,
      full_name: r.full_name, nickname: r.nickname, gender: r.gender,
      status: r.status, guardian_name: r.guardian_name,
      guardian_whatsapp: r.guardian_whatsapp, login_username: r.login_username ?? null,
    }));
    for (const r of rpc.data as { id: string; halaqah_id: string | null; halaqah_name: string | null }[]) {
      if (r.halaqah_id) {
        halaqahOf.set(r.id, r.halaqah_id);
        if (r.halaqah_name) halaqahName.set(r.halaqah_id, r.halaqah_name);
      }
    }
  } else {
    const [stuRes, memberRes, halaqahRes] = await Promise.all([
      supabase
        .from("students")
        .select("id, business_code, nis, nisn, full_name, nickname, gender, status, guardian_name, guardian_whatsapp, login_username")
        .eq("tenant_id", tid)
        .order("business_code"),
      supabase.from("halaqah_students").select("halaqah_id, student_id").eq("tenant_id", tid).is("left_at", null),
      supabase.from("halaqahs").select("id, name").eq("tenant_id", tid).order("name"),
    ]);
    students = (stuRes.data ?? []) as StudentRow[];
    for (const m of memberRes.data ?? []) {
      halaqahOf.set(m.student_id as string, m.halaqah_id as string);
    }
    halaqahName = new Map((halaqahRes.data ?? []).map((h) => [h.id as string, h.name as string]));
    if (stuRes.error) console.error("students query failed:", stuRes.error.message);
  }

  const allStudents = students ?? [];
  const totalStudents = allStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalStudents / SANTRI_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  // Tabel dirender per halaman agar DOM tetap ringan di lembaga besar;
  // export Excel tetap memakai seluruh data.
  const pageStudents = allStudents.slice(
    (currentPage - 1) * SANTRI_PAGE_SIZE,
    currentPage * SANTRI_PAGE_SIZE
  );

  return (
    <div>
      <PageHeader
        title={`Data ${terms.santri}`}
        description={`Kelola data ${terms.santri.toLowerCase()} lembaga Anda — termasuk export & import Excel.`}
      />

      <Card className="shadow-card rounded-2xl">
        <CardContent className="px-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <SectionTitle
              tone="emerald"
              icon={<GraduationCap />}
              title={`Daftar ${terms.santri}`}
              description={`${totalStudents} ${terms.santri.toLowerCase()} terdaftar`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <ImportDialog kind="santri" lembaga={lembaga} halaqahHint={halaqahHint} />
              <ExportButton
                kind="santri"
                lembaga={lembaga}
                tahunAjaran={tahunAjaran}
                rows={(students ?? []).map((s) => {
                  const hId = halaqahOf.get(s.id);
                  const hCode = hId ? halaqahRows.find((h) => h.id === hId)?.business_code ?? "" : "";
                  return {
                    A: s.nis ?? "",
                    B: s.nisn ?? "",
                    C: s.full_name,
                    D: s.nickname ?? "",
                    E: s.gender,
                    F: s.guardian_name ?? "",
                    G: hCode,
                    H: s.guardian_whatsapp ?? "",
                  };
                })}
              />
              <StudentDialog />
            </div>
          </div>

          {students && totalStudents > 0 ? (
            <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <ColoredHead index={0} label="No." className="w-10 px-2" />
                    <ColoredHead index={1} label="NIS / NISN" className="w-24" />
                    <ColoredHead index={3} label="Nama" className="w-[22%] px-3" />
                    <ColoredHead index={5} label="Gender" className="w-16" />
                    <ColoredHead index={6} label={terms.halaqah} className="w-[16%] whitespace-normal" />
                    <ColoredHead index={7} label="Wali" className="w-[18%] whitespace-normal" />
                    <ColoredHead index={9} label="Username" className="w-24" />
                    <TableHead className="w-16 px-3 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageStudents.map((s, i) => {
                    const hId = halaqahOf.get(s.id);
                    const hName = hId ? halaqahName.get(hId) ?? null : null;
                    return (
                    <TableRow key={s.id}>
                      <TableCell className="px-2 text-muted-foreground text-xs">
                        {(currentPage - 1) * SANTRI_PAGE_SIZE + i + 1}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <p className="font-mono text-xs text-muted-foreground">{s.nis ?? "—"}</p>
                        <p className="font-mono text-xs text-muted-foreground/80">{s.nisn ?? "—"}</p>
                      </TableCell>
                      <TableCell className="px-3 whitespace-normal">
                        <div className="flex items-center gap-2">
                          <span className="bg-role-soft text-role-strong flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                            {s.full_name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                          <div className="min-w-0 leading-tight">
                            <p className="truncate font-medium">{s.full_name}</p>
                            {s.nickname ? (
                              <p className="text-muted-foreground truncate text-xs">{s.nickname}</p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.gender === "L" ? "info" : "violet"}>{genderLabel(s.gender)}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {hName ? (
                          <Badge variant="role" className="font-medium">{hName}</Badge>
                        ) : (
                          <Badge variant="warning" className="text-[0.75rem] font-medium">
                            Belum ada {terms.halaqah.toLowerCase()}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {s.guardian_name ? (
                          <div className="leading-tight">
                            <p className="truncate text-sm text-foreground/85">{s.guardian_name}</p>
                            {s.guardian_whatsapp ? (
                              <p className="mt-0.5 font-mono text-[0.7rem] text-muted-foreground/80">{s.guardian_whatsapp}</p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-normal">{s.login_username ?? "—"}</TableCell>
                      <TableCell className="px-3">
                        <div className="flex items-center justify-end gap-1">
                          <StudentDialog
                            student={{
                              id: s.id,
                              full_name: s.full_name,
                              nickname: s.nickname,
                              gender: s.gender,
                              status: s.status,
                              nis: s.nis,
                              nisn: s.nisn,
                              guardian_name: s.guardian_name,
                              guardian_whatsapp: s.guardian_whatsapp,
                              login_username: s.login_username,
                            }}
                          />
                          <WaChatButton
                            number={s.guardian_whatsapp}
                            studentName={s.full_name}
                            senderLabel="koordinator/admin lembaga"
                          />
                          <DeleteRowButton kind="student" id={s.id} name={s.full_name} />
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GraduationCap /></EmptyMedia>
                <EmptyTitle>Belum ada data santri.</EmptyTitle>
                <EmptyDescription>
                  Tambahkan lewat tombol Tambah, atau import dari file Excel.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <p className="text-muted-foreground text-xs">
                Halaman {currentPage} dari {totalPages} · {SANTRI_PAGE_SIZE} baris per halaman
              </p>
              <div className="flex items-center gap-1.5">
                {currentPage > 1 && (
                  <Link
                    href={`${basePath}?page=${currentPage - 1}`}
                    className="rounded-lg border px-3 py-1.5 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted/50"
                  >
                    ← Sebelumnya
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={`${basePath}?page=${currentPage + 1}`}
                    className="rounded-lg border px-3 py-1.5 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted/50"
                  >
                    Berikutnya →
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
