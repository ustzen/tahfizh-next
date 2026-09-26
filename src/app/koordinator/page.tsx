import { ArrowRight, GraduationCap, LayoutDashboard, Lightbulb } from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { QuickMenuEditorButton, QuickMenuGrid } from "@/components/dashboard/quick-menu-editor";
import { genderLabel } from "@/lib/roles";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTerminology } from "@/lib/terminology";
import { getMenuIconOverrides } from "@/lib/menu-icon-overrides";
import { KOORDINATOR_QUICK_MENU, KOORDINATOR_QUICK_MENU_DEFAULT_KEYS, resolveQuickMenu } from "@/lib/quick-menu";

export const metadata = { title: "Koordinator Dashboard" };

async function getDashboardQuickMenuOrder(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("dashboard_quick_menu")
    .eq("id", userId)
    .single();
  return (data?.dashboard_quick_menu as string[] | null) ?? null;
}

type StudentRow = {
  id: string;
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

export default async function KoordinatorDashboardPage() {
  const profile = await requireRole(["KOORDINATOR"], "/koordinator");
  const supabase = await createClient();
  const tid = profile.tenantId!;
  const terms = await getTerminology(tid);

  const [{ count: teacherCount }, { count: studentCount }, { count: activeTeacherCount }, { count: activeStudentCount }, { count: halaqahCount }, { count: presentToday }, rpc, savedQuickMenu, iconOverrides] =
    await Promise.all([
      supabase.from("teachers").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
      supabase.from("students").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
      supabase.from("teachers").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("status", "ACTIVE"),
      supabase.from("students").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("status", "ACTIVE"),
      // V8 (rule #40)
      supabase.from("halaqahs").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("status", "ACTIVE"),
      supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tid)
        .eq("status", "HADIR")
        .gte("created_at", new Date().toISOString().slice(0, 10)),
      // V12.1: data santri lengkap untuk tabel dasbor (RPC security definer).
      supabase.rpc("students_manager_list"),
      // V31: preferensi Menu Cepat (urutan + tampil/sembunyi) per akun.
      getDashboardQuickMenuOrder(profile.id),
      // V39: override ikon menu platform.
      getMenuIconOverrides(),
    ]);

  const visibleQuickMenu = resolveQuickMenu(KOORDINATOR_QUICK_MENU, savedQuickMenu, KOORDINATOR_QUICK_MENU_DEFAULT_KEYS);
  // Set 8 item bawaan (sebelum koordinator mengatur), dipakai editor untuk "Kembalikan Default".
  const defaultQuickMenu = resolveQuickMenu(KOORDINATOR_QUICK_MENU, null, KOORDINATOR_QUICK_MENU_DEFAULT_KEYS);

  const students: StudentRow[] = rpc.error
    ? []
    : ((rpc.data ?? []) as (StudentRow & { halaqah_name: string | null })[]).map((r) => ({
        id: r.id,
        nis: r.nis,
        nisn: r.nisn,
        full_name: r.full_name,
        nickname: r.nickname,
        gender: r.gender,
        status: r.status,
        guardian_name: r.guardian_name,
        guardian_whatsapp: r.guardian_whatsapp,
        halaqah_name: r.halaqah_name,
      }));
  if (rpc.error) console.error("[students_manager_list]", rpc.error.message);

  return (
    <div>
      <PageHeader
        title={`Assalamu'alaikum, ${profile.fullName.split(" ")[0]} 👋`}
        description="Ringkasan guru dan santri lembaga Anda."
        icon={<LayoutDashboard className="size-6" />}
        action={
          <Button asChild variant="role">
            <Link href="/koordinator/guru">Kelola Data Guru</Link>
          </Button>
        }
      />

      {/* Menu Cepat (V31 — dapat diatur ulang & disembunyikan per akun) */}
      <CardBox className="mb-6">
        <SectionTitle
          tone="emerald"
          icon={<LayoutDashboard />}
          title="Menu Cepat"
          description="Akses langsung ke semua modul yang Anda gunakan sehari-hari."
          action={
            <QuickMenuEditorButton
              defaults={KOORDINATOR_QUICK_MENU}
              visible={visibleQuickMenu}
              defaultVisible={defaultQuickMenu}
              iconOverrides={iconOverrides}
            />
          }
        />
        <QuickMenuGrid items={visibleQuickMenu} iconOverrides={iconOverrides} />
      </CardBox>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="teacher" label="Total Guru" value={teacherCount ?? 0} hint={`${activeTeacherCount ?? 0} aktif`} />
        <StatCard
          icon="student"
          label="Total Santri"
          value={studentCount ?? 0}
          hint={`${activeStudentCount ?? 0} aktif`}
          progress={studentCount ? ((activeStudentCount ?? 0) / studentCount) * 100 : 0}
        />
        <StatCard icon="people" label="Rasio" value={teacherCount ? Math.round((studentCount ?? 0) / teacherCount) : "—"} hint="santri per guru" />
        <StatCard icon="tenant" label="Lembaga" value={profile.tenantName ?? "-"} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* V8 (rule #40): total halaqah + kehadiran hari ini (tanpa supervisi, rule #61) */}
        <StatCard icon="halaqah" label="Total Halaqah" value={halaqahCount ?? 0} hint="aktif" />
        <StatCard icon="attendance" label="Kehadiran Hari Ini" value={presentToday ?? 0} hint="santri hadir" />
        <StatCard
          icon="inactive"
          label="Santri Nonaktif"
          value={(studentCount ?? 0) - (activeStudentCount ?? 0)}
          hint="perlu ditinjau"
        />
        <StatCard
          icon="unpaid"
          label="Guru Nonaktif"
          value={(teacherCount ?? 0) - (activeTeacherCount ?? 0)}
          hint="tidak mengajar"
        />
      </div>

      {/* V12.1 — Data Santri di dasbor koordinator (kolom lengkap). */}
      <Card className="shadow-card mt-6 rounded-2xl">
        <CardContent className="px-0 py-0">
          <SectionTitle
            className="px-5 py-4"
            tone="emerald"
            icon={<GraduationCap />}
            title={`Data ${terms.santri}`}
            description={`${students.length} ${terms.santri.toLowerCase()} terdaftar`}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/koordinator/santri">Kelola Data {terms.santri}</Link>
              </Button>
            }
          />
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
                    <TableHead className="px-5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s, i) => (
                    <TableRow key={s.id}>
                      <TableCell className="tabular px-3 text-muted-foreground text-xs">{i + 1}</TableCell>
                      <TableCell className="px-5 font-mono text-xs text-muted-foreground">{s.nis ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.nisn ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="bg-role-soft text-role-strong flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                            {s.full_name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                          <span className="font-medium">{s.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.nickname ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.gender === "L" ? "info" : "violet"}>{genderLabel(s.gender)}</Badge>
                      </TableCell>
                      <TableCell>
                        {s.halaqah_name ? (
                          <Badge variant="role" className="font-medium">{s.halaqah_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.guardian_name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.guardian_whatsapp ?? "—"}</TableCell>
                      <TableCell className="px-5"><StatusBadge status={s.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground px-5 pb-5 text-sm">
              Belum ada data {terms.santri.toLowerCase()} — tambahkan lewat menu Data {terms.santri}.
            </p>
          )}
        </CardContent>
      </Card>

      <CardBox className="mt-6">
        <SectionTitle
          tone="amber"
          icon={<Lightbulb />}
          title="Alur kerja yang disarankan"
          description="Urutan singkat agar data rapi dan mudah dipantau"
        />
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { t: `Lengkapi data ${terms.guru.toLowerCase()} & ${terms.santri.toLowerCase()}`, d: "Tambah manual atau impor dari Excel.", href: "/koordinator/guru", tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
            { t: `Susun ${terms.halaqah.toLowerCase()}`, d: `Tetapkan pengampu dan anggota ${terms.santri.toLowerCase()}.`, href: "/koordinator/halaqah", tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
            { t: "Pantau perkembangan", d: "Lihat riwayat dan cetak raport.", href: "/koordinator/perkembangan", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
          ].map((x, i) => (
            <li key={x.t}>
              <Link href={x.href} className="hover:bg-muted/50 group flex h-full gap-3 rounded-xl border p-3.5 transition-colors">
                <span className={"flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold " + x.tone}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{x.t}</span>
                  <span className="text-muted-foreground block text-xs">{x.d}</span>
                  <span className="text-role-strong mt-1 inline-flex items-center gap-1 text-xs font-semibold">
                    Buka <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CardBox>
    </div>
  );
}
