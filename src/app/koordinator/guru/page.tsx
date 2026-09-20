import { requireRole } from "@/lib/auth";
import { GuruManager } from "@/app/koordinator/guru-santri/manager";

// Import Excel membuat akun login satu per satu (Supabase Auth) — beri ruang
// waktu lebih panjang untuk server action import yang dipanggil dari halaman ini.
export const maxDuration = 60;

export const metadata = { title: "Data Guru" };

/** TAHFIZH V12 — menu Data Guru (terpisah dari Data Santri). */
export default async function KoordinatorGuruPage() {
  await requireRole(["KOORDINATOR"], "/koordinator/guru");
  return <GuruManager />;
}
