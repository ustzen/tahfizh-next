"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * V12.13 — Lapor error otomatis dari halaman error.tsx.
 *
 * Bila pengguna masih punya sesi, laporan dikirim ke modul Kritik & Saran
 * lewat RPC SECURITY DEFINER `feedback_submit` (kategori LAPORAN_ERROR,
 * tujuan DEVELOPER) sehingga langsung muncul di daftar Admin/Developer —
 * lengkap dengan kode digest untuk pencocokan log server. Pengunjung tanpa
 * sesi cukup diberi tahu kode laporannya.
 */

export type ErrorReportResult = { ok: boolean; msg: string };

export async function reportErrorAction(input: {
  digest: string | null;
  message: string;
  page: string | null;
}): Promise<ErrorReportResult> {
  const session = await getSessionProfile();
  const digestLine = input.digest ? `Kode laporan: ${input.digest}.` : "";
  const fallback = {
    ok: false,
    msg: input.digest
      ? `Laporan tidak terkirim. Cantumkan kode ${input.digest} saat menghubungi Admin.`
      : "Laporan tidak terkirim. Silakan hubungi Admin lembaga.",
  };

  if (!session) return fallback;

  const content = [
    "Laporan otomatis dari halaman error.",
    digestLine,
    `Halaman: ${input.page ?? "-"}`,
    `Pesan teknis: ${String(input.message).slice(0, 500)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const supabase = await createClient();
  const { error } = await supabase.rpc("feedback_submit", {
    p_category: "LAPORAN_ERROR",
    p_target: "DEVELOPER",
    p_title: `[Auto] Kendala di ${input.page ?? "aplikasi"}${input.digest ? ` (${input.digest})` : ""}`,
    p_content: content,
    p_teacher_id: null,
    p_anonymous: false,
    p_page_url: input.page,
    p_steps: null,
  });
  if (error) {
    console.error("[reportErrorAction]", error.message);
    return fallback;
  }

  return {
    ok: true,
    msg: "Laporan terkirim ke pengelola. Terima kasih — tim kami akan menindaklanjuti.",
  };
}
