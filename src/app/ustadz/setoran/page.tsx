import { cleanNis, compareByNis } from "@/lib/nis";
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

  const { data: links, error } = await supabase
    .from("teacher_students")
    .select("student_id")
    .eq("teacher_id", teacherId);
  if (error) {
    console.error("setoran binaan list failed:", error.message);
    return [];
  }
  const ids = Array.from(new Set((links ?? []).map((r) => r.student_id as string)));
  if (ids.length === 0) return [];

  // NIS diambil langsung dari tabel students (NIS lembaga), bukan business_code.
  const { data: studs, error: studErr } = await supabase
    .from("students")
    .select("id, nis, business_code, full_name")
    .in("id", ids);
  if (studErr) {
    console.error("setoran binaan students failed:", studErr.message);
    return [];
  }
  const out = (studs ?? []).map((s) => ({
    id: s.id as string,
    name: s.full_name as string,
    code: cleanNis(s.nis as string | null, s.business_code as string | null),
  }));
  out.sort((a, b) => compareByNis({ nis: a.code, name: a.name }, { nis: b.code, name: b.name }));
  return out;
}
