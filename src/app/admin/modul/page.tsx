import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/section";
import { requireRole } from "@/lib/auth";
import { getCustomModules } from "@/lib/custom-module";
import { CustomModuleManager } from "@/components/akademik/custom-module-manager";

export const metadata = { title: "Modul" };

/** TAHFIZH V58 — Kelola modul kustom lembaga (di luar modul bawaan). */
export default async function AdminModulPage() {
  await requireRole(["ADMIN", "KOORDINATOR"], "/admin/modul");
  const modules = await getCustomModules(true);

  return (
    <div>
      <PageHeader
        title="Modul"
        description="Tambah modul milik lembaga di luar modul bawaan (Tahfidz, Tugas, Hadits, Doa, Tajwid) — modul ini langsung tampil di dasbor santri."
      />
      <CustomModuleManager modules={modules} />
    </div>
  );
}
