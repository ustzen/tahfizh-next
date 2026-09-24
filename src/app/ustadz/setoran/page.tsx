import { cleanNis } from "@/lib/nis";
import { Mic } from "lucide-react";

import { requireRole } from "@/lib/auth";
import {
  getSetoranTeacherForSession,
  getSetoranModuleConfig,
  type SetoranModuleTab,
} from "@/lib/setoran";
import { getTerminology } from "@/lib/terminology";
import { PageHeader } from "@/components/dashboard/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetoranDirectForm } from "@/app/ustadz/setoran/setoran-direct-form";

export const metadata = { title: "Setoran" };

/**
 * TAHFIZH V12.12 — Menu Setoran LANGSUNG menampilkan form "Setoran Hafalan"
 * (3 tab: Tahfidz Al-Qur'an / Hadits / Doa Harian) — tanpa daftar santri
 * terlebih dahulu. Guru memilih santri di dalam form; setoran tersimpan ke
 * modul terkait dan langsung sinkron ke menu modul + dasbor wali murid.
 */
export default async function UstadzSetoranPage() {
  const profile = await requireRole(["USTADZ"], "/ustadz/setoran");
  const terms = await getTerminology(profile.tenantId);
  const { teacher, surahs } = await getSetoranTeacherForSession();

  // Konfigurasi 3 tab: daftar pilihan + template catatan per modul.
  const [tahfidz, hadits, doa] = await Promise.all([
    profile.tenantId ? getSetoranModuleConfig(profile.tenantId, "TAHFIDZ" as SetoranModuleTab) : null,
    profile.tenantId ? getSetoranModuleConfig(profile.tenantId, "HADITS" as SetoranModuleTab) : null,
    profile.tenantId ? getSetoranModuleConfig(profile.tenantId, "DOA" as SetoranModuleTab) : null,
  ]);

  // Daftar santri binaan (via view teacher_students = halaqah yang diampu).
  const students = teacher ? await getBinaanStudents(teacher.id) : [];

  return (
    <div>
      <PageHeader
        title="Setoran"
        description={`Catat setoran hafalan ${terms.santri.toLowerCase()} halaqah Anda — nilai otomatis tersinkron ke menu modul terkait & dasbor wali murid.`}
      />

      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-role-soft text-role-strong">
              <Mic className="size-5" />
            </span>
            Setoran Hafalan
          </CardTitle>
          <CardDescription>
            Khusus setoran hafalan. Nilai otomatis tersinkron ke menu Hafalan terkait & dasbor Wali Murid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetoranDirectForm
            students={students}
            surahs={surahs.length > 0 ? surahs : tahfidz?.surahs ?? []}
            haditsMaterials={hadits?.materials ?? []}
            doaMaterials={doa?.materials ?? []}
            defaultMode={tahfidz?.mode ?? hadits?.mode ?? "CENTANG"}
            grades={tahfidz?.grades ?? hadits?.grades ?? []}
            templatesByTab={{
              TAHFIDZ: tahfidz?.templates ?? [],
              HADITS: hadits?.templates ?? [],
              DOA: doa?.templates ?? [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Santri binaan guru (binaan via halaqah) — untuk dropdown "Pilih Santri". */
async function getBinaanStudents(teacherId: string): Promise<{ id: string; name: string; code: string | null }[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_students")
    .select("student_id, students(nis, business_code, full_name)")
    .eq("teacher_id", teacherId);
  if (error) {
    console.error("setoran binaan list failed:", error.message);
    return [];
  }
  const seen = new Set<string>();
  const out: { id: string; name: string; code: string | null }[] = [];
  for (const r of data ?? []) {
    const s = r.students as unknown as { nis: string | null; business_code: string | null; full_name: string } | null;
    if (!s || seen.has(r.student_id)) continue;
    seen.add(r.student_id);
    out.push({ id: r.student_id, name: s.full_name, code: cleanNis(s.nis, s.business_code) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
