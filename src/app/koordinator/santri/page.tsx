import { requireRole } from "@/lib/auth";
import { SantriManager } from "@/app/koordinator/guru-santri/manager";

// Import Excel membuat akun login satu per satu (Supabase Auth) — beri ruang
// waktu lebih panjang untuk server action import yang dipanggil dari halaman ini.
export const maxDuration = 60;

export const metadata = { title: "Data Santri" };

/** TAHFIZH V12 — menu Data Santri (terpisah dari Data Guru). */
export default async function KoordinatorSantriPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole(["KOORDINATOR"], "/koordinator/santri");
  const { page } = await searchParams;
  return <SantriManager page={Number(page) || 1} basePath="/koordinator/santri" />;
}
