import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { getAcademicYears, getEnrollments } from "@/lib/akademik";
import { createClient } from "@/lib/supabase/server";

/**
 * TAHFIZH V11 — Year archive export (#64/#65). CSV with the standard file
 * name format: "Data Santri <Lembaga> Tahun Ajaran <2026/2027>.csv".
 * Read path is RLS-scoped to the admin's own tenant.
 */
export async function GET(request: Request) {
  const profile = await requireRole(["ADMIN"], "/admin/akademik/arsip");
  const yearId = new URL(request.url).searchParams.get("year") ?? "";

  const supabase = await createClient();
  const [{ data: tenant }, years] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", profile.tenantId!).single(),
    getAcademicYears(),
  ]);

  const year = years.find((y) => y.id === yearId);
  if (!year) {
    return NextResponse.json({ error: "Tahun ajaran tidak ditemukan." }, { status: 404 });
  }

  const enrollments = await getEnrollments(year.id);

  const header = "ID Santri,Nama,Halaqah,Level";
  const lines = enrollments.map((e) =>
    [e.studentCode, e.studentName, e.halaqahName ?? "", e.level ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");

  const tenantName = tenant?.name ?? "Lembaga";
  const fileName = `Data Santri ${tenantName} Tahun Ajaran ${year.name}.csv`
    .replace(/[/\\?%*:|"<>]/g, "-");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
